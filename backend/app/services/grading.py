"""Проверка попыток тестирования. Вызывается и онлайн, и при синхронизации офлайн-попыток."""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import LessonMaterial, LessonProgress, Question, Test, TestAnswer, TestAttempt, User
from app.services.access import is_staff
from app.services.progress import recompute_course

CLOCK_SKEW = timedelta(minutes=10)


def _norm_ts(ts: datetime | None, now: datetime) -> datetime | None:
    if ts is None:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    # время устройства может быть переведено вперёд — не принимаем «будущее»
    return min(ts, now)


def grade_question(q: Question, selected: list[int] | None, text: str | None) -> tuple[bool | None, float, bool]:
    """Возвращает (is_correct, points, needs_review)."""
    selected = [int(x) for x in (selected or [])]
    valid_ids = {o.id for o in q.options}
    if any(s not in valid_ids for s in selected):
        return False, 0.0, False
    if q.type == "text":
        if not (text or "").strip():
            return False, 0.0, False
        return None, 0.0, True
    if q.type in ("single", "multiple"):
        correct = {o.id for o in q.options if o.is_correct}
        ok = set(selected) == correct and (q.type == "multiple" or len(selected) == 1)
        return ok, (q.points if ok else 0.0), False
    if q.type == "ordering":
        correct_order = [o.id for o in sorted(q.options, key=lambda o: o.position)]
        ok = selected == correct_order
        return ok, (q.points if ok else 0.0), False
    return False, 0.0, False


def finalize(attempt: TestAttempt, test: Test) -> None:
    attempt.score = round(sum(a.points_awarded for a in attempt.answers), 2)
    attempt.percent = round(100 * attempt.score / attempt.max_score, 1) if attempt.max_score else 0.0
    if any(a.needs_review for a in attempt.answers):
        attempt.status = "needs_review"
        attempt.passed = None
    else:
        attempt.status = "graded"
        attempt.passed = attempt.percent >= test.pass_score
        attempt.graded_at = datetime.now(timezone.utc)


def submit_attempt(db: Session, user: User, data: dict, source: str = "online") -> TestAttempt:
    """data: attempt_id, test_id, answers[{question_id, selected_option_ids, text_answer}], question_ids,
    started_at, finished_at, course_id."""
    attempt_id = str(data["attempt_id"])
    existing = db.get(TestAttempt, attempt_id)
    if existing is not None:
        if existing.user_id != user.id:
            raise HTTPException(409, "Идентификатор попытки уже используется")
        return existing  # идемпотентность: повторная отправка той же попытки

    test = db.get(Test, int(data["test_id"]))
    if test is None:
        raise HTTPException(404, "Тест не найден")
    now = datetime.now(timezone.utc)
    started = _norm_ts(data.get("started_at"), now)
    finished = _norm_ts(data.get("finished_at"), now) or now

    attempt = TestAttempt(id=attempt_id, user_id=user.id, test_id=test.id, course_id=data.get("course_id") or test.course_id,
                          source=source, client_started_at=started, client_finished_at=finished,
                          submitted_at=now, started_at=started or now, status="in_progress")
    if started and finished:
        attempt.duration_sec = max(0, int((finished - started).total_seconds()))

    def reject(reason: str) -> TestAttempt:
        attempt.status = "rejected"
        attempt.rejection_reason = reason
        attempt.passed = False
        db.add(attempt)
        db.flush()
        return attempt

    if test.status != "published" and not is_staff(user):
        return reject("Тест не опубликован")
    if test.available_from and finished + CLOCK_SKEW < test.available_from:
        return reject("Тест ещё не доступен")
    if test.available_until and finished > test.available_until + CLOCK_SKEW:
        return reject("Срок прохождения теста истёк")
    used = db.scalar(select(func.count()).select_from(TestAttempt).where(
        TestAttempt.test_id == test.id, TestAttempt.user_id == user.id,
        TestAttempt.status.in_(("graded", "needs_review")))) or 0
    attempt.attempt_number = used + 1
    if test.max_attempts and used >= test.max_attempts:
        return reject("Исчерпан лимит попыток")

    by_id = {q.id: q for q in test.questions}
    q_ids = [int(x) for x in (data.get("question_ids") or [])] or list(by_id)
    if any(qid not in by_id for qid in q_ids) or len(set(q_ids)) != len(q_ids):
        return reject("Набор вопросов не соответствует текущей версии теста")
    expected_n = min(test.question_count or len(by_id), len(by_id))
    if len(q_ids) < expected_n:
        return reject("Количество вопросов меньше требуемого")
    attempt.question_ids = q_ids
    attempt.max_score = sum(by_id[qid].points for qid in q_ids)

    answers_in = {int(a["question_id"]): a for a in (data.get("answers") or [])}
    extra_flags = {}
    if test.time_limit_minutes and attempt.duration_sec and attempt.duration_sec > test.time_limit_minutes * 60 + 60:
        extra_flags["time_exceeded"] = True
    db.add(attempt)
    db.flush()
    for qid in q_ids:
        q = by_id[qid]
        a = answers_in.get(qid, {})
        sel = a.get("selected_option_ids") or []
        txt = (a.get("text_answer") or None)
        if txt:
            txt = txt[:10000]
        ok, pts, review = grade_question(q, sel, txt)
        attempt.answers.append(TestAnswer(question_id=qid, selected_option_ids=[int(x) for x in sel],
                                          text_answer=txt, is_correct=ok, points_awarded=pts,
                                          needs_review=review, extra=extra_flags or None))
    finalize(attempt, test)
    db.flush()
    after_attempt(db, user.id, attempt, test)
    return attempt


def after_attempt(db: Session, user_id: int, attempt: TestAttempt, test: Test) -> None:
    if attempt.status == "graded" and attempt.passed:
        # отмечаем уроки, содержащие этот тест, как завершённые
        mats = db.scalars(select(LessonMaterial).where(LessonMaterial.test_id == test.id)).all()
        for m in mats:
            course_id = m.lesson.module.course_id
            p = db.scalar(select(LessonProgress).where(LessonProgress.user_id == user_id,
                                                       LessonProgress.lesson_id == m.lesson_id))
            now = datetime.now(timezone.utc)
            if p is None:
                p = LessonProgress(user_id=user_id, lesson_id=m.lesson_id, course_id=course_id, started_at=now)
                db.add(p)
            p.status, p.completed_at = "completed", p.completed_at or now
        db.flush()
    if attempt.course_id:
        recompute_course(db, user_id, attempt.course_id)


def attempt_result(attempt: TestAttempt, reveal: bool) -> dict:
    test = attempt.test
    res = {
        "id": attempt.id, "test_id": attempt.test_id, "test_title": test.title, "course_id": attempt.course_id,
        "status": attempt.status, "score": attempt.score, "max_score": attempt.max_score,
        "percent": attempt.percent, "passed": attempt.passed, "pass_score": test.pass_score,
        "attempt_number": attempt.attempt_number, "source": attempt.source,
        "submitted_at": attempt.submitted_at, "duration_sec": attempt.duration_sec,
        "rejection_reason": attempt.rejection_reason,
        "correct_count": sum(1 for a in attempt.answers if a.is_correct),
        "question_total": len(attempt.question_ids or []),
        "answers": [],
    }
    if reveal:
        for a in sorted(attempt.answers, key=lambda x: (attempt.question_ids or []).index(x.question_id)
                        if x.question_id in (attempt.question_ids or []) else 0):
            q = a.question
            res["answers"].append({
                "question_id": q.id, "question_text": q.text, "type": q.type, "points": q.points,
                "selected_option_ids": a.selected_option_ids, "text_answer": a.text_answer,
                "is_correct": a.is_correct, "points_awarded": a.points_awarded, "needs_review": a.needs_review,
                "reviewer_comment": a.reviewer_comment, "explanation": q.explanation,
                "options": [{"id": o.id, "text": o.text, "is_correct": o.is_correct, "position": o.position}
                            for o in q.options],
            })
    return res
