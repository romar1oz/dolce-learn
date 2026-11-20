from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from app.core.deps import DB, CurrentUser, StaffUser, audit, get_or_404, scope_department_id
from app.models import (
    Certificate,
    Course,
    CourseAssignment,
    LessonProgress,
    SyncEvent,
    TestAttempt,
    User,
)
from app.schemas.common import Msg
from app.services.progress import overdue, recompute_course
from app.services.sync import process_batch

sync_router = APIRouter(prefix="/api/sync", tags=["sync"])
assignments = APIRouter(prefix="/api/assignments", tags=["assignments"])
progress = APIRouter(prefix="/api/progress", tags=["progress"])


# ---------------- sync ----------------
class SyncEventIn(BaseModel):
    id: str = Field(min_length=8, max_length=36)
    type: str = Field(max_length=40)
    client_ts: datetime | None = None
    offline: bool = False
    payload: dict = {}


class SyncBatchIn(BaseModel):
    device_id: str | None = Field(default=None, max_length=64)
    events: list[SyncEventIn] = Field(max_length=500)


@sync_router.post("/batch")
def sync_batch(data: SyncBatchIn, user: CurrentUser, db: DB):
    results = process_batch(db, user, [e.model_dump() for e in data.events], data.device_id)
    return {"server_time": datetime.now(timezone.utc), "results": results}


@sync_router.get("/status")
def sync_status(user: CurrentUser, db: DB):
    last = db.scalar(select(func.max(SyncEvent.received_at)).where(SyncEvent.user_id == user.id))
    rejected = db.scalar(select(func.count()).select_from(SyncEvent).where(
        SyncEvent.user_id == user.id, SyncEvent.status == "rejected")) or 0
    return {"server_time": datetime.now(timezone.utc), "last_received_at": last, "rejected_total": rejected}


# ---------------- assignments ----------------
class AssignIn(BaseModel):
    course_id: int
    user_ids: list[int] = []
    department_ids: list[int] = []
    due_date: date | None = None


class AssignPatch(BaseModel):
    due_date: date | None = None


def assignment_out(a: CourseAssignment) -> dict:
    u = a.user
    return {
        "id": a.id, "course_id": a.course_id, "course_title": a.course.title, "course_status": a.course.status,
        "is_mandatory": a.course.is_mandatory, "cover_media_id": a.course.cover_media_id,
        "user_id": u.id, "user_name": u.full_name, "user_position": u.position,
        "department_id": u.department_id, "department_name": u.department.name if u.department else None,
        "status": a.status, "is_overdue": overdue(a), "progress_percent": a.progress_percent,
        "due_date": a.due_date, "created_at": a.created_at, "started_at": a.started_at,
        "completed_at": a.completed_at, "best_score": a.best_score, "time_spent_sec": a.time_spent_sec,
        "assigned_by": a.assigned_by,
    }


@assignments.get("")
def list_assignments(user: CurrentUser, db: DB, course_id: int | None = None, user_id: int | None = None,
                     department_id: int | None = None, status: str | None = None, q: str | None = None,
                     page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=1000)):
    stmt = select(CourseAssignment).join(User, User.id == CourseAssignment.user_id).join(
        Course, Course.id == CourseAssignment.course_id).order_by(CourseAssignment.created_at.desc())
    if user.role.code == "employee":
        stmt = stmt.where(CourseAssignment.user_id == user.id)
    else:
        scope = scope_department_id(user)
        if scope is not None:
            stmt = stmt.where(User.department_id == scope)
    if course_id:
        stmt = stmt.where(CourseAssignment.course_id == course_id)
    if user_id:
        stmt = stmt.where(CourseAssignment.user_id == user_id)
    if department_id:
        stmt = stmt.where(User.department_id == department_id)
    if status == "overdue":
        stmt = stmt.where(CourseAssignment.status != "completed", CourseAssignment.due_date < date.today())
    elif status:
        stmt = stmt.where(CourseAssignment.status == status)
    if q:
        stmt = stmt.where(or_(User.full_name.ilike(f"%{q}%"), Course.title.ilike(f"%{q}%")))
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).unique().all()
    return {"items": [assignment_out(a) for a in rows], "total": total, "page": page, "page_size": page_size}


@assignments.post("", status_code=201)
def create_assignments(data: AssignIn, actor: StaffUser, db: DB, request: Request):
    course = get_or_404(db, Course, data.course_id, "Курс не найден")
    if course.status != "published":
        raise HTTPException(422, "Назначать можно только опубликованный курс")
    ids = set(data.user_ids)
    if data.department_ids:
        ids |= set(db.scalars(select(User.id).where(User.department_id.in_(data.department_ids),
                                                    User.is_active)).all())
    if not ids:
        raise HTTPException(422, "Выберите сотрудников или подразделения")
    due = data.due_date or (date.today() + timedelta(days=course.due_days) if course.due_days else None)
    created, skipped = 0, 0
    for uid in ids:
        if db.get(User, uid) is None:
            continue
        a = db.scalar(select(CourseAssignment).where(CourseAssignment.course_id == course.id,
                                                     CourseAssignment.user_id == uid))
        if a:
            if a.assigned_by is None:  # был записан самостоятельно — фиксируем как назначение
                a.assigned_by, a.due_date = actor.id, due
                created += 1
            else:
                skipped += 1
            continue
        db.add(CourseAssignment(course_id=course.id, user_id=uid, assigned_by=actor.id, due_date=due))
        created += 1
    audit(db, actor, "assignment.create", "course", course.id,
          {"users": sorted(ids), "due_date": str(due) if due else None}, request)
    db.commit()
    return {"created": created, "skipped": skipped}


@assignments.patch("/{assignment_id}")
def update_assignment(assignment_id: int, data: AssignPatch, actor: StaffUser, db: DB):
    a = get_or_404(db, CourseAssignment, assignment_id, "Назначение не найдено")
    a.due_date = data.due_date
    db.commit()
    return assignment_out(a)


@assignments.delete("/{assignment_id}", response_model=Msg)
def delete_assignment(assignment_id: int, actor: StaffUser, db: DB, request: Request):
    a = get_or_404(db, CourseAssignment, assignment_id, "Назначение не найдено")
    if a.status == "completed":
        raise HTTPException(409, "Курс уже пройден — назначение нельзя отменить")
    db.delete(a)
    audit(db, actor, "assignment.delete", "assignment", assignment_id, None, request)
    db.commit()
    return Msg(detail="Назначение отменено")


# ---------------- progress / dashboard ----------------
@progress.get("/my")
def my_progress(user: CurrentUser, db: DB):
    rows = db.scalars(select(CourseAssignment).where(CourseAssignment.user_id == user.id)
                      .order_by(CourseAssignment.due_date.asc().nullslast())).unique().all()
    from app.api.courses import summary

    items = []
    for a in rows:
        if a.course.status == "draft":
            continue
        s = summary(db, a.course, user).model_dump(mode="json")
        s["assignment"] = assignment_out(a)
        items.append(s)
    return items


@progress.get("/courses/{course_id}")
def course_progress(course_id: int, user: CurrentUser, db: DB, user_id: int | None = None):
    target = user.id
    if user_id and user_id != user.id:
        from app.core.deps import ensure_can_view_user

        if user.role.code == "employee":
            raise HTTPException(403, "Нет доступа")
        target = ensure_can_view_user(db, user, user_id).id
    rows = db.scalars(select(LessonProgress).where(LessonProgress.user_id == target,
                                                   LessonProgress.course_id == course_id)).all()
    a = db.scalar(select(CourseAssignment).where(CourseAssignment.user_id == target,
                                                 CourseAssignment.course_id == course_id))
    return {
        "assignment": assignment_out(a) if a else None,
        "lessons": {p.lesson_id: {"status": p.status, "time_spent_sec": p.time_spent_sec,
                                  "media_time_sec": p.media_time_sec, "video_position_sec": p.video_position_sec,
                                  "completed_at": p.completed_at} for p in rows},
    }


@progress.post("/courses/{course_id}/recompute")
def recompute(course_id: int, user: CurrentUser, db: DB):
    a = recompute_course(db, user.id, course_id)
    db.commit()
    return assignment_out(a) if a else None


@progress.get("/dashboard")
def dashboard(user: CurrentUser, db: DB):
    """Главная страница сотрудника."""
    rows = [a for a in db.scalars(select(CourseAssignment).where(CourseAssignment.user_id == user.id)).unique().all()
            if a.course.status != "draft"]
    total = len(rows)
    completed = [a for a in rows if a.status == "completed"]
    unfinished = [a for a in rows if a.status != "completed"]
    overall = round(sum(a.progress_percent for a in rows) / total, 1) if total else 0.0
    upcoming = sorted([a for a in unfinished if a.due_date], key=lambda a: a.due_date)[:5]
    attempts_rows = db.scalars(select(TestAttempt).where(TestAttempt.user_id == user.id,
                                                         TestAttempt.status != "in_progress")
                               .order_by(TestAttempt.submitted_at.desc().nullslast()).limit(5)).unique().all()
    certs = db.scalars(select(Certificate).where(Certificate.user_id == user.id)
                       .order_by(Certificate.issued_at.desc())).unique().all()
    time_total = db.scalar(select(func.coalesce(func.sum(LessonProgress.time_spent_sec), 0))
                           .where(LessonProgress.user_id == user.id)) or 0
    return {
        "user": {"full_name": user.full_name, "department_name": user.department.name if user.department else None,
                 "position": user.position},
        "overall_progress": overall,
        "assigned_count": total,
        "completed_count": len(completed),
        "in_progress_count": sum(1 for a in rows if a.status == "in_progress"),
        "overdue_count": sum(1 for a in rows if overdue(a)),
        "learning_time_sec": int(time_total),
        "unfinished": [assignment_out(a) for a in unfinished],
        "upcoming_deadlines": [assignment_out(a) for a in upcoming],
        "recent_results": [{"id": t.id, "test_title": t.test.title, "percent": t.percent, "passed": t.passed,
                            "status": t.status, "submitted_at": t.submitted_at, "source": t.source}
                           for t in attempts_rows],
        "certificates": [{"id": c.id, "number": c.number, "course_title": c.course.title, "issued_at": c.issued_at,
                          "score": c.score} for c in certs],
    }
