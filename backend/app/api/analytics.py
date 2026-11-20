import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import Date, and_, cast, func, or_, select

from app.core.deps import DB, ManagerOrStaff, ensure_can_view_user, scope_department_id
from app.models import (
    Course,
    CourseAssignment,
    Department,
    LearningEvent,
    Lesson,
    LessonProgress,
    TestAttempt,
    User,
)
from app.models.org import Role
from app.services.progress import overdue

router = APIRouter(prefix="/api/analytics", tags=["analytics"])
reports = APIRouter(prefix="/api/reports", tags=["reports"])

STATUS_RU = {"assigned": "Назначен", "in_progress": "В процессе", "completed": "Завершён", "overdue": "Просрочен"}


def _users_scope(viewer, department_id: int | None):
    scope = scope_department_id(viewer)
    conds = [User.is_active]
    if scope is not None:
        conds.append(User.department_id == scope)
    if department_id:
        conds.append(User.department_id == department_id)
    return and_(*conds)


def _day_bounds(d_from: date | None, d_to: date | None):
    f = datetime.combine(d_from, time.min, tzinfo=timezone.utc) if d_from else None
    t = datetime.combine(d_to, time.max, tzinfo=timezone.utc) if d_to else None
    return f, t


@router.get("/overview")
def overview(viewer: ManagerOrStaff, db: DB, department_id: int | None = None, course_id: int | None = None,
             date_from: date | None = None, date_to: date | None = None):
    ucond = _users_scope(viewer, department_id)
    learners = select(User.id).join(Role).where(ucond, Role.code.in_(("employee", "manager")))
    employees = db.scalar(select(func.count()).select_from(learners.subquery())) or 0
    courses_total = db.scalar(select(func.count()).select_from(Course).where(Course.status != "archived")) or 0
    courses_active = db.scalar(select(func.count()).select_from(Course).where(Course.status == "published")) or 0

    a_stmt = select(CourseAssignment).join(User, User.id == CourseAssignment.user_id).where(ucond)
    if course_id:
        a_stmt = a_stmt.where(CourseAssignment.course_id == course_id)
    f, t = _day_bounds(date_from, date_to)
    if f:
        a_stmt = a_stmt.where(CourseAssignment.created_at >= f)
    if t:
        a_stmt = a_stmt.where(CourseAssignment.created_at <= t)
    rows = db.scalars(a_stmt).unique().all()
    assigned = len(rows)
    completed = sum(1 for a in rows if a.status == "completed")
    overdue_n = sum(1 for a in rows if overdue(a))
    att = select(TestAttempt).join(User, User.id == TestAttempt.user_id).where(ucond, TestAttempt.status == "graded")
    if course_id:
        att = att.where(TestAttempt.course_id == course_id)
    if f:
        att = att.where(TestAttempt.submitted_at >= f)
    if t:
        att = att.where(TestAttempt.submitted_at <= t)
    attempts = db.scalars(att).unique().all()
    avg_score = round(sum(a.percent for a in attempts) / len(attempts), 1) if attempts else None
    pass_rate = round(100 * sum(1 for a in attempts if a.passed) / len(attempts), 1) if attempts else None

    # время обучения по дням (последние 30 дней или заданный период)
    end = date_to or date.today()
    start = date_from or (end - timedelta(days=29))
    sf, st = _day_bounds(start, end)
    day = cast(LearningEvent.server_ts, Date)
    time_rows = db.execute(
        select(day.label("d"), func.sum(LearningEvent.duration_sec))
        .join(User, User.id == LearningEvent.user_id)
        .where(ucond, LearningEvent.event_type == "heartbeat", LearningEvent.server_ts >= sf,
               LearningEvent.server_ts <= st,
               *( [LearningEvent.course_id == course_id] if course_id else []))
        .group_by("d").order_by("d")).all()
    by_day = {r[0]: int(r[1] or 0) for r in time_rows}
    time_series = []
    d = start
    while d <= end:
        time_series.append({"date": d.isoformat(), "minutes": round(by_day.get(d, 0) / 60, 1)})
        d += timedelta(days=1)

    # завершения по неделям (8 недель)
    weeks = []
    monday = date.today() - timedelta(days=date.today().weekday())
    for i in range(7, -1, -1):
        ws = monday - timedelta(weeks=i)
        we = ws + timedelta(days=6)
        n = sum(1 for a in rows if a.completed_at and ws <= a.completed_at.date() <= we)
        weeks.append({"week": ws.strftime("%d.%m"), "completed": n})

    status_dist = [
        {"status": "completed", "label": "Завершено", "value": completed},
        {"status": "in_progress", "label": "В процессе",
         "value": sum(1 for a in rows if a.status == "in_progress" and not overdue(a))},
        {"status": "assigned", "label": "Не начато",
         "value": sum(1 for a in rows if a.status == "assigned" and not overdue(a))},
        {"status": "overdue", "label": "Просрочено", "value": overdue_n},
    ]

    by_dep = []
    for dep in db.scalars(select(Department).order_by(Department.name)).all():
        if scope_department_id(viewer) not in (None, dep.id):
            continue
        dep_rows = [a for a in rows if a.user.department_id == dep.id]
        if not dep_rows:
            continue
        by_dep.append({"department": dep.name, "assigned": len(dep_rows),
                       "completed": sum(1 for a in dep_rows if a.status == "completed"),
                       "completion": round(100 * sum(1 for a in dep_rows if a.status == "completed") / len(dep_rows), 1),
                       "overdue": sum(1 for a in dep_rows if overdue(a))})

    recent = db.execute(
        select(LearningEvent, User.full_name).join(User, User.id == LearningEvent.user_id)
        .where(ucond, LearningEvent.event_type.in_(("login", "lesson_complete", "test_attempt", "course_download",
                                                    "sync", "dialogue_run", "course_start")))
        .order_by(LearningEvent.server_ts.desc()).limit(12)).all()
    course_titles = {c.id: c.title for c in db.scalars(select(Course)).all()}
    recent_out = [{"id": e.id, "type": e.event_type, "user_name": name, "at": e.server_ts, "source": e.source,
                   "course_title": course_titles.get(e.course_id), "payload": e.payload} for e, name in recent]

    total_time = db.scalar(select(func.coalesce(func.sum(LearningEvent.duration_sec), 0))
                           .join(User, User.id == LearningEvent.user_id)
                           .where(ucond, LearningEvent.event_type == "heartbeat")) or 0
    return {
        "employees": employees, "courses_total": courses_total, "courses_active": courses_active,
        "assignments": assigned, "completed": completed,
        "completion_rate": round(100 * completed / assigned, 1) if assigned else 0.0,
        "overdue": overdue_n, "avg_score": avg_score, "pass_rate": pass_rate,
        "attempts": len(attempts), "learning_hours": round(total_time / 3600, 1),
        "time_series": time_series, "weekly_completions": weeks, "status_distribution": status_dist,
        "by_department": by_dep, "recent_activity": recent_out,
    }


def report_rows(db, viewer, user_id=None, department_id=None, course_id=None, date_from=None, date_to=None,
                status=None, result=None, min_score=None, q=None) -> list[dict]:
    stmt = (select(CourseAssignment).join(User, User.id == CourseAssignment.user_id)
            .join(Course, Course.id == CourseAssignment.course_id).where(_users_scope(viewer, department_id))
            .order_by(User.full_name, Course.title))
    if user_id:
        stmt = stmt.where(CourseAssignment.user_id == user_id)
    if course_id:
        stmt = stmt.where(CourseAssignment.course_id == course_id)
    f, t = _day_bounds(date_from, date_to)
    if f:
        stmt = stmt.where(or_(CourseAssignment.created_at >= f, CourseAssignment.completed_at >= f))
    if t:
        stmt = stmt.where(CourseAssignment.created_at <= t)
    if status == "overdue":
        stmt = stmt.where(CourseAssignment.status != "completed", CourseAssignment.due_date < date.today())
    elif status:
        stmt = stmt.where(CourseAssignment.status == status)
    if q:
        stmt = stmt.where(or_(User.full_name.ilike(f"%{q}%"), Course.title.ilike(f"%{q}%")))
    out = []
    for a in db.scalars(stmt).unique().all():
        attempts = db.scalars(select(TestAttempt).where(TestAttempt.user_id == a.user_id,
                                                        TestAttempt.course_id == a.course_id,
                                                        TestAttempt.status.in_(("graded", "needs_review")))).all()
        passed = any(x.passed for x in attempts)
        if result == "passed" and not passed:
            continue
        if result == "failed" and (passed or not attempts):
            continue
        if min_score is not None and (a.best_score is None or a.best_score < min_score):
            continue
        lesson_time = db.scalar(select(func.coalesce(func.sum(LessonProgress.time_spent_sec), 0)).where(
            LessonProgress.user_id == a.user_id, LessonProgress.course_id == a.course_id)) or 0
        st = "overdue" if overdue(a) else a.status
        out.append({
            "assignment_id": a.id, "user_id": a.user_id, "user_name": a.user.full_name,
            "employee_number": a.user.employee_number, "position": a.user.position,
            "department_name": a.user.department.name if a.user.department else None,
            "course_id": a.course_id, "course_title": a.course.title, "is_mandatory": a.course.is_mandatory,
            "status": st, "status_label": STATUS_RU.get(st, st), "progress_percent": a.progress_percent,
            "assigned_at": a.created_at, "due_date": a.due_date, "completed_at": a.completed_at,
            "best_score": a.best_score, "attempts": len(attempts),
            "result": "Сдал" if passed else ("Не сдал" if attempts else "—"),
            "time_spent_min": round(max(a.time_spent_sec, int(lesson_time)) / 60, 1),
            "has_offline": any(x.source == "offline" for x in attempts),
        })
    return out


def _filters(user_id: int | None = None, department_id: int | None = None, course_id: int | None = None,
             date_from: date | None = None, date_to: date | None = None, status: str | None = None,
             result: str | None = Query(None, pattern="^(passed|failed)$"), min_score: float | None = None,
             q: str | None = None):
    return dict(user_id=user_id, department_id=department_id, course_id=course_id, date_from=date_from,
                date_to=date_to, status=status, result=result, min_score=min_score, q=q)


from fastapi import Depends  # noqa: E402


@router.get("/report")
def report(viewer: ManagerOrStaff, db: DB, flt: dict = Depends(_filters)):
    rows = report_rows(db, viewer, **flt)
    return {"items": rows, "total": len(rows)}


@router.get("/employees")
def employees_summary(viewer: ManagerOrStaff, db: DB, department_id: int | None = None, q: str | None = None):
    stmt = select(User).join(Role).where(_users_scope(viewer, department_id),
                                         Role.code.in_(("employee", "manager"))).order_by(User.full_name)
    if q:
        stmt = stmt.where(User.full_name.ilike(f"%{q}%"))
    out = []
    for u in db.scalars(stmt).unique().all():
        rows = db.scalars(select(CourseAssignment).where(CourseAssignment.user_id == u.id)).unique().all()
        att = db.scalars(select(TestAttempt).where(TestAttempt.user_id == u.id, TestAttempt.status == "graded")).all()
        t = db.scalar(select(func.coalesce(func.sum(LearningEvent.duration_sec), 0)).where(
            LearningEvent.user_id == u.id, LearningEvent.event_type == "heartbeat")) or 0
        last = db.scalar(select(func.max(LearningEvent.server_ts)).where(LearningEvent.user_id == u.id))
        out.append({"user_id": u.id, "user_name": u.full_name, "position": u.position,
                    "department_name": u.department.name if u.department else None,
                    "assigned": len(rows), "completed": sum(1 for a in rows if a.status == "completed"),
                    "overdue": sum(1 for a in rows if overdue(a)),
                    "avg_score": round(sum(a.percent for a in att) / len(att), 1) if att else None,
                    "platform_time_min": round(t / 60, 1), "last_activity": last})
    return out


@router.get("/courses")
def courses_summary(viewer: ManagerOrStaff, db: DB, department_id: int | None = None):
    ucond = _users_scope(viewer, department_id)
    out = []
    for c in db.scalars(select(Course).where(Course.status != "draft").order_by(Course.title)).unique().all():
        rows = db.scalars(select(CourseAssignment).join(User, User.id == CourseAssignment.user_id)
                          .where(CourseAssignment.course_id == c.id, ucond)).unique().all()
        att = db.scalars(select(TestAttempt).join(User, User.id == TestAttempt.user_id)
                         .where(TestAttempt.course_id == c.id, TestAttempt.status == "graded", ucond)).unique().all()
        done = [a for a in rows if a.status == "completed"]
        out.append({"course_id": c.id, "course_title": c.title, "status": c.status, "is_mandatory": c.is_mandatory,
                    "assigned": len(rows), "completed": len(done),
                    "completion": round(100 * len(done) / len(rows), 1) if rows else 0.0,
                    "overdue": sum(1 for a in rows if overdue(a)),
                    "avg_score": round(sum(a.percent for a in att) / len(att), 1) if att else None,
                    "avg_time_min": round(sum(a.time_spent_sec for a in rows) / len(rows) / 60, 1) if rows else 0})
    return out


@router.get("/users/{user_id}")
def user_detail(user_id: int, viewer: ManagerOrStaff, db: DB):
    u = ensure_can_view_user(db, viewer, user_id)
    rows = report_rows(db, viewer, user_id=u.id)
    lessons = db.execute(select(LessonProgress, Lesson.title, Course.title)
                         .join(Lesson, Lesson.id == LessonProgress.lesson_id)
                         .join(Course, Course.id == LessonProgress.course_id)
                         .where(LessonProgress.user_id == u.id)
                         .order_by(LessonProgress.last_activity_at.desc().nullslast())).all()
    att = db.scalars(select(TestAttempt).where(TestAttempt.user_id == u.id)
                     .order_by(TestAttempt.submitted_at.desc().nullslast())).unique().all()
    since = datetime.now(timezone.utc) - timedelta(days=29)
    day = cast(LearningEvent.server_ts, Date)
    daily = db.execute(select(day.label("d"), func.sum(LearningEvent.duration_sec)).where(
        LearningEvent.user_id == u.id, LearningEvent.event_type == "heartbeat", LearningEvent.server_ts >= since)
        .group_by("d").order_by("d")).all()
    platform = db.scalar(select(func.coalesce(func.sum(LearningEvent.duration_sec), 0)).where(
        LearningEvent.user_id == u.id, LearningEvent.event_type == "heartbeat")) or 0
    return {
        "user": {"id": u.id, "full_name": u.full_name, "position": u.position, "email": u.email,
                 "department_name": u.department.name if u.department else None,
                 "last_login_at": u.last_login_at},
        "platform_time_min": round(platform / 60, 1),
        "courses": rows,
        "lessons": [{"lesson_id": p.lesson_id, "lesson_title": lt, "course_title": ct, "status": p.status,
                     "time_spent_min": round(p.time_spent_sec / 60, 1), "time_spent_sec": p.time_spent_sec, "media_time_min": round(p.media_time_sec / 60, 1),
                     "completed_at": p.completed_at, "last_activity_at": p.last_activity_at}
                    for p, lt, ct in lessons],
        "attempts": [{"id": a.id, "test_title": a.test.title, "percent": a.percent, "passed": a.passed,
                      "status": a.status, "source": a.source, "submitted_at": a.submitted_at,
                      "attempt_number": a.attempt_number, "rejection_reason": a.rejection_reason} for a in att],
        "daily": [{"date": d.isoformat(), "minutes": round((s or 0) / 60, 1)} for d, s in daily],
    }


# ---------------- export ----------------
EXPORT_COLUMNS = [
    ("user_name", "Сотрудник"), ("employee_number", "Таб. №"), ("position", "Должность"),
    ("department_name", "Подразделение"), ("course_title", "Курс"), ("status_label", "Статус"),
    ("progress_percent", "Прогресс, %"), ("best_score", "Результат, %"), ("result", "Аттестация"),
    ("attempts", "Попыток"), ("time_spent_min", "Время обучения, мин"), ("assigned_at", "Назначен"),
    ("due_date", "Срок"), ("completed_at", "Завершён"),
]


def _fmt(v):
    if isinstance(v, datetime):
        return v.astimezone().strftime("%d.%m.%Y %H:%M")
    if isinstance(v, date):
        return v.strftime("%d.%m.%Y")
    return "" if v is None else v


@reports.get("/export")
def export(viewer: ManagerOrStaff, db: DB, format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
           flt: dict = Depends(_filters)):
    rows = report_rows(db, viewer, **flt)
    stamp = datetime.now().strftime("%Y%m%d_%H%M")
    if format == "csv":
        buf = io.StringIO()
        buf.write("﻿")  # BOM, чтобы Excel корректно открыл кириллицу
        w = csv.writer(buf, delimiter=";")
        w.writerow([h for _, h in EXPORT_COLUMNS])
        for r in rows:
            w.writerow([_fmt(r.get(k)) for k, _ in EXPORT_COLUMNS])
        return StreamingResponse(iter([buf.getvalue().encode("utf-8")]), media_type="text/csv; charset=utf-8",
                                 headers={"Content-Disposition": f'attachment; filename="dolce_learn_report_{stamp}.csv"'})
    wb = Workbook()
    ws = wb.active
    ws.title = "Отчёт по обучению"
    ws.append([h for _, h in EXPORT_COLUMNS])
    head_fill = PatternFill("solid", fgColor="064E3B")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = head_fill
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    for r in rows:
        ws.append([_fmt(r.get(k)) for k, _ in EXPORT_COLUMNS])
    for i, (k, h) in enumerate(EXPORT_COLUMNS, 1):
        width = max([len(str(h))] + [len(str(_fmt(r.get(k)))) for r in rows[:500]]) + 2
        ws.column_dimensions[get_column_letter(i)].width = min(width, 45)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(out, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="dolce_learn_report_{stamp}.xlsx"'})


@reports.get("/time")
def time_report(viewer: ManagerOrStaff, db: DB, department_id: int | None = None, date_from: date | None = None,
                date_to: date | None = None):
    """Время на платформе по сотрудникам за период (для 1С/Битрикс24 и отчётности)."""
    if date_from and date_to and date_to < date_from:
        raise HTTPException(422, "Неверный период")
    f, t = _day_bounds(date_from, date_to)
    conds = [_users_scope(viewer, department_id), LearningEvent.event_type == "heartbeat"]
    if f:
        conds.append(LearningEvent.server_ts >= f)
    if t:
        conds.append(LearningEvent.server_ts <= t)
    rows = db.execute(select(User.id, User.full_name, func.sum(LearningEvent.duration_sec))
                      .join(LearningEvent, LearningEvent.user_id == User.id).where(*conds)
                      .group_by(User.id, User.full_name).order_by(User.full_name)).all()
    return [{"user_id": i, "user_name": n, "minutes": round((s or 0) / 60, 1)} for i, n, s in rows]
