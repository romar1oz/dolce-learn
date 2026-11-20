import random
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, or_, select

from app.core.deps import DB, CurrentUser, ManagerOrStaff, StaffUser, audit, get_or_404, scope_department_id
from app.models import AnswerOption, Course, Question, Test, TestAnswer, TestAttempt, User
from app.schemas.common import Msg
from app.services.access import can_view_course, is_staff
from app.services.grading import after_attempt, attempt_result, finalize, submit_attempt
from app.services.packages import learner_test

router = APIRouter(prefix="/api/tests", tags=["tests"])
attempts = APIRouter(prefix="/api/attempts", tags=["attempts"])


class OptionIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    is_correct: bool = False


class QuestionIn(BaseModel):
    type: str = Field(pattern="^(single|multiple|text|ordering)$")
    text: str = Field(min_length=1, max_length=5000)
    points: float = Field(default=1, gt=0, le=100)
    explanation: str | None = Field(default=None, max_length=5000)
    reference_answer: str | None = Field(default=None, max_length=5000)
    options: list[OptionIn] = []

    @model_validator(mode="after")
    def check(self):
        n_correct = sum(1 for o in self.options if o.is_correct)
        if self.type == "single" and (len(self.options) < 2 or n_correct != 1):
            raise ValueError("Для одиночного выбора нужно не менее 2 вариантов и ровно 1 правильный")
        if self.type == "multiple" and (len(self.options) < 2 or n_correct < 1):
            raise ValueError("Для множественного выбора нужно не менее 2 вариантов и хотя бы 1 правильный")
        if self.type == "ordering" and len(self.options) < 2:
            raise ValueError("Для последовательности нужно не менее 2 элементов (в правильном порядке)")
        if self.type == "text":
            self.options = []
        return self


class TestIn(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str | None = None
    course_id: int | None = None
    question_count: int | None = Field(default=None, ge=1)
    pass_score: int = Field(default=80, ge=0, le=100)
    time_limit_minutes: int | None = Field(default=None, ge=1, le=600)
    max_attempts: int | None = Field(default=None, ge=1, le=100)
    shuffle_questions: bool = False
    shuffle_options: bool = False
    show_correct_answers: bool = True
    available_from: datetime | None = None
    available_until: datetime | None = None
    status: str = Field(default="draft", pattern="^(draft|published|archived)$")


class TestPatch(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    course_id: int | None = None
    question_count: int | None = Field(default=None, ge=1)
    pass_score: int | None = Field(default=None, ge=0, le=100)
    time_limit_minutes: int | None = Field(default=None, ge=1, le=600)
    max_attempts: int | None = Field(default=None, ge=1, le=100)
    shuffle_questions: bool | None = None
    shuffle_options: bool | None = None
    show_correct_answers: bool | None = None
    available_from: datetime | None = None
    available_until: datetime | None = None
    status: str | None = Field(default=None, pattern="^(draft|published|archived)$")


def staff_question(q: Question) -> dict:
    opts = sorted(q.options, key=lambda o: o.position)
    return {"id": q.id, "type": q.type, "text": q.text, "points": q.points, "explanation": q.explanation,
            "reference_answer": q.reference_answer, "position": q.position,
            "options": [{"id": o.id, "text": o.text, "is_correct": o.is_correct, "position": o.position} for o in opts]}


def staff_test(db, t: Test) -> dict:
    course = db.get(Course, t.course_id) if t.course_id else None
    attempts_n = db.scalar(select(func.count()).select_from(TestAttempt).where(TestAttempt.test_id == t.id)) or 0
    review_n = db.scalar(select(func.count()).select_from(TestAttempt).where(
        TestAttempt.test_id == t.id, TestAttempt.status == "needs_review")) or 0
    return {
        "id": t.id, "title": t.title, "description": t.description, "course_id": t.course_id,
        "course_title": course.title if course else None, "question_count": t.question_count,
        "pass_score": t.pass_score, "time_limit_minutes": t.time_limit_minutes, "max_attempts": t.max_attempts,
        "shuffle_questions": t.shuffle_questions, "shuffle_options": t.shuffle_options,
        "show_correct_answers": t.show_correct_answers, "available_from": t.available_from,
        "available_until": t.available_until, "status": t.status, "updated_at": t.updated_at,
        "total_points": sum(q.points for q in t.questions), "questions_total": len(t.questions),
        "attempts_count": attempts_n, "needs_review_count": review_n,
        "questions": [staff_question(q) for q in t.questions],
    }


def _validate_window(f, u):
    if f and u and u <= f:
        raise HTTPException(422, "Дата окончания доступности должна быть позже даты начала")


@router.get("")
def list_tests(user: CurrentUser, db: DB, q: str | None = None, course_id: int | None = None,
               status: str | None = None):
    stmt = select(Test).order_by(Test.updated_at.desc())
    if q:
        stmt = stmt.where(Test.title.ilike(f"%{q}%"))
    if course_id:
        stmt = stmt.where(Test.course_id == course_id)
    if status:
        stmt = stmt.where(Test.status == status)
    if is_staff(user):
        return [staff_test(db, t) | {"questions": None} for t in db.scalars(stmt).unique().all()]
    # обучающийся: опубликованные тесты доступных курсов
    out = []
    for t in db.scalars(stmt.where(Test.status == "published")).unique().all():
        course = db.get(Course, t.course_id) if t.course_id else None
        if course is None or not can_view_course(db, user, course) or course.status == "draft":
            continue
        lt = learner_test(db, t, user)
        lt.pop("questions")
        lt["course_title"] = course.title
        lt["questions_total"] = min(t.question_count or len(t.questions), len(t.questions))
        out.append(lt)
    return out


@router.post("", status_code=201)
def create_test(data: TestIn, user: StaffUser, db: DB, request: Request):
    _validate_window(data.available_from, data.available_until)
    if data.course_id and not db.get(Course, data.course_id):
        raise HTTPException(422, "Курс не найден")
    t = Test(**data.model_dump(), created_by=user.id)
    db.add(t)
    db.flush()
    audit(db, user, "test.create", "test", t.id, {"title": t.title}, request)
    db.commit()
    return staff_test(db, t)


@router.get("/{test_id}")
def get_test(test_id: int, user: StaffUser, db: DB):
    return staff_test(db, get_or_404(db, Test, test_id, "Тест не найден"))


@router.patch("/{test_id}")
def update_test(test_id: int, data: TestPatch, user: StaffUser, db: DB, request: Request):
    t = get_or_404(db, Test, test_id, "Тест не найден")
    payload = data.model_dump(exclude_unset=True)
    _validate_window(payload.get("available_from", t.available_from), payload.get("available_until", t.available_until))
    if payload.get("status") == "published" and not t.questions:
        raise HTTPException(422, "Нельзя опубликовать тест без вопросов")
    for k, v in payload.items():
        setattr(t, k, v)
    audit(db, user, "test.update", "test", t.id, {k: str(v) for k, v in payload.items()}, request)
    db.commit()
    return staff_test(db, t)


@router.delete("/{test_id}", response_model=Msg)
def delete_test(test_id: int, user: StaffUser, db: DB, request: Request):
    t = get_or_404(db, Test, test_id, "Тест не найден")
    if db.scalar(select(func.count()).select_from(TestAttempt).where(TestAttempt.test_id == t.id)):
        raise HTTPException(409, "По тесту есть попытки. Переведите тест в архив.")
    db.delete(t)
    audit(db, user, "test.delete", "test", test_id, None, request)
    db.commit()
    return Msg(detail="Тест удалён")


def _apply_options(q: Question, data: QuestionIn) -> None:
    q.options.clear()
    items = list(enumerate(data.options, start=1))
    if data.type == "ordering":
        # вставляем в случайном порядке, чтобы id вариантов не выдавали правильную последовательность
        random.shuffle(items)
    for pos, o in items:
        q.options.append(AnswerOption(text=o.text, is_correct=o.is_correct if data.type != "ordering" else False,
                                      position=pos))


@router.post("/{test_id}/questions", status_code=201)
def add_question(test_id: int, data: QuestionIn, user: StaffUser, db: DB):
    t = get_or_404(db, Test, test_id, "Тест не найден")
    pos = (db.scalar(select(func.max(Question.position)).where(Question.test_id == t.id)) or 0) + 1
    q = Question(test_id=t.id, type=data.type, text=data.text, points=data.points, explanation=data.explanation,
                 reference_answer=data.reference_answer, position=pos)
    _apply_options(q, data)
    db.add(q)
    db.commit()
    db.refresh(q)
    return staff_question(q)


@router.patch("/questions/{question_id}")
def update_question(question_id: int, data: QuestionIn, user: StaffUser, db: DB):
    q = get_or_404(db, Question, question_id, "Вопрос не найден")
    used = db.scalar(select(func.count()).select_from(TestAnswer).where(TestAnswer.question_id == q.id))
    q.type, q.text, q.points, q.explanation, q.reference_answer = (
        data.type, data.text, data.points, data.explanation, data.reference_answer)
    old = [(o.text, o.is_correct, o.position) for o in sorted(q.options, key=lambda o: o.position)]
    new = [(o.text, o.is_correct if data.type != "ordering" else False, i) for i, o in enumerate(data.options, 1)]
    if old != new:
        if used:
            # сохраняем историю: варианты, на которые уже ссылаются ответы, не пересоздаём при неизменном составе
            if len(old) != len(new):
                raise HTTPException(409, "На вопрос уже есть ответы: нельзя менять количество вариантов. "
                                         "Создайте новый вопрос.")
            for o, (text, correct, pos) in zip(sorted(q.options, key=lambda o: o.position), new):
                o.text = text
                o.is_correct = correct
        else:
            _apply_options(q, data)
    db.commit()
    db.refresh(q)
    return staff_question(q)


@router.delete("/questions/{question_id}", response_model=Msg)
def delete_question(question_id: int, user: StaffUser, db: DB):
    q = get_or_404(db, Question, question_id, "Вопрос не найден")
    if db.scalar(select(func.count()).select_from(TestAnswer).where(TestAnswer.question_id == q.id)):
        raise HTTPException(409, "На вопрос уже есть ответы сотрудников — его нельзя удалить")
    db.delete(q)
    db.commit()
    return Msg(detail="Вопрос удалён")


class ReorderIn(BaseModel):
    ids: list[int]


@router.post("/{test_id}/questions/reorder", response_model=Msg)
def reorder_questions(test_id: int, data: ReorderIn, user: StaffUser, db: DB):
    t = get_or_404(db, Test, test_id, "Тест не найден")
    by_id = {q.id: q for q in t.questions}
    if set(by_id) != set(data.ids):
        raise HTTPException(422, "Список вопросов не совпадает")
    for i, qid in enumerate(data.ids, 1):
        by_id[qid].position = i
    db.commit()
    return Msg(detail="Порядок сохранён")


@router.get("/{test_id}/take")
def take_test(test_id: int, user: CurrentUser, db: DB):
    """Тест для прохождения — без правильных ответов."""
    t = get_or_404(db, Test, test_id, "Тест не найден")
    if not is_staff(user):
        if t.status != "published":
            raise HTTPException(403, "Тест не опубликован")
        course = db.get(Course, t.course_id) if t.course_id else None
        if course is None or not can_view_course(db, user, course):
            raise HTTPException(403, "Тест недоступен")
    return learner_test(db, t, user)


# ---------------- attempts ----------------
class AnswerIn(BaseModel):
    question_id: int
    selected_option_ids: list[int] = []
    text_answer: str | None = Field(default=None, max_length=10000)


class AttemptSubmit(BaseModel):
    attempt_id: uuid.UUID
    test_id: int
    course_id: int | None = None
    question_ids: list[int] = []
    answers: list[AnswerIn]
    started_at: datetime | None = None
    finished_at: datetime | None = None


def _can_reveal(attempt: TestAttempt, viewer) -> bool:
    if is_staff(viewer) or viewer.role.code == "manager":
        return True
    return attempt.status in ("graded", "needs_review") and attempt.test.show_correct_answers


@attempts.post("/submit")
def submit(data: AttemptSubmit, user: CurrentUser, db: DB):
    t = get_or_404(db, Test, data.test_id, "Тест не найден")
    if not is_staff(user):
        course = db.get(Course, data.course_id or t.course_id) if (data.course_id or t.course_id) else None
        if course is None or not can_view_course(db, user, course):
            raise HTTPException(403, "Тест недоступен")
    a = submit_attempt(db, user, data.model_dump(mode="python") | {"attempt_id": str(data.attempt_id)}, "online")
    db.commit()
    return attempt_result(a, _can_reveal(a, user))


@attempts.get("")
def list_attempts(user: CurrentUser, db: DB, test_id: int | None = None, user_id: int | None = None,
                  course_id: int | None = None, status: str | None = None, q: str | None = None,
                  page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=500)):
    stmt = select(TestAttempt).join(User, User.id == TestAttempt.user_id).order_by(TestAttempt.submitted_at.desc().nullslast())
    if user.role.code == "employee":
        stmt = stmt.where(TestAttempt.user_id == user.id)
    else:
        scope = scope_department_id(user)
        if scope is not None:
            stmt = stmt.where(User.department_id == scope)
    if test_id:
        stmt = stmt.where(TestAttempt.test_id == test_id)
    if user_id:
        stmt = stmt.where(TestAttempt.user_id == user_id)
    if course_id:
        stmt = stmt.where(TestAttempt.course_id == course_id)
    if status:
        stmt = stmt.where(TestAttempt.status == status)
    if q:
        stmt = stmt.where(or_(User.full_name.ilike(f"%{q}%"), User.email.ilike(f"%{q}%")))
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).unique().all()
    items = []
    for a in rows:
        u = db.get(User, a.user_id)
        r = attempt_result(a, False)
        r.update({"user_id": u.id, "user_name": u.full_name, "department_name": u.department.name if u.department else None})
        items.append(r)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@attempts.get("/{attempt_id}")
def get_attempt(attempt_id: str, user: CurrentUser, db: DB):
    a = get_or_404(db, TestAttempt, attempt_id, "Попытка не найдена")
    if a.user_id != user.id:
        from app.core.deps import ensure_can_view_user

        if user.role.code == "employee":
            raise HTTPException(403, "Нет доступа")
        ensure_can_view_user(db, user, a.user_id)
    u = db.get(User, a.user_id)
    return attempt_result(a, _can_reveal(a, user)) | {"user_name": u.full_name, "user_id": u.id}


class ReviewItem(BaseModel):
    question_id: int
    points: float = Field(ge=0)
    comment: str | None = None


class ReviewIn(BaseModel):
    items: list[ReviewItem]


@attempts.post("/{attempt_id}/review")
def review_attempt(attempt_id: str, data: ReviewIn, user: StaffUser, db: DB, request: Request):
    """Ручная проверка открытых ответов методистом."""
    a = get_or_404(db, TestAttempt, attempt_id, "Попытка не найдена")
    if a.status == "rejected":
        raise HTTPException(409, "Попытка отклонена и не подлежит проверке")
    by_q = {ans.question_id: ans for ans in a.answers}
    now = datetime.now(timezone.utc)
    for it in data.items:
        ans = by_q.get(it.question_id)
        if ans is None:
            raise HTTPException(422, f"Ответ на вопрос {it.question_id} не найден")
        if it.points > ans.question.points:
            raise HTTPException(422, "Баллы превышают максимум за вопрос")
        ans.points_awarded = it.points
        ans.is_correct = it.points >= ans.question.points
        ans.needs_review = False
        ans.reviewer_id, ans.reviewer_comment, ans.reviewed_at = user.id, it.comment, now
    finalize(a, a.test)
    db.flush()
    after_attempt(db, a.user_id, a, a.test)
    audit(db, user, "attempt.review", "attempt", a.id, {"items": [i.model_dump() for i in data.items]}, request)
    db.commit()
    return attempt_result(a, True)
