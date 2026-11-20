from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, utcnow
from app.models.org import JSONType


class DialogueScenario(TimestampMixin, Base):
    __tablename__ = "dialogue_scenarios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    pass_score: Mapped[int] = mapped_column(Integer, default=70, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    characters: Mapped[list["DialogueCharacter"]] = relationship(
        back_populates="scenario", cascade="all, delete-orphan", lazy="selectin", order_by="DialogueCharacter.id"
    )
    nodes: Mapped[list["DialogueNode"]] = relationship(
        back_populates="scenario", cascade="all, delete-orphan", lazy="selectin", order_by="DialogueNode.position"
    )


class DialogueCharacter(Base):
    __tablename__ = "dialogue_characters"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("dialogue_scenarios.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str | None] = mapped_column(String(150))
    color: Mapped[str | None] = mapped_column(String(20))
    scenario: Mapped[DialogueScenario] = relationship(back_populates="characters")


class DialogueNode(Base):
    __tablename__ = "dialogue_nodes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("dialogue_scenarios.id", ondelete="CASCADE"), nullable=False, index=True)
    character_id: Mapped[int | None] = mapped_column(ForeignKey("dialogue_characters.id", ondelete="SET NULL"))
    text: Mapped[str] = mapped_column(Text, nullable=False)
    is_start: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_end: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    scenario: Mapped[DialogueScenario] = relationship(back_populates="nodes")
    choices: Mapped[list["DialogueChoice"]] = relationship(
        back_populates="node", cascade="all, delete-orphan", lazy="selectin",
        foreign_keys="DialogueChoice.node_id", order_by="DialogueChoice.position",
    )


class DialogueChoice(Base):
    __tablename__ = "dialogue_choices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    node_id: Mapped[int] = mapped_column(ForeignKey("dialogue_nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    next_node_id: Mapped[int | None] = mapped_column(ForeignKey("dialogue_nodes.id", ondelete="SET NULL"))
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    feedback: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    node: Mapped[DialogueNode] = relationship(back_populates="choices", foreign_keys=[node_id])


class DialogueRun(Base):
    __tablename__ = "dialogue_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("dialogue_scenarios.id", ondelete="CASCADE"), nullable=False, index=True)
    choice_ids: Mapped[list[int]] = mapped_column(JSONType, nullable=False)
    score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    max_score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    percent: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    correct_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(10), default="online", nullable=False)
    finished_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=utcnow, nullable=False
    )
