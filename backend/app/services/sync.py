"""Приём событий из офлайн-очереди клиента. Идемпотентность — по уникальному event_uuid."""
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    Course,
    CourseAssignment,
    DialogueChoice,
    DialogueRun,
    DialogueScenario,
    LearningEvent,
    Lesson,
    LessonProgress,
    SyncEvent,
    User,
)
from app.services.access import can_view_course
from app.services.grading import attempt_result, submit_attempt
from app.services.progress import recompute_course

EVENT_TYPES = {
    "lesson_open", "lesson_complete", "video_progress", "heartbeat", "test_attempt", "dialogue_run",
    "course_download", "material_download", "course_start",
}


class Rejected(Exception):
    """Событие корректно получено, но не может быть применено (окончательный отказ, повтор не нужен)."""


def _ts(v: Any) -> datetime | None:
    if not v:
        return None
    if isinstance(v, datetime):
        dt = v
    else:
        try:
            dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return min(dt, datetime.now(timezone.utc))


def _lesson(db: Session, user: User, lesson_id) -> Lesson:
    lesson = db.get(Lesson, int(lesson_id)) if lesson_id else None
    if lesson is None:
        raise Rejected("Урок не найден (возможно, удалён из курса)")
    if not can_view_course(db, user, lesson.module.course):
        raise Rejected("Нет доступа к уроку")
    return lesson


def _progress(db: Session, user: User, lesson: Lesson, ts: datetime | None) -> LessonProgress:
    p = db.scalar(select(LessonProgress).where(LessonProgress.user_id == user.id,
                                               LessonProgress.lesson_id == lesson.id))
    if p is None:
        p = LessonProgress(user_id=user.id, lesson_id=lesson.id, course_id=lesson.module.course_id,
                           status="in_progress", started_at=ts or datetime.now(timezone.utc))
        db.add(p)
        db.flush()
    p.last_activity_at = max(filter(None, [p.last_activity_at, ts or datetime.now(timezone.utc)]))
    return p


def apply_event(db: Session, user: User, ev: dict, source: str) -> dict:
    etype = ev["type"]
    data = ev.get("payload") or {}
    ts = _ts(ev.get("client_ts"))
    log = LearningEvent(event_uuid=ev["id"], user_id=user.id, event_type=etype, source=source, client_ts=ts,
                        payload=data)
    result: dict = {}

    if etype in ("lesson_open", "lesson_complete", "video_progress"):
        lesson = _lesson(db, user, data.get("lesson_id"))
        p = _progress(db, user, lesson, ts)
        log.lesson_id, log.course_id = lesson.id, lesson.module.course_id
        if etype == "lesson_complete" and p.status != "completed":
            # разрешение конфликтов: «завершено» не откатывается более ранними событиями
            p.status, p.completed_at = "completed", ts or datetime.now(timezone.utc)
        if etype == "video_progress":
            pos = float(data.get("position_sec") or 0)
            p.video_position_sec = max(0.0, pos)
            if data.get("ended"):
                result["video_ended"] = True
        db.flush()
        a = recompute_course(db, user.id, lesson.module.course_id)
        result.update({"lesson_id": lesson.id, "lesson_status": p.status,
                       "course_progress": a.progress_percent if a else None})

    elif etype == "heartbeat":
        active = int(min(max(int(data.get("active_sec") or 0), 0), settings.heartbeat_max_seconds))
        media = int(min(max(int(data.get("media_sec") or 0), 0), active))
        log.duration_sec = active
        if data.get("lesson_id"):
            try:
                lesson = _lesson(db, user, data.get("lesson_id"))
            except Rejected:
                lesson = None
            if lesson is not None:
                p = _progress(db, user, lesson, ts)
                p.time_spent_sec += active
                p.media_time_sec += media
                log.lesson_id, log.course_id = lesson.id, lesson.module.course_id
        elif data.get("course_id"):
            course = db.get(Course, int(data["course_id"]))
            if course is not None and can_view_course(db, user, course):
                log.course_id = course.id
        if log.course_id:
            a = db.scalar(select(CourseAssignment).where(CourseAssignment.course_id == log.course_id,
                                                         CourseAssignment.user_id == user.id))
            if a:
                a.time_spent_sec += active
        result["accepted_sec"] = active

    elif etype == "test_attempt":
        try:
            attempt = submit_attempt(db, user, {
                "attempt_id": data["attempt_id"], "test_id": data["test_id"], "course_id": data.get("course_id"),
                "question_ids": data.get("question_ids") or [], "answers": data.get("answers") or [],
                "started_at": _ts(data.get("started_at")), "finished_at": _ts(data.get("finished_at")),
            }, source)
        except HTTPException as e:
            raise Rejected(e.detail)
        except (KeyError, ValueError, TypeError):
            raise Rejected("Некорректные данные попытки")
        log.test_id, log.course_id = attempt.test_id, attempt.course_id
        log.duration_sec = attempt.duration_sec or 0
        reveal = attempt.status in ("graded", "needs_review") and attempt.test.show_correct_answers
        result = attempt_result(attempt, reveal)
        result["submitted_at"] = attempt.submitted_at.isoformat() if attempt.submitted_at else None

    elif etype == "dialogue_run":
        scenario = db.get(DialogueScenario, int(data.get("scenario_id") or 0))
        if scenario is None:
            raise Rejected("Сценарий не найден")
        run_id = str(data.get("run_id") or ev["id"])
        existing = db.get(DialogueRun, run_id)
        if existing is None:
            res = score_dialogue(db, scenario, [int(x) for x in data.get("choice_ids") or []])
            existing = DialogueRun(id=run_id, user_id=user.id, scenario_id=scenario.id, source=source, **res)
            if ts:
                existing.finished_at = ts
            db.add(existing)
        result = {"run_id": existing.id, "score": existing.score, "max_score": existing.max_score,
                  "percent": existing.percent, "passed": existing.passed}

    elif etype in ("course_download", "material_download", "course_start"):
        if data.get("course_id"):
            course = db.get(Course, int(data["course_id"]))
            if course is None or not can_view_course(db, user, course):
                raise Rejected("Курс недоступен")
            log.course_id = course.id
            if etype == "course_start":
                recompute_course(db, user.id, course.id)
    else:
        raise Rejected(f"Неизвестный тип события: {etype}")

    db.add(log)
    return result


def score_dialogue(db: Session, scenario: DialogueScenario, choice_ids: list[int]) -> dict:
    """Пересчитывает баллы на сервере по фактическому пути, проверяя связность переходов."""
    nodes = {n.id: n for n in scenario.nodes}
    start = next((n for n in scenario.nodes if n.is_start), scenario.nodes[0] if scenario.nodes else None)
    if start is None:
        raise Rejected("Сценарий пуст")
    node = start
    score = max_score = 0.0
    correct = 0
    for cid in choice_ids:
        ch = db.get(DialogueChoice, cid)
        if ch is None or node is None or ch.node_id != node.id:
            raise Rejected("Путь по сценарию некорректен")
        best = max((c.score for c in node.choices), default=0)
        max_score += best
        score += ch.score
        correct += 1 if ch.is_correct else 0
        node = nodes.get(ch.next_node_id) if ch.next_node_id else None
    pct = round(100 * score / max_score, 1) if max_score else 0.0
    return {"choice_ids": choice_ids, "score": score, "max_score": max_score, "percent": pct,
            "correct_count": correct, "passed": pct >= scenario.pass_score}


def process_batch(db: Session, user: User, events: list[dict], device_id: str | None) -> list[dict]:
    results = []
    for ev in events:
        eid = str(ev.get("id") or "")
        etype = ev.get("type") or ""
        prev = db.scalar(select(SyncEvent).where(SyncEvent.event_uuid == eid))
        if prev is not None:
            if prev.user_id != user.id:
                results.append({"id": eid, "status": "rejected", "error": "Конфликт идентификатора события"})
            else:
                results.append({"id": eid, "status": "duplicate", "result": prev.result,
                                "error": prev.error, "original_status": prev.status})
            continue
        sp = db.begin_nested()
        try:
            if etype not in EVENT_TYPES:
                raise Rejected(f"Неизвестный тип события: {etype}")
            res = apply_event(db, user, ev, "offline" if ev.get("offline") else "online")
            db.add(SyncEvent(event_uuid=eid, user_id=user.id, device_id=device_id, event_type=etype,
                             status="applied", result=_jsonable(res), client_ts=_ts(ev.get("client_ts"))))
            db.flush()
            sp.commit()
            results.append({"id": eid, "status": "applied", "result": _jsonable(res)})
        except Rejected as e:
            sp.rollback()
            db.add(SyncEvent(event_uuid=eid, user_id=user.id, device_id=device_id, event_type=etype,
                             status="rejected", error=str(e), client_ts=_ts(ev.get("client_ts"))))
            db.flush()
            results.append({"id": eid, "status": "rejected", "error": str(e)})
        except IntegrityError:
            # гонка двух параллельных синхронизаций одного события
            sp.rollback()
            results.append({"id": eid, "status": "duplicate"})
    db.add(LearningEvent(user_id=user.id, event_type="sync", source="online",
                         payload={"events": len(events), "device_id": device_id,
                                  "applied": sum(1 for r in results if r["status"] == "applied")}))
    db.commit()
    return results


def _jsonable(obj):
    if isinstance(obj, dict):
        return {k: _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_jsonable(v) for v in obj]
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj
