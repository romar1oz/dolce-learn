from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import DB, CurrentUser, ManagerOrStaff, StaffUser, audit, ensure_can_view_user, get_or_404, scope_department_id
from app.models import (
    Competency,
    CompetencyAssessment,
    CompetencyQuestion,
    CompetencyReviewer,
    CompetencyScore,
    User,
)
from app.schemas.common import Msg

router = APIRouter(prefix="/api/competencies", tags=["competencies"])
RELATION_RU = {"self": "Самооценка", "manager": "Руководитель", "peer": "Коллеги", "subordinate": "Подчинённые"}


class CompetencyIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = None
    group_name: str | None = None
    questions: list[str] = Field(min_length=1)


def comp_out(c: Competency) -> dict:
    return {"id": c.id, "name": c.name, "description": c.description, "group_name": c.group_name,
            "questions": [{"id": q.id, "text": q.text} for q in c.questions]}


@router.get("")
def list_competencies(_: CurrentUser, db: DB):
    return [comp_out(c) for c in db.scalars(select(Competency).order_by(Competency.name)).all()]


@router.post("", status_code=201)
def create_competency(data: CompetencyIn, actor: StaffUser, db: DB):
    if db.scalar(select(Competency).where(Competency.name == data.name)):
        raise HTTPException(409, "Компетенция с таким названием уже есть")
    c = Competency(name=data.name, description=data.description, group_name=data.group_name)
    c.questions = [CompetencyQuestion(text=t, position=i) for i, t in enumerate(data.questions, 1) if t.strip()]
    db.add(c)
    db.commit()
    return comp_out(c)


@router.put("/{comp_id}")
def update_competency(comp_id: int, data: CompetencyIn, actor: StaffUser, db: DB):
    c = get_or_404(db, Competency, comp_id, "Компетенция не найдена")
    c.name, c.description, c.group_name = data.name, data.description, data.group_name
    used = db.scalar(select(CompetencyScore.id).where(CompetencyScore.competency_id == c.id).limit(1))
    texts = [t for t in data.questions if t.strip()]
    if used:
        if len(texts) != len(c.questions):
            raise HTTPException(409, "По компетенции уже есть оценки: можно менять только формулировки вопросов")
        for q, t in zip(c.questions, texts):
            q.text = t
    else:
        c.questions.clear()
        db.flush()
        c.questions.extend(CompetencyQuestion(text=t, position=i) for i, t in enumerate(texts, 1))
    db.commit()
    return comp_out(c)


@router.delete("/{comp_id}", response_model=Msg)
def delete_competency(comp_id: int, actor: StaffUser, db: DB):
    c = get_or_404(db, Competency, comp_id, "Компетенция не найдена")
    if db.scalar(select(CompetencyScore.id).where(CompetencyScore.competency_id == c.id).limit(1)):
        raise HTTPException(409, "По компетенции уже есть оценки")
    db.delete(c)
    db.commit()
    return Msg(detail="Компетенция удалена")


# ---------------- assessments ----------------
class ReviewerIn(BaseModel):
    user_id: int
    relation: str = Field(pattern="^(self|manager|peer|subordinate)$")


class AssessmentIn(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str | None = None
    subject_user_id: int
    assessment_type: str = Field(default="360", pattern="^(180|360)$")
    scale_min: int = Field(default=1, ge=0, le=10)
    scale_max: int = Field(default=5, ge=1, le=10)
    scale_labels: dict[str, str] | None = None
    due_date: date | None = None
    competency_ids: list[int] = Field(min_length=1)
    reviewers: list[ReviewerIn] = Field(min_length=1)


def assessment_out(a: CompetencyAssessment, db, viewer: User | None = None) -> dict:
    my = None
    if viewer:
        r = next((r for r in a.reviewers if r.reviewer_id == viewer.id), None)
        if r:
            my = {"reviewer_entry_id": r.id, "relation": r.relation, "submitted_at": r.submitted_at}
    return {
        "id": a.id, "title": a.title, "description": a.description, "assessment_type": a.assessment_type,
        "subject_user_id": a.subject_user_id, "subject_name": a.subject.full_name,
        "subject_department": a.subject.department.name if a.subject.department else None,
        "scale_min": a.scale_min, "scale_max": a.scale_max, "scale_labels": a.scale_labels,
        "status": a.status, "due_date": a.due_date, "created_at": a.created_at,
        "competencies": [comp_out(c) for c in a.competencies],
        "reviewers": [{"id": r.id, "user_id": r.reviewer_id, "name": r.reviewer.full_name, "relation": r.relation,
                       "relation_label": RELATION_RU[r.relation], "submitted_at": r.submitted_at} for r in a.reviewers],
        "submitted": sum(1 for r in a.reviewers if r.submitted_at), "total_reviewers": len(a.reviewers),
        "my": my,
    }


@router.get("/assessments")
def list_assessments(user: CurrentUser, db: DB):
    stmt = select(CompetencyAssessment).order_by(CompetencyAssessment.created_at.desc())
    rows = db.scalars(stmt).unique().all()
    out = []
    for a in rows:
        is_reviewer = any(r.reviewer_id == user.id for r in a.reviewers)
        if user.role.code in ("super_admin", "methodist"):
            pass
        elif user.role.code == "manager":
            if not (is_reviewer or a.subject.department_id == user.department_id):
                continue
        elif not is_reviewer:
            continue
        out.append(assessment_out(a, db, user))
    return out


@router.post("/assessments", status_code=201)
def create_assessment(data: AssessmentIn, actor: StaffUser, db: DB, request: Request):
    if data.scale_max <= data.scale_min:
        raise HTTPException(422, "Максимум шкалы должен быть больше минимума")
    subject = get_or_404(db, User, data.subject_user_id, "Оцениваемый сотрудник не найден")
    comps = list(db.scalars(select(Competency).where(Competency.id.in_(data.competency_ids))).all())
    if len(comps) != len(set(data.competency_ids)):
        raise HTTPException(422, "Некоторые компетенции не найдены")
    seen = set()
    a = CompetencyAssessment(title=data.title, description=data.description, subject_user_id=subject.id,
                             assessment_type=data.assessment_type, scale_min=data.scale_min,
                             scale_max=data.scale_max, scale_labels=data.scale_labels, due_date=data.due_date,
                             status="active", created_by=actor.id)
    a.competencies = comps
    for r in data.reviewers:
        if r.user_id in seen:
            continue
        if not db.get(User, r.user_id):
            raise HTTPException(422, f"Участник {r.user_id} не найден")
        if r.relation == "self" and r.user_id != subject.id:
            raise HTTPException(422, "Самооценку может выполнять только оцениваемый сотрудник")
        if data.assessment_type == "180" and r.relation in ("peer", "subordinate"):
            raise HTTPException(422, "Оценка 180 включает только самооценку и оценку руководителя")
        seen.add(r.user_id)
        a.reviewers.append(CompetencyReviewer(reviewer_id=r.user_id, relation=r.relation))
    db.add(a)
    db.flush()
    audit(db, actor, "competency.assessment_create", "competency_assessment", a.id, {"title": a.title}, request)
    db.commit()
    return assessment_out(a, db, actor)


@router.patch("/assessments/{aid}")
def set_status(aid: int, status: str, actor: StaffUser, db: DB):
    if status not in ("active", "closed", "draft"):
        raise HTTPException(422, "Неверный статус")
    a = get_or_404(db, CompetencyAssessment, aid, "Оценка не найдена")
    a.status = status
    db.commit()
    return assessment_out(a, db, actor)


@router.delete("/assessments/{aid}", response_model=Msg)
def delete_assessment(aid: int, actor: StaffUser, db: DB):
    db.delete(get_or_404(db, CompetencyAssessment, aid, "Оценка не найдена"))
    db.commit()
    return Msg(detail="Оценка удалена")


class ScoreIn(BaseModel):
    question_id: int
    score: int
    comment: str | None = Field(default=None, max_length=2000)


class SubmitIn(BaseModel):
    scores: list[ScoreIn]
    comment: str | None = Field(default=None, max_length=5000)


@router.post("/assessments/{aid}/submit")
def submit_scores(aid: int, data: SubmitIn, user: CurrentUser, db: DB):
    a = get_or_404(db, CompetencyAssessment, aid, "Оценка не найдена")
    if a.status != "active":
        raise HTTPException(409, "Оценка закрыта")
    entry = next((r for r in a.reviewers if r.reviewer_id == user.id), None)
    if entry is None:
        raise HTTPException(403, "Вы не участвуете в этой оценке")
    if entry.submitted_at:
        raise HTTPException(409, "Вы уже отправили оценку")
    qmap = {q.id: c.id for c in a.competencies for q in c.questions}
    got = {s.question_id for s in data.scores}
    if got != set(qmap):
        raise HTTPException(422, "Нужно оценить все вопросы")
    for s in data.scores:
        if not (a.scale_min <= s.score <= a.scale_max):
            raise HTTPException(422, f"Оценка должна быть в диапазоне {a.scale_min}–{a.scale_max}")
        entry.scores.append(CompetencyScore(question_id=s.question_id, competency_id=qmap[s.question_id],
                                            score=s.score, comment=s.comment))
    entry.submitted_at = datetime.now(timezone.utc)
    entry.comment = data.comment
    db.commit()
    return assessment_out(a, db, user)


@router.get("/assessments/{aid}/results")
def results(aid: int, viewer: ManagerOrStaff, db: DB):
    a = get_or_404(db, CompetencyAssessment, aid, "Оценка не найдена")
    ensure_can_view_user(db, viewer, a.subject_user_id) if scope_department_id(viewer) else None
    relations = sorted({r.relation for r in a.reviewers}, key=list(RELATION_RU).index)
    table = []
    for c in a.competencies:
        row = {"competency_id": c.id, "competency": c.name, "by_relation": {}, "overall": None}
        allv = []
        for rel in relations:
            vals = [s.score for r in a.reviewers if r.relation == rel and r.submitted_at
                    for s in r.scores if s.competency_id == c.id]
            row["by_relation"][rel] = round(sum(vals) / len(vals), 2) if vals else None
            # «Самооценка» не входит в среднюю внешнюю оценку
            if rel != "self":
                allv += vals
        row["overall"] = round(sum(allv) / len(allv), 2) if allv else None
        table.append(row)
    comments = [{"relation": RELATION_RU[r.relation], "comment": r.comment} for r in a.reviewers
                if r.submitted_at and r.comment and r.relation != "peer"] + \
               [{"relation": RELATION_RU["peer"], "comment": r.comment} for r in a.reviewers
                if r.submitted_at and r.comment and r.relation == "peer"]
    return {"assessment": assessment_out(a, db), "relations": [{"code": r, "label": RELATION_RU[r]} for r in relations],
            "table": table, "comments": comments}
