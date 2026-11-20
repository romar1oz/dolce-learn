"""Сборка офлайн-пакета курса и «безопасного» представления теста для обучающегося."""
import random
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Course,
    CourseAssignment,
    DialogueScenario,
    LessonProgress,
    MediaFile,
    Test,
    TestAttempt,
    User,
)


def learner_test(db: Session, t: Test, user: User | None = None) -> dict:
    """Тест без правильных ответов. Варианты вопросов на последовательность всегда перемешиваются."""
    rnd = random.Random()
    questions = []
    for q in t.questions:
        opts = [{"id": o.id, "text": o.text} for o in sorted(q.options, key=lambda o: o.id)]
        if q.type == "ordering":
            rnd.shuffle(opts)
        questions.append({"id": q.id, "type": q.type, "text": q.text, "points": q.points, "options": opts,
                          "multiple": q.type == "multiple"})
    used = 0
    best = None
    pending = 0
    if user is not None:
        used = db.scalar(select(func.count()).select_from(TestAttempt).where(
            TestAttempt.test_id == t.id, TestAttempt.user_id == user.id,
            TestAttempt.status.in_(("graded", "needs_review")))) or 0
        best = db.scalar(select(func.max(TestAttempt.percent)).where(
            TestAttempt.test_id == t.id, TestAttempt.user_id == user.id, TestAttempt.status == "graded"))
        pending = db.scalar(select(func.count()).select_from(TestAttempt).where(
            TestAttempt.test_id == t.id, TestAttempt.user_id == user.id, TestAttempt.status == "needs_review")) or 0
    return {
        "id": t.id, "title": t.title, "description": t.description, "course_id": t.course_id,
        "pass_score": t.pass_score, "time_limit_minutes": t.time_limit_minutes, "max_attempts": t.max_attempts,
        "shuffle_questions": t.shuffle_questions, "shuffle_options": t.shuffle_options,
        "question_count": t.question_count, "status": t.status,
        "available_from": t.available_from, "available_until": t.available_until,
        "questions": questions, "attempts_used": used, "best_percent": best, "pending_review": pending,
    }


def dialogue_package(s: DialogueScenario) -> dict:
    return {
        "id": s.id, "title": s.title, "description": s.description, "pass_score": s.pass_score,
        "characters": [{"id": c.id, "name": c.name, "role": c.role, "color": c.color} for c in s.characters],
        "nodes": [{"id": n.id, "character_id": n.character_id, "text": n.text, "is_start": n.is_start,
                   "is_end": n.is_end,
                   "choices": [{"id": ch.id, "text": ch.text, "next_node_id": ch.next_node_id,
                                "is_correct": ch.is_correct, "score": ch.score, "feedback": ch.feedback}
                               for ch in n.choices]} for n in s.nodes],
    }


def media_brief(m: MediaFile) -> dict:
    return {"id": m.id, "kind": m.kind, "mime_type": m.mime_type, "size_bytes": m.size_bytes,
            "original_name": m.original_name, "title": m.title, "duration_sec": m.duration_sec,
            "thumbnail_id": m.thumbnail_id}


def build_package(db: Session, c: Course, user: User) -> dict:
    from app.api.courses import summary
    from app.schemas.course import ModuleOut

    s = summary(db, c, user)
    modules = [ModuleOut.model_validate(m).model_dump(mode="json") for m in c.modules]
    media: dict[str, MediaFile] = {}
    test_ids: set[int] = set()
    dialogue_ids: set[int] = set()
    lesson_ids: list[int] = []
    if c.cover_media_id:
        m = db.get(MediaFile, c.cover_media_id)
        if m:
            media[m.id] = m
    for mod in c.modules:
        for lesson in mod.lessons:
            lesson_ids.append(lesson.id)
            for mat in lesson.materials:
                if mat.media_id and mat.media:
                    media[mat.media.id] = mat.media
                    if mat.media.thumbnail_id:
                        th = db.get(MediaFile, mat.media.thumbnail_id)
                        if th:
                            media[th.id] = th
                if mat.test_id:
                    test_ids.add(mat.test_id)
                if mat.dialogue_id:
                    dialogue_ids.add(mat.dialogue_id)
    tests = [learner_test(db, t, user) for t in db.scalars(select(Test).where(Test.id.in_(test_ids))).all()
             if t.status == "published"]
    dialogues = [dialogue_package(d) for d in
                 db.scalars(select(DialogueScenario).where(DialogueScenario.id.in_(dialogue_ids))).all()]
    progress = {}
    if lesson_ids:
        for p in db.scalars(select(LessonProgress).where(LessonProgress.user_id == user.id,
                                                         LessonProgress.lesson_id.in_(lesson_ids))).all():
            progress[p.lesson_id] = {"status": p.status, "time_spent_sec": p.time_spent_sec,
                                     "video_position_sec": p.video_position_sec,
                                     "completed_at": p.completed_at.isoformat() if p.completed_at else None}
    a = db.scalar(select(CourseAssignment).where(CourseAssignment.course_id == c.id,
                                                 CourseAssignment.user_id == user.id))
    return {
        "course": {**s.model_dump(mode="json"), "modules": modules},
        "version": c.version,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "tests": tests,
        "dialogues": dialogues,
        "media": [media_brief(m) for m in media.values()],
        "total_bytes": sum(m.size_bytes for m in media.values()),
        "progress": progress,
        "assignment": None if a is None else {
            "status": a.status, "progress_percent": a.progress_percent,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "best_score": a.best_score,
        },
    }
