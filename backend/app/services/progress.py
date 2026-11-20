"""Расчёт прогресса по курсу, завершение курса и автоматическая выдача сертификатов."""
import secrets
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Certificate,
    Course,
    CourseAssignment,
    CourseModule,
    Lesson,
    LessonMaterial,
    LessonProgress,
    Test,
    TestAttempt,
)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def course_lesson_ids(db: Session, course_id: int) -> list[int]:
    return list(db.scalars(select(Lesson.id).join(CourseModule).where(CourseModule.course_id == course_id)).all())


def course_test_ids(db: Session, course_id: int) -> list[int]:
    stmt = (select(LessonMaterial.test_id).join(Lesson, Lesson.id == LessonMaterial.lesson_id)
            .join(CourseModule, CourseModule.id == Lesson.module_id)
            .join(Test, Test.id == LessonMaterial.test_id)
            .where(CourseModule.course_id == course_id, Test.status == "published").distinct())
    return [t for t in db.scalars(stmt).all() if t]


def ensure_assignment(db: Session, user_id: int, course: Course) -> CourseAssignment:
    a = db.scalar(select(CourseAssignment).where(CourseAssignment.course_id == course.id,
                                                 CourseAssignment.user_id == user_id))
    if a is None:
        # самостоятельная запись на курс из каталога
        due = date.today() + timedelta(days=course.due_days) if course.due_days else None
        a = CourseAssignment(course_id=course.id, user_id=user_id, assigned_by=None, due_date=due, status="assigned")
        db.add(a)
        db.flush()
    return a


def generate_number(prefix: str) -> str:
    return f"{prefix}-{now_utc():%Y%m%d}-{secrets.token_hex(3).upper()}"


def recompute_course(db: Session, user_id: int, course_id: int) -> CourseAssignment | None:
    course = db.get(Course, course_id)
    if course is None:
        return None
    a = ensure_assignment(db, user_id, course)
    lesson_ids = course_lesson_ids(db, course_id)
    test_ids = course_test_ids(db, course_id)
    done_lessons = 0
    if lesson_ids:
        done_lessons = db.scalar(select(func.count()).select_from(LessonProgress).where(
            LessonProgress.user_id == user_id, LessonProgress.lesson_id.in_(lesson_ids),
            LessonProgress.status == "completed")) or 0
    best_by_test: dict[int, float] = {}
    passed_tests = 0
    for tid in test_ids:
        best = db.scalar(select(func.max(TestAttempt.percent)).where(
            TestAttempt.user_id == user_id, TestAttempt.test_id == tid, TestAttempt.status == "graded"))
        if best is not None:
            best_by_test[tid] = best
        passed = db.scalar(select(func.count()).select_from(TestAttempt).where(
            TestAttempt.user_id == user_id, TestAttempt.test_id == tid, TestAttempt.status == "graded",
            TestAttempt.passed.is_(True))) or 0
        if passed:
            passed_tests += 1
    total_units = len(lesson_ids) + len(test_ids)
    pct = round(100 * (done_lessons + passed_tests) / total_units, 1) if total_units else 0.0
    a.progress_percent = pct
    a.best_score = round(sum(best_by_test.values()) / len(best_by_test), 1) if best_by_test else None
    any_activity = done_lessons > 0 or best_by_test or db.scalar(
        select(func.count()).select_from(LessonProgress).where(LessonProgress.user_id == user_id,
                                                               LessonProgress.course_id == course_id))
    if a.started_at is None and any_activity:
        a.started_at = now_utc()
    if total_units and done_lessons == len(lesson_ids) and passed_tests == len(test_ids):
        if a.status != "completed":
            a.status = "completed"
            a.completed_at = now_utc()
        issue_certificate(db, user_id, course, a)
    elif any_activity:
        a.status = "in_progress"
    return a


def issue_certificate(db: Session, user_id: int, course: Course, a: CourseAssignment,
                      issued_by: int | None = None) -> Certificate:
    cert = db.scalar(select(Certificate).where(Certificate.user_id == user_id, Certificate.course_id == course.id))
    best_attempt = db.scalar(select(TestAttempt).where(
        TestAttempt.user_id == user_id, TestAttempt.course_id == course.id, TestAttempt.status == "graded",
        TestAttempt.passed.is_(True)).order_by(TestAttempt.percent.desc()).limit(1))
    if cert is None:
        cert = Certificate(number=generate_number("DL-CERT"), user_id=user_id, course_id=course.id,
                           attempt_id=best_attempt.id if best_attempt else None, score=a.best_score,
                           completed_at=a.completed_at or now_utc(), issued_by=issued_by, status="valid")
        db.add(cert)
        db.flush()
    else:
        cert.score = a.best_score
    return cert


def overdue(a: CourseAssignment, today: date | None = None) -> bool:
    today = today or date.today()
    return a.status != "completed" and a.due_date is not None and a.due_date < today
