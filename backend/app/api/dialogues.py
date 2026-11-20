import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.deps import DB, CurrentUser, StaffUser, audit, get_or_404
from app.models import (
    DialogueCharacter,
    DialogueChoice,
    DialogueNode,
    DialogueRun,
    DialogueScenario,
    User,
)
from app.schemas.common import Msg
from app.services.access import is_staff
from app.services.packages import dialogue_package
from app.services.sync import Rejected, score_dialogue

router = APIRouter(prefix="/api/dialogues", tags=["dialogues"])


class CharacterIn(BaseModel):
    key: str  # клиентский ключ для связей
    name: str = Field(min_length=1, max_length=100)
    role: str | None = None
    color: str | None = Field(default=None, max_length=20)


class ChoiceIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    next_key: str | None = None
    is_correct: bool = False
    score: float = Field(default=0, ge=0, le=100)
    feedback: str | None = None


class NodeIn(BaseModel):
    key: str
    character_key: str | None = None
    text: str = Field(min_length=1, max_length=5000)
    is_start: bool = False
    is_end: bool = False
    choices: list[ChoiceIn] = []


class ScenarioIn(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str | None = None
    status: str = Field(default="draft", pattern="^(draft|published|archived)$")
    pass_score: int = Field(default=70, ge=0, le=100)
    characters: list[CharacterIn] = []
    nodes: list[NodeIn] = Field(min_length=1)


def editor_out(s: DialogueScenario) -> dict:
    """Представление для редактора: ключи = id в виде строк."""
    return {
        "id": s.id, "title": s.title, "description": s.description, "status": s.status, "pass_score": s.pass_score,
        "characters": [{"key": str(c.id), "name": c.name, "role": c.role, "color": c.color} for c in s.characters],
        "nodes": [{"key": str(n.id), "character_key": str(n.character_id) if n.character_id else None,
                   "text": n.text, "is_start": n.is_start, "is_end": n.is_end,
                   "choices": [{"text": c.text, "next_key": str(c.next_node_id) if c.next_node_id else None,
                                "is_correct": c.is_correct, "score": c.score, "feedback": c.feedback}
                               for c in n.choices]} for n in s.nodes],
    }


def _save(db, s: DialogueScenario, data: ScenarioIn) -> None:
    starts = [n for n in data.nodes if n.is_start]
    if len(starts) != 1:
        raise HTTPException(422, "Должна быть ровно одна стартовая реплика")
    keys = {n.key for n in data.nodes}
    if len(keys) != len(data.nodes):
        raise HTTPException(422, "Ключи реплик должны быть уникальны")
    ckeys = {c.key for c in data.characters}
    for n in data.nodes:
        if n.character_key and n.character_key not in ckeys:
            raise HTTPException(422, f"Персонаж реплики «{n.text[:30]}» не найден")
        for ch in n.choices:
            if ch.next_key and ch.next_key not in keys:
                raise HTTPException(422, "Переход ведёт на несуществующую реплику")
        if not n.is_end and not n.choices:
            raise HTTPException(422, f"У реплики «{n.text[:30]}» нет вариантов ответа — отметьте её как финальную")
    s.title, s.description, s.status, s.pass_score = data.title, data.description, data.status, data.pass_score
    # полная пересборка графа (история прохождений хранит id выборов — пересборка допустима только без прохождений)
    s.nodes.clear()
    s.characters.clear()
    db.flush()
    cmap = {}
    for c in data.characters:
        ch = DialogueCharacter(name=c.name, role=c.role, color=c.color)
        s.characters.append(ch)
        cmap[c.key] = ch
    db.flush()
    nmap = {}
    for i, n in enumerate(data.nodes):
        node = DialogueNode(text=n.text, is_start=n.is_start, is_end=n.is_end, position=i,
                            character_id=cmap[n.character_key].id if n.character_key else None)
        s.nodes.append(node)
        nmap[n.key] = node
    db.flush()
    for n in data.nodes:
        for j, ch in enumerate(n.choices):
            nmap[n.key].choices.append(DialogueChoice(text=ch.text, is_correct=ch.is_correct, score=ch.score,
                                                      feedback=ch.feedback, position=j,
                                                      next_node_id=nmap[ch.next_key].id if ch.next_key else None))
    db.flush()


@router.get("")
def list_scenarios(user: CurrentUser, db: DB):
    stmt = select(DialogueScenario).order_by(DialogueScenario.updated_at.desc())
    if not is_staff(user):
        stmt = stmt.where(DialogueScenario.status == "published")
    out = []
    for s in db.scalars(stmt).unique().all():
        runs = db.scalars(select(DialogueRun).where(DialogueRun.scenario_id == s.id,
                                                    *([] if is_staff(user) else [DialogueRun.user_id == user.id]))).all()
        out.append({"id": s.id, "title": s.title, "description": s.description, "status": s.status,
                    "pass_score": s.pass_score, "nodes": len(s.nodes), "characters": len(s.characters),
                    "runs": len(runs), "best_percent": max((r.percent for r in runs), default=None)})
    return out


@router.post("", status_code=201)
def create_scenario(data: ScenarioIn, actor: StaffUser, db: DB, request: Request):
    s = DialogueScenario(title=data.title, created_by=actor.id)
    db.add(s)
    db.flush()
    _save(db, s, data)
    audit(db, actor, "dialogue.create", "dialogue", s.id, {"title": s.title}, request)
    db.commit()
    db.refresh(s)
    return editor_out(s)


@router.get("/{sid}/edit")
def get_for_edit(sid: int, actor: StaffUser, db: DB):
    return editor_out(get_or_404(db, DialogueScenario, sid, "Сценарий не найден"))


@router.put("/{sid}")
def update_scenario(sid: int, data: ScenarioIn, actor: StaffUser, db: DB):
    s = get_or_404(db, DialogueScenario, sid, "Сценарий не найден")
    if db.scalar(select(func.count()).select_from(DialogueRun).where(DialogueRun.scenario_id == s.id)):
        # граф менять нельзя — меняем только метаданные
        s.title, s.description, s.status, s.pass_score = data.title, data.description, data.status, data.pass_score
        db.commit()
        out = editor_out(s)
        out["warning"] = "Сценарий уже проходили — структура диалога не изменена, сохранены только свойства"
        return out
    _save(db, s, data)
    db.commit()
    db.refresh(s)
    return editor_out(s)


@router.delete("/{sid}", response_model=Msg)
def delete_scenario(sid: int, actor: StaffUser, db: DB):
    db.delete(get_or_404(db, DialogueScenario, sid, "Сценарий не найден"))
    db.commit()
    return Msg(detail="Сценарий удалён")


@router.get("/{sid}/play")
def play(sid: int, user: CurrentUser, db: DB):
    s = get_or_404(db, DialogueScenario, sid, "Сценарий не найден")
    if s.status != "published" and not is_staff(user):
        raise HTTPException(403, "Сценарий не опубликован")
    return dialogue_package(s)


class RunIn(BaseModel):
    run_id: uuid.UUID
    choice_ids: list[int]


@router.post("/{sid}/runs")
def submit_run(sid: int, data: RunIn, user: CurrentUser, db: DB):
    s = get_or_404(db, DialogueScenario, sid, "Сценарий не найден")
    run = db.get(DialogueRun, str(data.run_id))
    if run is None:
        try:
            res = score_dialogue(db, s, data.choice_ids)
        except Rejected as e:
            raise HTTPException(422, str(e))
        run = DialogueRun(id=str(data.run_id), user_id=user.id, scenario_id=s.id, **res)
        db.add(run)
        db.commit()
    return {"run_id": run.id, "score": run.score, "max_score": run.max_score, "percent": run.percent,
            "passed": run.passed, "correct_count": run.correct_count}


@router.get("/{sid}/runs")
def list_runs(sid: int, actor: StaffUser, db: DB):
    rows = db.execute(select(DialogueRun, User.full_name).join(User, User.id == DialogueRun.user_id)
                      .where(DialogueRun.scenario_id == sid).order_by(DialogueRun.finished_at.desc())).all()
    return [{"run_id": r.id, "user_name": n, "percent": r.percent, "passed": r.passed, "source": r.source,
             "finished_at": r.finished_at} for r, n in rows]
