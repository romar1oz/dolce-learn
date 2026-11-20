from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.org import JSONType, User

REVIEWER_RELATIONS = ("self", "manager", "peer", "subordinate")


class Competency(TimestampMixin, Base):
    __tablename__ = "competencies"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    group_name: Mapped[str | None] = mapped_column(String(100))
    questions: Mapped[list["CompetencyQuestion"]] = relationship(
        back_populates="competency", cascade="all, delete-orphan", order_by="CompetencyQuestion.position",
        lazy="selectin",
    )


class CompetencyQuestion(Base):
    __tablename__ = "competency_questions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    competency_id: Mapped[int] = mapped_column(ForeignKey("competencies.id", ondelete="CASCADE"), nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    competency: Mapped[Competency] = relationship(back_populates="questions")


assessment_competencies = Table(
    "competency_assessment_competencies",
    Base.metadata,
    Column("assessment_id", ForeignKey("competency_assessments.id", ondelete="CASCADE"), primary_key=True),
    Column("competency_id", ForeignKey("competencies.id", ondelete="CASCADE"), primary_key=True),
)


class CompetencyAssessment(TimestampMixin, Base):
    __tablename__ = "competency_assessments"
    __table_args__ = (
        CheckConstraint("status in ('draft','active','closed')", name="status"),
        CheckConstraint("scale_max > scale_min", name="scale"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    subject_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assessment_type: Mapped[str] = mapped_column(String(10), default="360", nullable=False)  # 180 / 360
    scale_min: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    scale_max: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    scale_labels: Mapped[dict | None] = mapped_column(JSONType)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    subject: Mapped[User] = relationship(foreign_keys=[subject_user_id], lazy="joined")
    competencies: Mapped[list[Competency]] = relationship(secondary=assessment_competencies, lazy="selectin")
    reviewers: Mapped[list["CompetencyReviewer"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan", lazy="selectin"
    )


class CompetencyReviewer(Base):
    __tablename__ = "competency_reviewers"
    __table_args__ = (
        UniqueConstraint("assessment_id", "reviewer_id", name="uq_competency_reviewers_assessment_reviewer"),
        CheckConstraint("relation in ('self','manager','peer','subordinate')", name="relation"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("competency_assessments.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    relation: Mapped[str] = mapped_column(String(20), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    comment: Mapped[str | None] = mapped_column(Text)

    assessment: Mapped[CompetencyAssessment] = relationship(back_populates="reviewers")
    reviewer: Mapped[User] = relationship(lazy="joined")
    scores: Mapped[list["CompetencyScore"]] = relationship(
        back_populates="reviewer_entry", cascade="all, delete-orphan", lazy="selectin"
    )


class CompetencyScore(Base):
    __tablename__ = "competency_scores"
    __table_args__ = (UniqueConstraint("reviewer_entry_id", "question_id", name="uq_competency_scores_entry_question"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reviewer_entry_id: Mapped[int] = mapped_column(ForeignKey("competency_reviewers.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("competency_questions.id", ondelete="CASCADE"), nullable=False, index=True)
    competency_id: Mapped[int] = mapped_column(ForeignKey("competencies.id", ondelete="CASCADE"), nullable=False, index=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)

    reviewer_entry: Mapped[CompetencyReviewer] = relationship(back_populates="scores")
