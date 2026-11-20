from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import func, or_, select

from app.core.deps import DB, CurrentUser, StaffUser, audit, get_or_404
from app.models import (
    Category,
    Course,
    CourseAssignment,
    CourseModule,
    Department,
    DialogueScenario,
    Lesson,
    LessonMaterial,
    MediaFile,
    Test,
    TestAttempt,
)
from app.schemas.common import Msg, Page
from app.schemas.course import (
    CourseDetail,
    CourseIn,
    CoursePatch,
    CourseSummary,
    LessonIn,
    LessonOut,
    MaterialIn,
    MaterialOut,
    ModuleIn,
    ModuleOut,
    ReorderIn,
)
from app.services.access import can_view_course, is_staff, visible_courses_clause
from app.services.packages import build_package

router = APIRouter(prefix="/api/courses", tags=["courses"])
modules = APIRouter(prefix="/api/modules", tags=["modules"])
lessons = APIRouter(prefix="/api/lessons", tags=["lessons"])


def summary(db, c: Course, user=None) -> CourseSummary:
    mcount = db.scalar(select(func.count()).select_from(CourseModule).where(CourseModule.course_id == c.id)) or 0
    lcount = db.scalar(select(func.count()).select_from(Lesson).join(CourseModule)
                       .where(CourseModule.course_id == c.id)) or 0
    assigned = db.scalar(select(func.count()).select_from(CourseAssignment)
                         .where(CourseAssignment.course_id == c.id)) or 0
    completed = db.scalar(select(func.count()).select_from(CourseAssignment)
                          .where(CourseAssignment.course_id == c.id, CourseAssignment.status == "completed")) or 0
    s = CourseSummary.model_validate(c)
    s.category_name = c.category.name if c.category else None
    s.module_count, s.lesson_count, s.assigned_count, s.completed_count = mcount, lcount, assigned, completed
    if user is not None:
        a = db.scalar(select(CourseAssignment).where(CourseAssignment.course_id == c.id,
                                                     CourseAssignment.user_id == user.id))
        if a:
            s.progress_percent, s.assignment_status, s.due_date = a.progress_percent, a.status, a.due_date
    return s


def _bump(c: Course) -> None:
    c.version = (c.version or 1) + 1


def _validate_refs(db, data: dict) -> None:
    if data.get("category_id") and not db.get(Category, data["category_id"]):
        raise HTTPException(422, "Категория не найдена")
    if data.get("department_id") and not db.get(Department, data["department_id"]):
        raise HTTPException(422, "Подразделение не найдено")
    if data.get("cover_media_id"):
        m = db.get(MediaFile, data["cover_media_id"])
        if not m or m.kind != "image":
            raise HTTPException(422, "Обложка должна быть изображением")


@router.get("", response_model=Page[CourseSummary])
def list_courses(user: CurrentUser, db: DB, q: str | None = None, status: str | None = None,
                 category_id: int | None = None, department_id: int | None = None,
                 mandatory: bool | None = None, page: int = Query(1, ge=1),
                 page_size: int = Query(50, ge=1, le=200)):
    stmt = select(Course).order_by(Course.updated_at.desc())
    if not is_staff(user):
        stmt = stmt.where(visible_courses_clause(user), Course.status != "draft")
    if q:
        stmt = stmt.where(or_(Course.title.ilike(f"%{q}%"), Course.description.ilike(f"%{q}%")))
    if status:
        stmt = stmt.where(Course.status == status)
    if category_id:
        stmt = stmt.where(Course.category_id == category_id)
    if department_id:
        stmt = stmt.where(Course.department_id == department_id)
    if mandatory is not None:
        stmt = stmt.where(Course.is_mandatory == mandatory)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).unique().all()
    return {"items": [summary(db, c, None if is_staff(user) else user) for c in items], "total": total,
            "page": page, "page_size": page_size}


@router.post("", response_model=CourseDetail, status_code=201)
def create_course(data: CourseIn, user: StaffUser, db: DB, request: Request):
    payload = data.model_dump()
    _validate_refs(db, payload)
    c = Course(**payload, author_id=user.id)
    if not c.author_name:
        c.author_name = user.full_name
    db.add(c)
    db.flush()
    audit(db, user, "course.create", "course", c.id, {"title": c.title}, request)
    db.commit()
    return get_course(c.id, user, db)


@router.get("/{course_id}", response_model=CourseDetail)
def get_course(course_id: int, user: CurrentUser, db: DB):
    c = get_or_404(db, Course, course_id, "Курс не найден")
    if not can_view_course(db, user, c):
        raise HTTPException(403, "Курс недоступен")
    s = summary(db, c, None if is_staff(user) else user)
    detail = CourseDetail(**s.model_dump())
    detail.modules = [ModuleOut.model_validate(m) for m in c.modules]
    return detail


@router.patch("/{course_id}", response_model=CourseDetail)
def update_course(course_id: int, data: CoursePatch, user: StaffUser, db: DB, request: Request):
    c = get_or_404(db, Course, course_id, "Курс не найден")
    payload = data.model_dump(exclude_unset=True)
    _validate_refs(db, payload)
    if payload.get("status") == "published":
        lessons_n = db.scalar(select(func.count()).select_from(Lesson).join(CourseModule)
                              .where(CourseModule.course_id == c.id)) or 0
        if lessons_n == 0:
            raise HTTPException(422, "Нельзя опубликовать курс без уроков")
    for k, v in payload.items():
        setattr(c, k, v)
    _bump(c)
    audit(db, user, "course.update", "course", c.id, {k: str(v) for k, v in payload.items()}, request)
    db.commit()
    return get_course(c.id, user, db)


@router.delete("/{course_id}", response_model=Msg)
def delete_course(course_id: int, user: StaffUser, db: DB, request: Request):
    c = get_or_404(db, Course, course_id, "Курс не найден")
    has_history = db.scalar(select(func.count()).select_from(CourseAssignment).where(CourseAssignment.course_id == c.id)) \
        or db.scalar(select(func.count()).select_from(TestAttempt).where(TestAttempt.course_id == c.id))
    if has_history:
        raise HTTPException(409, "У курса есть назначения или результаты. Переведите курс в архив.")
    db.delete(c)
    audit(db, user, "course.delete", "course", course_id, {"title": c.title}, request)
    db.commit()
    return Msg(detail="Курс удалён")


@router.get("/{course_id}/package")
def course_package(course_id: int, user: CurrentUser, db: DB):
    """Полный пакет курса для офлайн-доступа (без правильных ответов тестов)."""
    c = get_or_404(db, Course, course_id, "Курс не найден")
    if not can_view_course(db, user, c):
        raise HTTPException(403, "Курс недоступен")
    return build_package(db, c, user)


# ---------------- modules ----------------
@router.post("/{course_id}/modules", response_model=ModuleOut, status_code=201)
def add_module(course_id: int, data: ModuleIn, user: StaffUser, db: DB):
    c = get_or_404(db, Course, course_id, "Курс не найден")
    pos = (db.scalar(select(func.max(CourseModule.position)).where(CourseModule.course_id == c.id)) or 0) + 1
    m = CourseModule(course_id=c.id, position=pos, **data.model_dump())
    db.add(m)
    _bump(c)
    db.commit()
    db.refresh(m)
    return m


@router.post("/{course_id}/modules/reorder", response_model=Msg)
def reorder_modules(course_id: int, data: ReorderIn, user: StaffUser, db: DB):
    c = get_or_404(db, Course, course_id, "Курс не найден")
    by_id = {m.id: m for m in c.modules}
    if set(data.ids) != set(by_id):
        raise HTTPException(422, "Список модулей не совпадает с курсом")
    for i, mid in enumerate(data.ids, start=1):
        by_id[mid].position = i
    _bump(c)
    db.commit()
    return Msg(detail="Порядок сохранён")


@modules.patch("/{module_id}", response_model=ModuleOut)
def update_module(module_id: int, data: ModuleIn, user: StaffUser, db: DB):
    m = get_or_404(db, CourseModule, module_id, "Модуль не найден")
    for k, v in data.model_dump().items():
        setattr(m, k, v)
    _bump(m.course)
    db.commit()
    db.refresh(m)
    return m


@modules.delete("/{module_id}", response_model=Msg)
def delete_module(module_id: int, user: StaffUser, db: DB):
    m = get_or_404(db, CourseModule, module_id, "Модуль не найден")
    _bump(m.course)
    db.delete(m)
    db.commit()
    return Msg(detail="Модуль удалён")


@modules.post("/{module_id}/lessons", response_model=LessonOut, status_code=201)
def add_lesson(module_id: int, data: LessonIn, user: StaffUser, db: DB):
    m = get_or_404(db, CourseModule, module_id, "Модуль не найден")
    pos = (db.scalar(select(func.max(Lesson.position)).where(Lesson.module_id == m.id)) or 0) + 1
    payload = data.model_dump(exclude={"module_id"})
    lesson = Lesson(module_id=m.id, position=pos, **payload)
    db.add(lesson)
    _bump(m.course)
    db.commit()
    db.refresh(lesson)
    return lesson


@modules.post("/{module_id}/lessons/reorder", response_model=Msg)
def reorder_lessons(module_id: int, data: ReorderIn, user: StaffUser, db: DB):
    m = get_or_404(db, CourseModule, module_id, "Модуль не найден")
    by_id = {x.id: x for x in m.lessons}
    if set(data.ids) != set(by_id):
        raise HTTPException(422, "Список уроков не совпадает с модулем")
    for i, lid in enumerate(data.ids, start=1):
        by_id[lid].position = i
    _bump(m.course)
    db.commit()
    return Msg(detail="Порядок сохранён")


# ---------------- lessons ----------------
@lessons.get("/{lesson_id}", response_model=LessonOut)
def get_lesson(lesson_id: int, user: CurrentUser, db: DB):
    lesson = get_or_404(db, Lesson, lesson_id, "Урок не найден")
    if not can_view_course(db, user, lesson.module.course):
        raise HTTPException(403, "Урок недоступен")
    return lesson


@lessons.patch("/{lesson_id}", response_model=LessonOut)
def update_lesson(lesson_id: int, data: LessonIn, user: StaffUser, db: DB):
    lesson = get_or_404(db, Lesson, lesson_id, "Урок не найден")
    payload = data.model_dump(exclude_unset=True)
    new_mod = payload.pop("module_id", None)
    if new_mod and new_mod != lesson.module_id:
        target = get_or_404(db, CourseModule, new_mod, "Модуль не найден")
        if target.course_id != lesson.module.course_id:
            raise HTTPException(422, "Перенос возможен только внутри курса")
        lesson.module_id = target.id
        lesson.position = (db.scalar(select(func.max(Lesson.position)).where(Lesson.module_id == target.id)) or 0) + 1
    for k, v in payload.items():
        setattr(lesson, k, v)
    _bump(lesson.module.course)
    db.commit()
    db.refresh(lesson)
    return lesson


@lessons.delete("/{lesson_id}", response_model=Msg)
def delete_lesson(lesson_id: int, user: StaffUser, db: DB):
    lesson = get_or_404(db, Lesson, lesson_id, "Урок не найден")
    _bump(lesson.module.course)
    db.delete(lesson)
    db.commit()
    return Msg(detail="Урок удалён")


def _check_material_refs(db, data: MaterialIn) -> None:
    if data.media_id:
        media = db.get(MediaFile, data.media_id)
        if not media:
            raise HTTPException(422, "Файл не найден")
        expected = {"video": {"video"}, "pdf": {"pdf"}, "word": {"word"}, "excel": {"excel"},
                    "powerpoint": {"powerpoint"}, "image": {"image"}}.get(data.kind)
        if expected and media.kind not in expected:
            raise HTTPException(422, f"Тип файла ({media.kind}) не соответствует блоку ({data.kind})")
    if data.test_id and not db.get(Test, data.test_id):
        raise HTTPException(422, "Тест не найден")
    if data.dialogue_id and not db.get(DialogueScenario, data.dialogue_id):
        raise HTTPException(422, "Сценарий не найден")


@lessons.post("/{lesson_id}/materials", response_model=MaterialOut, status_code=201)
def add_material(lesson_id: int, data: MaterialIn, user: StaffUser, db: DB):
    lesson = get_or_404(db, Lesson, lesson_id, "Урок не найден")
    _check_material_refs(db, data)
    pos = (db.scalar(select(func.max(LessonMaterial.position)).where(LessonMaterial.lesson_id == lesson.id)) or 0) + 1
    mat = LessonMaterial(lesson_id=lesson.id, position=pos, **data.model_dump())
    db.add(mat)
    if data.test_id:
        t = db.get(Test, data.test_id)
        if t.course_id is None:
            t.course_id = lesson.module.course_id
    _bump(lesson.module.course)
    db.commit()
    db.refresh(mat)
    return mat


@lessons.post("/{lesson_id}/materials/reorder", response_model=Msg)
def reorder_materials(lesson_id: int, data: ReorderIn, user: StaffUser, db: DB):
    lesson = get_or_404(db, Lesson, lesson_id, "Урок не найден")
    by_id = {x.id: x for x in lesson.materials}
    if set(data.ids) != set(by_id):
        raise HTTPException(422, "Список элементов не совпадает с уроком")
    for i, mid in enumerate(data.ids, start=1):
        by_id[mid].position = i
    _bump(lesson.module.course)
    db.commit()
    return Msg(detail="Порядок сохранён")


@lessons.patch("/materials/{material_id}", response_model=MaterialOut)
def update_material(material_id: int, data: MaterialIn, user: StaffUser, db: DB):
    mat = get_or_404(db, LessonMaterial, material_id, "Элемент не найден")
    _check_material_refs(db, data)
    for k, v in data.model_dump().items():
        setattr(mat, k, v)
    _bump(mat.lesson.module.course)
    db.commit()
    db.refresh(mat)
    return mat


@lessons.delete("/materials/{material_id}", response_model=Msg)
def delete_material(material_id: int, user: StaffUser, db: DB):
    mat = get_or_404(db, LessonMaterial, material_id, "Элемент не найден")
    _bump(mat.lesson.module.course)
    db.delete(mat)
    db.commit()
    return Msg(detail="Элемент удалён")
