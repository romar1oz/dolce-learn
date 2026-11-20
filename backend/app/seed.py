"""Seed-скрипт демонстрационных данных Dolce Learn. Идемпотентен: повторный запуск не создаёт дублей.

Все люди, подразделения и документы — вымышленные. Пароль демо-аккаунтов берётся из SEED_DEMO_PASSWORD
и предназначен ТОЛЬКО для локальной демонстрации.

Запуск: python -m app.seed
"""
import hashlib
import io
import random
import shutil
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models import (
    AnswerOption,
    AssessmentProtocol,
    Category,
    Competency,
    CompetencyAssessment,
    CompetencyQuestion,
    CompetencyReviewer,
    CompetencyScore,
    Course,
    CourseAssignment,
    CourseModule,
    Department,
    DialogueCharacter,
    DialogueChoice,
    DialogueNode,
    DialogueScenario,
    LearningEvent,
    Lesson,
    LessonMaterial,
    LessonProgress,
    LibraryMaterial,
    MediaFile,
    Question,
    Role,
    Test,
    TestAttempt,
    User,
)
from app.security.tokens import hash_password
from app.services import pdf as pdfmod
from app.services.grading import submit_attempt
from app.services.progress import recompute_course

ASSETS = Path(__file__).resolve().parent / "assets" / "demo"
UTC = timezone.utc
rnd = random.Random(2026)

ROLES = [("super_admin", "Super Admin", "Полный контроль над платформой"),
         ("methodist", "Администратор / Методист", "Создание курсов, тестов, назначения, отчёты"),
         ("manager", "Руководитель подразделения", "Контроль обучения сотрудников подразделения"),
         ("employee", "Сотрудник", "Обучение и аттестация")]

DEPARTMENTS = [("PRD-SOL", "Цех твёрдых лекарственных форм", "Таблетирование, капсулирование, упаковка"),
               ("PRD-STR", "Цех стерильных лекарственных форм", "Ампулы и инфузионные растворы"),
               ("QC", "Отдел контроля качества", "Лаборатория ОКК"),
               ("WH", "Склад и логистика", "Приёмка, хранение, отгрузка"),
               ("ENG", "Инженерная служба", "Оборудование, HVAC, водоподготовка"),
               ("TRN", "Учебный центр", "Обучение и аттестация персонала")]

DEMO_USERS = [("admin@dolce.local", "Администратор Системы (демо)", "super_admin", "TRN", "Администратор LMS", "D-0001"),
              ("methodist@dolce.local", "Сейтказиева Алия (демо-методист)", "methodist", "TRN", "Методист учебного центра", "D-0002"),
              ("manager@dolce.local", "Жумабеков Ерлан (демо-руководитель)", "manager", "PRD-SOL", "Начальник цеха ТЛФ", "D-0003"),
              ("employee@dolce.local", "Ким Дмитрий (демо-сотрудник)", "employee", "PRD-SOL", "Оператор таблеточного пресса", "D-0004")]

SYNTH = [("Абдрахманова Динара", "PRD-SOL", "Оператор упаковочной линии"),
         ("Ибраев Нурлан", "PRD-SOL", "Оператор гранулятора"),
         ("Петрова Ольга", "PRD-SOL", "Укладчик-упаковщик"),
         ("Садыков Арман", "PRD-STR", "Оператор автоклава"),
         ("Нуриева Камила", "PRD-STR", "Аппаратчик стерилизации"),
         ("Волков Сергей", "PRD-STR", "Оператор линии розлива"),
         ("Тулегенова Айгерим", "QC", "Химик-аналитик"),
         ("Ли Виктория", "QC", "Микробиолог"),
         ("Оспанов Бауыржан", "WH", "Кладовщик"),
         ("Смагулов Тимур", "WH", "Водитель погрузчика"),
         ("Ковалёва Анна", "ENG", "Инженер HVAC"),
         ("Есенов Максат", "ENG", "Слесарь-ремонтник"),
         ("Мухамеджанова Сауле", "QC", "Начальник ОКК")]


def ensure_role(db, code, name, desc):
    r = db.scalar(select(Role).where(Role.code == code))
    if r is None:
        r = Role(code=code, name=name, description=desc)
        db.add(r)
        db.flush()
    return r


def store_file(db: Session, src_bytes: bytes, name: str, kind: str, mime: str, title: str, uploader: int | None,
               description: str | None = None, duration: float | None = None) -> MediaFile:
    sha = hashlib.sha256(src_bytes).hexdigest()
    existing = db.scalar(select(MediaFile).where(MediaFile.sha256 == sha, MediaFile.original_name == name))
    if existing:
        return existing
    mid = str(uuid.uuid4())
    rel = Path("media") / "seed" / f"{mid}{Path(name).suffix}"
    dest = settings.storage_path / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(src_bytes)
    m = MediaFile(id=mid, kind=kind, original_name=name, stored_path=str(rel), mime_type=mime,
                  size_bytes=len(src_bytes), sha256=sha, title=title, description=description, duration_sec=duration,
                  uploaded_by=uploader)
    db.add(m)
    db.flush()
    return m


def make_pdf(title: str, code: str, sections: list[tuple[str, list[str]]]) -> bytes:
    pdfmod._fonts()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm,
                            bottomMargin=18 * mm, title=title)
    base = ParagraphStyle("b", fontName="DejaVu", fontSize=10.5, leading=15)
    h1 = ParagraphStyle("h1", parent=base, fontName="DejaVu-Bold", fontSize=16, leading=21, textColor=pdfmod.DARK)
    h2 = ParagraphStyle("h2", parent=base, fontName="DejaVu-Bold", fontSize=12, leading=17, spaceBefore=8,
                        textColor=pdfmod.DARK)
    small = ParagraphStyle("s", parent=base, fontSize=8.5, textColor=pdfmod.MUTED)
    story = [Paragraph(f"Dolce Pharm · {code} · учебный документ (синтетический пример)", small), Spacer(1, 4 * mm),
             Paragraph(title, h1), Spacer(1, 4 * mm)]
    for head, items in sections:
        story.append(Paragraph(head, h2))
        story.append(ListFlowable([ListItem(Paragraph(i, base), leftIndent=12) for i in items], bulletType="1",
                                  bulletFontName="DejaVu"))
    story += [Spacer(1, 8 * mm), Paragraph("Документ создан для демонстрации Dolce Learn и не является "
                                           "действующим регламентом предприятия.", small)]
    doc.build(story)
    return buf.getvalue()


def make_checklist_xlsx() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Чек-лист"
    ws.append(["№", "Действие при входе в чистую зону", "Выполнено (да/нет)", "Подпись"])
    for i, t in enumerate(["Снять верхнюю одежду и украшения", "Вымыть и высушить руки",
                           "Надеть бахилы, перешагивая скамью", "Надеть комбинезон и шапочку",
                           "Надеть маску и перчатки", "Обработать перчатки антисептиком",
                           "Проверить показания перепада давления", "Пройти шлюз после закрытия двери"], 1):
        ws.append([i, t, "", ""])
    ws.column_dimensions["B"].width = 48
    ws.column_dimensions["C"].width = 20
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def add_test(db, title, course, author, questions, pass_score=80, max_attempts=3, time_limit=15,
             show=True) -> Test:
    t = Test(title=title, description=f"Итоговая проверка знаний по курсу «{course.title}»", course_id=course.id,
             pass_score=pass_score, max_attempts=max_attempts, time_limit_minutes=time_limit, shuffle_options=True,
             show_correct_answers=show, status="published", created_by=author.id)
    db.add(t)
    db.flush()
    for pos, (qtype, text, options, explanation) in enumerate(questions, 1):
        q = Question(test_id=t.id, type=qtype, text=text, points=1, explanation=explanation, position=pos)
        items = list(enumerate(options, 1))
        if qtype == "ordering":
            rnd.shuffle(items)
        for opos, (otext, correct) in items:
            q.options.append(AnswerOption(text=otext, is_correct=correct if qtype != "ordering" else False,
                                          position=opos))
        db.add(q)
    db.flush()
    db.refresh(t)
    return t


def build_course(db, *, title, description, category, cover, author, mandatory, status, pass_score, due_days,
                 level, duration, modules, department=None):
    c = Course(title=title, description=description, category_id=category.id, cover_media_id=cover.id if cover else None,
               author_id=author.id, author_name=author.full_name, is_mandatory=mandatory, status=status,
               pass_score=pass_score, due_days=due_days, level=level, duration_minutes=duration,
               publish_date=date.today() - timedelta(days=40), department_id=department.id if department else None)
    db.add(c)
    db.flush()
    for mpos, (mtitle, lessons) in enumerate(modules, 1):
        m = CourseModule(course_id=c.id, title=mtitle, position=mpos)
        db.add(m)
        db.flush()
        for lpos, (ltitle, ldur, blocks) in enumerate(lessons, 1):
            lesson = Lesson(module_id=m.id, title=ltitle, position=lpos, duration_minutes=ldur)
            db.add(lesson)
            db.flush()
            for bpos, b in enumerate(blocks, 1):
                db.add(LessonMaterial(lesson_id=lesson.id, position=bpos, **b))
    db.flush()
    db.refresh(c)
    return c


SAFETY_TEXT = (
    "Цель инструктажа — познакомить вас с основными опасными производственными факторами и правилами безопасной "
    "работы на участках Dolce Pharm.\n\n"
    "**Основные правила**\n"
    "- Работайте только на том оборудовании, к которому допущены.\n"
    "- Используйте средства индивидуальной защиты (СИЗ), положенные для участка.\n"
    "- Не снимайте защитные ограждения и не блокируйте датчики.\n"
    "- О любой неисправности сообщайте мастеру смены до начала работы.\n\n"
    "**При несчастном случае** окажите первую помощь, вызовите мастера и сохраните обстановку, если это не "
    "угрожает людям."
)


def seed(db: Session) -> None:
    roles = {code: ensure_role(db, code, name, desc) for code, name, desc in ROLES}
    deps = {}
    for code, name, desc in DEPARTMENTS:
        d = db.scalar(select(Department).where(Department.code == code))
        if d is None:
            d = Department(code=code, name=name, description=desc)
            db.add(d)
            db.flush()
        deps[code] = d
    pwd_hash = hash_password(settings.seed_demo_password)
    users = {}
    for i, (email, name, role, dep, pos, num) in enumerate(DEMO_USERS):
        u = db.scalar(select(User).where(User.email == email))
        if u is None:
            u = User(email=email, full_name=name, password_hash=pwd_hash, role_id=roles[role].id,
                     department_id=deps[dep].id, position=pos, employee_number=num)
            db.add(u)
            db.flush()
        users[email] = u
    synth = []
    for i, (name, dep, pos) in enumerate(SYNTH, 1):
        email = f"user{i:02d}@dolce.local"
        u = db.scalar(select(User).where(User.email == email))
        if u is None:
            role = "manager" if pos.startswith("Начальник") else "employee"
            u = User(email=email, full_name=name, password_hash=pwd_hash, role_id=roles[role].id,
                     department_id=deps[dep].id, position=pos, employee_number=f"E-{1000 + i}")
            db.add(u)
            db.flush()
        synth.append(u)
    deps["PRD-SOL"].manager_id = users["manager@dolce.local"].id
    deps["QC"].manager_id = synth[-1].id
    db.flush()

    if db.scalar(select(Course).limit(1)) is not None:
        db.commit()
        print("Seed: базовые справочники и пользователи проверены; учебный контент уже существует — пропуск.")
        return

    methodist = users["methodist@dolce.local"]
    cats = {}
    for name, kind in [("Охрана труда", "course"), ("СОП", "course"), ("GMP и производство", "course"),
                       ("Качество", "course"), ("Soft skills", "course"), ("Инструкции", "library"),
                       ("СОП", "library"), ("Нормативные документы", "library"), ("Шаблоны и формы", "library")]:
        c = Category(name=name, kind=kind)
        db.add(c)
        cats[(kind, name)] = c
    db.flush()

    def asset(name, kind, mime, title, desc=None, duration=None):
        return store_file(db, (ASSETS / name).read_bytes(), name, kind, mime, title, methodist.id, desc, duration)

    covers = {k: asset(f"cover_{k}.png", "image", "image/png", f"Обложка: {k}")
              for k in ("safety", "sop", "gmp", "quality", "service")}
    video = asset("demo_test_video.mp4", "video", "video/mp4", "Тестовое видео: порядок надевания СИЗ (демо)",
                  "Синтетический ролик для проверки плеера и офлайн-режима. Замените реальной записью.", 24.0)
    video.thumbnail_id = covers["safety"].id
    pdf_safety = store_file(db, make_pdf("Инструкция по охране труда для операторов производственных участков",
                                         "ИОТ-001", [
        ("1. Общие требования", ["К работе допускаются лица, прошедшие вводный и первичный инструктаж.",
                                 "Работник обязан применять выданные СИЗ и соблюдать правила внутреннего распорядка.",
                                 "Запрещается находиться на участке в состоянии усталости или недомогания."]),
        ("2. Перед началом работы", ["Осмотреть рабочее место и оборудование.",
                                     "Проверить наличие и исправность защитных ограждений и аварийной кнопки.",
                                     "Сообщить мастеру о выявленных неисправностях."]),
        ("3. Во время работы", ["Не отвлекаться и не оставлять работающее оборудование без присмотра.",
                                "Не прикасаться к движущимся частям, не чистить оборудование на ходу.",
                                "Соблюдать требования к обращению с химическими веществами (паспорта безопасности)."]),
        ("4. В аварийной ситуации", ["Остановить оборудование аварийной кнопкой.",
                                     "Сообщить мастеру смены и в службу охраны труда.",
                                     "Оказать первую помощь пострадавшему и вызвать медицинскую помощь (103)."]),
    ]), "iot_001.pdf", "pdf", "application/pdf", "ИОТ-001. Инструкция по охране труда", methodist.id)
    pdf_sop = store_file(db, make_pdf("СОП-014. Порядок входа персонала в чистые помещения классов C и D", "СОП-014", [
        ("1. Назначение", ["Установить единый порядок переодевания и входа в чистые помещения.",
                           "Минимизировать риск контаминации продукта частицами и микроорганизмами."]),
        ("2. Порядок действий", ["Снять верхнюю одежду, украшения и часы в гардеробе.",
                                 "Вымыть руки с мылом не менее 30 секунд и высушить.",
                                 "Надеть бахилы, перешагивая разделительную скамью.",
                                 "Надеть шапочку, комбинезон, маску, затем стерильные перчатки.",
                                 "Обработать перчатки 70% спиртом и пройти шлюз после закрытия предыдущей двери."]),
        ("3. Запрещается", ["Входить в чистую зону с признаками простудного заболевания.",
                            "Открывать одновременно обе двери шлюза.",
                            "Вносить бумагу и предметы, не прошедшие обработку."]),
    ]), "sop_014.pdf", "pdf", "application/pdf", "СОП-014. Вход в чистые помещения", methodist.id)
    xlsx = store_file(db, make_checklist_xlsx(), "checklist_cleanroom.xlsx", "excel",
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                      "Чек-лист входа в чистую зону", methodist.id)
    pdf_gmp = store_file(db, make_pdf("Краткий конспект: принципы GMP", "GMP-01", [
        ("Ключевые принципы", ["Качество закладывается в продукт, а не проверяется в конце.",
                               "Каждый процесс описан, валидирован и выполняется по утверждённым документам.",
                               "Любое отклонение регистрируется и расследуется.",
                               "Персонал обучен и допущен к выполнению операций."]),
        ("ALCOA+", ["Attributable — понятно, кто сделал запись.", "Legible — запись разборчива.",
                    "Contemporaneous — сделана в момент действия.", "Original — первичная запись.",
                    "Accurate — точная и достоверная."]),
    ]), "gmp_summary.pdf", "pdf", "application/pdf", "Конспект: принципы GMP", methodist.id)

    # ---------- диалоговый тренажёр ----------
    sc = DialogueScenario(title="Коллега без маски в чистой зоне", status="published", pass_score=70,
                          description="Отработайте корректную реакцию на нарушение правил асептики.",
                          created_by=methodist.id)
    db.add(sc)
    db.flush()
    op = DialogueCharacter(scenario_id=sc.id, name="Марат", role="Оператор смежной линии", color="#0EA5E9")
    master = DialogueCharacter(scenario_id=sc.id, name="Мастер смены", role="Руководитель", color="#F59E0B")
    db.add_all([op, master])
    db.flush()
    n1 = DialogueNode(scenario_id=sc.id, character_id=op.id, is_start=True, position=0,
                      text="Ты видишь, как Марат заходит в зону класса C со спущенной на подбородок маской. Он говорит: «Да я на минутку, только журнал взять»." )
    n2 = DialogueNode(scenario_id=sc.id, character_id=op.id, position=1,
                      text="Марат: «Ну ладно, сейчас поправлю. Но журнал-то уже тут лежит, что такого?»")
    n3 = DialogueNode(scenario_id=sc.id, character_id=master.id, position=2,
                      text="Мастер смены: «Спасибо, что сообщили. Что нужно сделать с журналом и зоной?»")
    n_end_good = DialogueNode(scenario_id=sc.id, character_id=master.id, is_end=True, position=3,
                              text="Мастер: «Верно. Зафиксируем отклонение, проведём дополнительную уборку. Отличная работа!»")
    n_end_bad = DialogueNode(scenario_id=sc.id, character_id=master.id, is_end=True, position=4,
                             text="Мастер: «Нарушение асептики нельзя оставлять без реакции — это риск для продукта. Повторите СОП-014.»")
    db.add_all([n1, n2, n3, n_end_good, n_end_bad])
    db.flush()
    db.add_all([
        DialogueChoice(node_id=n1.id, position=0, text="Вежливо остановить Марата и попросить надеть маску правильно",
                       next_node_id=n2.id, is_correct=True, score=10, feedback="Правильно: нарушение нужно пресечь сразу."),
        DialogueChoice(node_id=n1.id, position=1, text="Промолчать — это ведь всего на минуту",
                       next_node_id=n_end_bad.id, is_correct=False, score=0, feedback="Молчание = соучастие в нарушении."),
        DialogueChoice(node_id=n2.id, position=0, text="Сообщить мастеру смены о нарушении асептики",
                       next_node_id=n3.id, is_correct=True, score=10, feedback="Да, об отклонении сообщают мастеру."),
        DialogueChoice(node_id=n2.id, position=1, text="Сказать «ладно, никому не скажу»",
                       next_node_id=n_end_bad.id, is_correct=False, score=0, feedback="Отклонение должно быть зарегистрировано."),
        DialogueChoice(node_id=n3.id, position=0, text="Зарегистрировать отклонение и провести внеплановую санобработку зоны",
                       next_node_id=n_end_good.id, is_correct=True, score=10, feedback="Именно так требует система качества."),
        DialogueChoice(node_id=n3.id, position=1, text="Просто протереть журнал салфеткой",
                       next_node_id=n_end_bad.id, is_correct=False, score=2, feedback="Недостаточно: нужна регистрация отклонения."),
    ])
    db.flush()

    # ---------- курсы ----------
    c_safety = build_course(
        db, title="Охрана труда и техника безопасности: вводный инструктаж", category=cats[("course", "Охрана труда")],
        description="Обязательный курс для всех сотрудников производства: опасные факторы, СИЗ, действия в аварийной ситуации.",
        cover=covers["safety"], author=methodist, mandatory=True, status="published", pass_score=80, due_days=14,
        level="beginner", duration=40, modules=[
            ("Общие требования безопасности", [
                ("Введение: зачем нужен инструктаж", 5, [{"kind": "text", "title": "О курсе", "body": SAFETY_TEXT}]),
                ("Видео: средства индивидуальной защиты", 5, [
                    {"kind": "video", "title": "Порядок надевания СИЗ (тестовое видео)", "media_id": video.id},
                    {"kind": "instruction", "title": "Что запомнить",
                     "body": "1. Проверяйте целостность СИЗ перед сменой.\n2. Заменяйте перчатки при повреждении.\n3. Не выносите спецодежду за пределы участка."}]),
                ("Инструкция по охране труда ИОТ-001", 15, [
                    {"kind": "pdf", "title": "ИОТ-001", "media_id": pdf_safety.id}]),
            ]),
            ("Аттестация", [("Итоговый тест", 10, [])]),
        ])
    t_safety = add_test(db, "Тест: охрана труда (вводный)", c_safety, methodist, [
        ("single", "Что необходимо сделать при обнаружении неисправности оборудования перед сменой?",
         [("Сообщить мастеру смены и не начинать работу", True), ("Попробовать починить самостоятельно", False),
          ("Продолжить работу, если неисправность мелкая", False)], "О неисправности сообщают до начала работы."),
        ("multiple", "Какие действия запрещены при работе на оборудовании?",
         [("Чистить движущиеся части на ходу", True), ("Снимать защитные ограждения", True),
          ("Использовать аварийную кнопку при опасности", False), ("Блокировать датчики безопасности", True)],
         "Аварийная кнопка — правильное действие при опасности."),
        ("single", "По какому номеру вызывают скорую медицинскую помощь?",
         [("101", False), ("102", False), ("103", True), ("104", False)], "103 — скорая медицинская помощь."),
        ("ordering", "Расположите действия в аварийной ситуации в правильном порядке",
         [("Остановить оборудование аварийной кнопкой", True), ("Сообщить мастеру смены", True),
          ("Оказать первую помощь пострадавшему", True)], "Сначала устраните источник опасности."),
        ("single", "Можно ли работать на оборудовании, к которому вы не допущены?",
         [("Да, если попросил коллега", False), ("Нет, ни при каких условиях", True), ("Да, под присмотром", False)],
         "Работать можно только на оборудовании, к которому есть допуск."),
    ])
    final_lesson = c_safety.modules[1].lessons[0]
    db.add(LessonMaterial(lesson_id=final_lesson.id, kind="test", title="Итоговый тест", test_id=t_safety.id, position=1))

    c_sop = build_course(
        db, title="СОП-014: вход в чистые помещения классов C и D", category=cats[("course", "СОП")],
        description="Изучите стандартную операционную процедуру переодевания и входа персонала в чистые зоны.",
        cover=covers["sop"], author=methodist, mandatory=True, status="published", pass_score=75, due_days=21,
        level="intermediate", duration=30, modules=[
            ("Процедура", [
                ("Текст СОП-014", 10, [
                    {"kind": "instruction", "title": "Кратко",
                     "body": "Вход в чистую зону выполняется строго по шагам СОП. Нарушение последовательности — отклонение."},
                    {"kind": "pdf", "title": "СОП-014 (PDF)", "media_id": pdf_sop.id}]),
                ("Чек-лист самоконтроля", 5, [
                    {"kind": "excel", "title": "Чек-лист (Excel)", "media_id": xlsx.id},
                    {"kind": "image", "title": "Схема", "media_id": covers["sop"].id}]),
                ("Проверка знаний", 10, []),
            ]),
        ])
    t_sop = add_test(db, "Тест: СОП-014", c_sop, methodist, [
        ("ordering", "Расставьте этапы входа в чистую зону по порядку",
         [("Снять верхнюю одежду и украшения", True), ("Вымыть и высушить руки", True), ("Надеть бахилы", True),
          ("Надеть комбинезон и шапочку", True), ("Надеть маску и перчатки", True)], "Порядок задан СОП-014."),
        ("single", "Можно ли одновременно открывать обе двери шлюза?",
         [("Да", False), ("Нет", True)], "Двери шлюза открываются только поочерёдно."),
        ("single", "Сколько секунд минимум нужно мыть руки?",
         [("10", False), ("30", True), ("60", False)], "Не менее 30 секунд."),
        ("multiple", "Что запрещено вносить в чистую зону без обработки?",
         [("Бумагу", True), ("Личные предметы", True), ("Обработанный инструмент", False)], None),
    ], pass_score=75)
    db.add(LessonMaterial(lesson_id=c_sop.modules[0].lessons[2].id, kind="test", title="Тест по СОП", test_id=t_sop.id,
                          position=1))

    c_gmp = build_course(
        db, title="Основы GMP фармацевтического производства", category=cats[("course", "GMP и производство")],
        description="Принципы надлежащей производственной практики, роль персонала, отклонения и документация.",
        cover=covers["gmp"], author=methodist, mandatory=False, status="published", pass_score=70, due_days=30,
        level="beginner", duration=60, modules=[
            ("Введение в GMP", [
                ("Что такое GMP", 10, [
                    {"kind": "text", "title": "Определение",
                     "body": "GMP (Good Manufacturing Practice) — система требований к производству и контролю качества лекарственных средств.\n\nЕё цель — гарантировать, что каждая серия препарата соответствует спецификации и безопасна для пациента."},
                    {"kind": "link", "title": "Правила GMP ЕАЭС (внешний ресурс)", "url": "https://docs.eaeunion.org/"}]),
                ("Конспект", 10, [{"kind": "pdf", "title": "Конспект GMP", "media_id": pdf_gmp.id}]),
            ]),
            ("Практика", [
                ("Тренажёр: нарушение асептики", 10, [
                    {"kind": "dialogue", "title": "Диалоговый тренажёр", "dialogue_id": sc.id}]),
                ("Проверка знаний", 10, []),
            ]),
        ])
    t_gmp = add_test(db, "Тест: основы GMP", c_gmp, methodist, [
        ("single", "Главная цель GMP:", [("Снизить себестоимость", False),
                                         ("Гарантировать качество и безопасность продукта", True),
                                         ("Ускорить выпуск продукции", False)], None),
        ("single", "Что делать при обнаружении отклонения?", [("Исправить и никому не говорить", False),
                                                              ("Зарегистрировать и сообщить руководителю", True)], None),
        ("text", "Опишите своими словами, почему важна своевременная запись в производственной документации.",
         [], "Ожидается упоминание принципа Contemporaneous (ALCOA+)."),
    ], pass_score=70, show=True)
    db.add(LessonMaterial(lesson_id=c_gmp.modules[1].lessons[1].id, kind="test", title="Тест GMP", test_id=t_gmp.id,
                          position=1))

    c_di = build_course(
        db, title="Документирование и data integrity (ALCOA+)", category=cats[("course", "Качество")],
        description="Как вести записи, которым можно доверять: принципы ALCOA+ на примерах.",
        cover=covers["quality"], author=methodist, mandatory=False, status="published", pass_score=60, due_days=None,
        level="intermediate", duration=20, modules=[
            ("ALCOA+", [
                ("Принципы ALCOA+", 10, [
                    {"kind": "text", "title": "ALCOA+",
                     "body": "**A**ttributable, **L**egible, **C**ontemporaneous, **O**riginal, **A**ccurate + Complete, Consistent, Enduring, Available."}]),
                ("Мини-тест", 5, []),
            ]),
        ])
    t_di = add_test(db, "Мини-тест: ALCOA+", c_di, methodist, [
        ("single", "Что означает буква C в ALCOA?", [("Correct", False), ("Contemporaneous", True), ("Complete", False)], None),
        ("multiple", "Какие записи нарушают data integrity?", [("Запись задним числом", True),
                                                               ("Исправление с подписью и датой", False),
                                                               ("Запись карандашом", True)], None),
    ], pass_score=60, max_attempts=None, time_limit=None)
    db.add(LessonMaterial(lesson_id=c_di.modules[0].lessons[1].id, kind="test", title="Мини-тест", test_id=t_di.id,
                          position=1))

    build_course(
        db, title="Коммуникация с внутренним клиентом", category=cats[("course", "Soft skills")],
        description="Черновик курса: эффективная передача смены и обратная связь.", cover=covers["service"],
        author=methodist, mandatory=False, status="draft", pass_score=70, due_days=None, level="beginner", duration=25,
        modules=[("Передача смены", [("Чек-лист передачи смены", 10, [
            {"kind": "text", "title": "Черновик", "body": "Содержание курса в разработке."}])])])

    # ---------- библиотека ----------
    for title, cat, media, url, dep_codes, desc in [
        ("ИОТ-001. Инструкция по охране труда", "Инструкции", pdf_safety, None, [], "Для всех подразделений"),
        ("СОП-014. Вход в чистые помещения", "СОП", pdf_sop, None, ["PRD-SOL", "PRD-STR", "QC"], "Производство и ОКК"),
        ("Чек-лист входа в чистую зону", "Шаблоны и формы", xlsx, None, ["PRD-SOL", "PRD-STR"], "Распечатайте для самоконтроля"),
        ("Конспект: принципы GMP", "Нормативные документы", pdf_gmp, None, [], None),
        ("Правила GMP ЕАЭС", "Нормативные документы", None, "https://docs.eaeunion.org/", [], "Внешний ресурс"),
    ]:
        item = LibraryMaterial(title=title, description=desc, category_id=cats[("library", cat)].id,
                               media_id=media.id if media else None, url=url, created_by=methodist.id)
        item.departments = [deps[c] for c in dep_codes]
        db.add(item)
    db.flush()

    # ---------- назначения и результаты ----------
    emp = users["employee@dolce.local"]
    today = date.today()
    learners = [emp] + [u for u in synth if u.role.code == "employee"]
    for u in learners:
        db.add(CourseAssignment(course_id=c_safety.id, user_id=u.id, assigned_by=methodist.id,
                                due_date=today + timedelta(days=rnd.choice([-5, 3, 7, 10, 14]))))
        if u.department.code in ("PRD-SOL", "PRD-STR", "QC"):
            db.add(CourseAssignment(course_id=c_sop.id, user_id=u.id, assigned_by=methodist.id,
                                    due_date=today + timedelta(days=rnd.choice([-3, 5, 12, 20]))))
        if rnd.random() < 0.6 or u is emp:
            db.add(CourseAssignment(course_id=c_gmp.id, user_id=u.id, assigned_by=methodist.id,
                                    due_date=today + timedelta(days=30)))
    db.flush()

    def answers_for(test: Test, correct_ratio: float):
        out = []
        for q in test.questions:
            good = rnd.random() < correct_ratio
            if q.type == "text":
                out.append({"question_id": q.id, "text_answer": "Запись делается в момент выполнения операции, "
                                                                  "чтобы она была достоверной (принцип ALCOA+)."})
            elif q.type == "ordering":
                ids = [o.id for o in sorted(q.options, key=lambda o: o.position)]
                if not good:
                    ids = ids[::-1]
                out.append({"question_id": q.id, "selected_option_ids": ids})
            else:
                correct = [o.id for o in q.options if o.is_correct]
                wrong = [o.id for o in q.options if not o.is_correct]
                out.append({"question_id": q.id, "selected_option_ids": correct if good or not wrong else wrong[:1]})
        return out

    def learn(u: User, course: Course, test: Test | None, ratio: float, days_ago: int, lessons_share=1.0):
        when = datetime.now(UTC) - timedelta(days=days_ago, hours=rnd.randint(1, 8))
        all_lessons = [l for m in course.modules for l in m.lessons]
        n = max(1, int(len(all_lessons) * lessons_share))
        for i, lesson in enumerate(all_lessons[:n]):
            spent = rnd.randint(120, 900)
            p = LessonProgress(user_id=u.id, lesson_id=lesson.id, course_id=course.id, status="completed",
                               time_spent_sec=spent, media_time_sec=spent // 3, started_at=when,
                               completed_at=when + timedelta(minutes=10 * (i + 1)), last_activity_at=when)
            db.add(p)
            for k in range(max(1, spent // 60)):
                db.add(LearningEvent(user_id=u.id, event_type="heartbeat", course_id=course.id, lesson_id=lesson.id,
                                     duration_sec=60, source="online",
                                     server_ts=when + timedelta(minutes=k), client_ts=when + timedelta(minutes=k)))
            db.add(LearningEvent(user_id=u.id, event_type="lesson_complete", course_id=course.id, lesson_id=lesson.id,
                                 source="online", server_ts=when + timedelta(minutes=10 * (i + 1))))
        db.flush()
        if test is not None and lessons_share >= 1.0:
            att = submit_attempt(db, u, {"attempt_id": str(uuid.uuid4()), "test_id": test.id, "course_id": course.id,
                                         "answers": answers_for(test, ratio), "question_ids": [],
                                         "started_at": when, "finished_at": when + timedelta(minutes=7)},
                                 rnd.choice(["online", "online", "offline"]))
            att.submitted_at = when + timedelta(minutes=8)
            db.add(LearningEvent(user_id=u.id, event_type="test_attempt", course_id=course.id, test_id=test.id,
                                 source=att.source, server_ts=att.submitted_at, payload={"percent": att.percent}))
        a = recompute_course(db, u.id, course.id)
        if a and a.completed_at:
            a.completed_at = when + timedelta(minutes=40)
            a.started_at = when
        if a:
            a.time_spent_sec = sum(p.time_spent_sec for p in db.scalars(select(LessonProgress).where(
                LessonProgress.user_id == u.id, LessonProgress.course_id == course.id)))
        db.flush()

    for idx, u in enumerate(synth):
        if u.role.code != "employee":
            continue
        roll = rnd.random()
        if roll < 0.75:
            learn(u, c_safety, t_safety, rnd.choice([0.95, 1.0, 0.85, 0.6]), rnd.randint(1, 45))
        elif roll < 0.9:
            learn(u, c_safety, t_safety, 0.9, rnd.randint(1, 10), lessons_share=0.5)
        if u.department.code in ("PRD-SOL", "PRD-STR", "QC") and rnd.random() < 0.6:
            learn(u, c_sop, t_sop, rnd.choice([1.0, 0.8, 0.5]), rnd.randint(1, 30))
        if rnd.random() < 0.35:
            learn(u, c_gmp, t_gmp, 1.0, rnd.randint(1, 20))
        if rnd.random() < 0.3:
            learn(u, c_di, t_di, 1.0, rnd.randint(1, 50))
        for k in range(rnd.randint(2, 6)):
            db.add(LearningEvent(user_id=u.id, event_type="login", source="online",
                                 server_ts=datetime.now(UTC) - timedelta(days=rnd.randint(0, 30))))
    # демо-сотрудник: один завершённый курс с сертификатом, GMP в процессе, ТБ и СОП ещё не начаты
    learn(emp, c_di, t_di, 1.0, 12)
    learn(emp, c_gmp, None, 1.0, 3, lessons_share=0.5)

    # ---------- компетенции 180/360 ----------
    comps = []
    for name, group, qs in [
        ("Соблюдение GMP-дисциплины", "Профессиональные", ["Соблюдает СОП без напоминаний",
                                                            "Своевременно сообщает об отклонениях"]),
        ("Командная работа", "Корпоративные", ["Помогает коллегам при передаче смены", "Конструктивно решает конфликты"]),
        ("Безопасность труда", "Профессиональные", ["Использует СИЗ в полном объёме",
                                                    "Останавливает работу при опасной ситуации"]),
    ]:
        c = Competency(name=name, group_name=group, description=None)
        c.questions = [CompetencyQuestion(text=t, position=i) for i, t in enumerate(qs, 1)]
        db.add(c)
        comps.append(c)
    db.flush()
    peers = [u for u in synth if u.department_id == emp.department_id][:2]
    a360 = CompetencyAssessment(title="Оценка 360: оператор ТЛФ (демо)", subject_user_id=emp.id,
                                assessment_type="360", scale_min=1, scale_max=5, status="active",
                                due_date=today + timedelta(days=10), created_by=methodist.id,
                                scale_labels={"1": "Не проявляет", "3": "Проявляет частично", "5": "Образец для других"})
    a360.competencies = comps
    a360.reviewers = [CompetencyReviewer(reviewer_id=emp.id, relation="self"),
                      CompetencyReviewer(reviewer_id=users["manager@dolce.local"].id, relation="manager")] + \
                     [CompetencyReviewer(reviewer_id=p.id, relation="peer") for p in peers]
    db.add(a360)
    db.flush()
    for r in a360.reviewers:
        if r.relation == "self":
            continue  # самооценку демо-сотрудник заполнит сам
        for c in comps:
            for q in c.questions:
                r.scores.append(CompetencyScore(question_id=q.id, competency_id=c.id,
                                                score=rnd.choice([3, 4, 4, 5]) if r.relation == "peer" else rnd.choice([3, 4, 5])))
        r.submitted_at = datetime.now(UTC) - timedelta(days=rnd.randint(1, 4))
        r.comment = "Надёжный сотрудник, рекомендую к наставничеству." if r.relation == "manager" else None
    db.flush()

    # ---------- протокол аттестации ----------
    from app.models import AssessmentProtocolEntry
    from app.services.progress import generate_number

    prot = AssessmentProtocol(number=generate_number("DL-PR"), program_name=c_safety.title, course_id=c_safety.id,
                              check_date=today, commission="Председатель: Сейтказиева А.; члены: Жумабеков Е.",
                              created_by=methodist.id)
    pos = 0
    for a in db.scalars(select(CourseAssignment).where(CourseAssignment.course_id == c_safety.id)).all():
        best = db.scalar(select(TestAttempt).where(TestAttempt.user_id == a.user_id, TestAttempt.test_id == t_safety.id,
                                                   TestAttempt.status == "graded").order_by(TestAttempt.percent.desc()))
        if best is None:
            continue
        pos += 1
        prot.entries.append(AssessmentProtocolEntry(user_id=a.user_id, full_name=a.user.full_name,
                                                    position_title=a.user.position,
                                                    department_name=a.user.department.name, score=best.percent,
                                                    passed=bool(best.passed), position=pos))
    if prot.entries:
        db.add(prot)
    db.commit()
    print("Seed: демонстрационные данные созданы.")


def main() -> None:
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
