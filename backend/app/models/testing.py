from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, utcnow
from app.models.org import JSONType

QUESTION_TYPES = ("single", "multiple", "text", "ordering")


class Test(TimestampMixin, Base):
    __test__ = False
    __tablename__ = "tests"
    __table_args__ = (
        CheckConstraint("pass_score between 0 and 100", name="pass_score"),
        CheckConstraint("status in ('draft','published','archived')", name="status"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), index=True)
    question_count: Mapped[int | None] = mapped_column(Integer)  # None = все вопросы
    pass_score: Mapped[int] = mapped_column(Integer, default=80, nullable=False)
    time_limit_minutes: Mapped[int | None] = mapped_column(Integer)
    max_attempts: Mapped[int | None] = mapped_column(Integer)  # None = без ограничений
    shuffle_questions: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    shuffle_options: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    show_correct_answers: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    available_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    available_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    questions: Mapped[list["Question"]] = relationship(
        back_populates="test", cascade="all, delete-orphan", order_by="Question.position"
    )


class Question(TimestampMixin, Base):
    __tablename__ = "questions"
    __table_args__ = (CheckConstraint("type in ('single','multiple','text','ordering')", name="type"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    test_id: Mapped[int] = mapped_column(ForeignKey("tests.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    points: Mapped[float] = mapped_column(Float, default=1, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text)
    reference_answer: Mapped[str | None] = mapped_column(Text)  # эталон для открытого вопроса
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    test: Mapped[Test] = relationship(back_populates="questions")
    options: Mapped[list["AnswerOption"]] = relationship(
        back_populates="question", cascade="all, delete-orphan", order_by="AnswerOption.position", lazy="selectin"
    )


class AnswerOption(Base):
    __tablename__ = "answer_options"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # для вопросов на последовательность position — правильный порядок
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    question: Mapped[Question] = relationship(back_populates="options")


class TestAttempt(Base):
    __test__ = False
    __tablename__ = "test_attempts"
    __table_args__ = (
        CheckConstraint("status in ('in_progress','needs_review','graded','rejected')", name="status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID, генерируется клиентом
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    test_id: Mapped[int] = mapped_column(ForeignKey("tests.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), index=True)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="in_progress", nullable=False, index=True)
    score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    max_score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    percent: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    passed: Mapped[bool | None] = mapped_column(Boolean)
    source: Mapped[str] = mapped_column(String(10), default="online", nullable=False)  # online / offline
    question_ids: Mapped[list[int] | None] = mapped_column(JSONType)
    client_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    client_finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_sec: Mapped[int | None] = mapped_column(Integer)
    rejection_reason: Mapped[str | None] = mapped_column(String(255))
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=utcnow, nullable=False
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    test: Mapped[Test] = relationship(lazy="joined")
    answers: Mapped[list["TestAnswer"]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan", lazy="selectin"
    )


class TestAnswer(Base):
    __test__ = False
    __tablename__ = "test_answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id", name="uq_test_answers_attempt_question"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("test_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    selected_option_ids: Mapped[list[int] | None] = mapped_column(JSONType)
    text_answer: Mapped[str | None] = mapped_column(Text)
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    points_awarded: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewer_comment: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    extra: Mapped[dict[str, Any] | None] = mapped_column(JSONType)

    attempt: Mapped[TestAttempt] = relationship(back_populates="answers")
    question: Mapped[Question] = relationship(lazy="joined")
