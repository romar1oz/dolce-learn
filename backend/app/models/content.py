from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, utcnow

COURSE_STATUSES = ("draft", "published", "archived")
COURSE_LEVELS = ("beginner", "intermediate", "advanced")
MATERIAL_KINDS = (
    "text", "video", "pdf", "word", "excel", "powerpoint", "image", "link", "test", "instruction", "file", "dialogue",
)
MEDIA_KINDS = ("video", "pdf", "word", "excel", "powerpoint", "image", "file")


class Category(TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("kind", "name", name="uq_categories_kind_name"),
                      CheckConstraint("kind in ('course','library')", name="kind"))
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="course")
    description: Mapped[str | None] = mapped_column(Text)


class MediaFile(Base):
    __tablename__ = "media_files"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    kind: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    duration_sec: Mapped[float | None] = mapped_column(Float)
    thumbnail_id: Mapped[str | None] = mapped_column(ForeignKey("media_files.id", ondelete="SET NULL"))
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=utcnow, nullable=False
    )


class Course(TimestampMixin, Base):
    __tablename__ = "courses"
    __table_args__ = (
        CheckConstraint("status in ('draft','published','archived')", name="status"),
        CheckConstraint("pass_score between 0 and 100", name="pass_score"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    cover_media_id: Mapped[str | None] = mapped_column(ForeignKey("media_files.id", ondelete="SET NULL"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    author_name: Mapped[str | None] = mapped_column(String(255))
    level: Mapped[str] = mapped_column(String(20), default="beginner", nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    publish_date: Mapped[date | None] = mapped_column(Date)
    due_days: Mapped[int | None] = mapped_column(Integer)
    pass_score: Mapped[int] = mapped_column(Integer, default=80, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    modules: Mapped[list["CourseModule"]] = relationship(
        back_populates="course", cascade="all, delete-orphan", order_by="CourseModule.position"
    )
    category: Mapped[Category | None] = relationship(lazy="joined")


class CourseModule(TimestampMixin, Base):
    __tablename__ = "course_modules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    course: Mapped[Course] = relationship(back_populates="modules")
    lessons: Mapped[list["Lesson"]] = relationship(
        back_populates="module", cascade="all, delete-orphan", order_by="Lesson.position"
    )


class Lesson(TimestampMixin, Base):
    __tablename__ = "lessons"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("course_modules.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    module: Mapped[CourseModule] = relationship(back_populates="lessons")
    materials: Mapped[list["LessonMaterial"]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan", order_by="LessonMaterial.position"
    )


class LessonMaterial(TimestampMixin, Base):
    __tablename__ = "lesson_materials"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str | None] = mapped_column(String(255))
    body: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(String(1000))
    media_id: Mapped[str | None] = mapped_column(ForeignKey("media_files.id", ondelete="SET NULL"), index=True)
    test_id: Mapped[int | None] = mapped_column(ForeignKey("tests.id", ondelete="SET NULL"), index=True)
    dialogue_id: Mapped[int | None] = mapped_column(ForeignKey("dialogue_scenarios.id", ondelete="SET NULL"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    lesson: Mapped[Lesson] = relationship(back_populates="materials")
    media: Mapped[MediaFile | None] = relationship(lazy="joined")


library_material_departments = Table(
    "library_material_departments",
    Base.metadata,
    Column("material_id", ForeignKey("library_materials.id", ondelete="CASCADE"), primary_key=True),
    Column("department_id", ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
)


class LibraryMaterial(TimestampMixin, Base):
    __tablename__ = "library_materials"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), index=True)
    media_id: Mapped[str | None] = mapped_column(ForeignKey("media_files.id", ondelete="SET NULL"))
    url: Mapped[str | None] = mapped_column(String(1000))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    category: Mapped[Category | None] = relationship(lazy="joined")
    media: Mapped[MediaFile | None] = relationship(lazy="joined")
    departments: Mapped[list["Department"]] = relationship(  # noqa: F821
        secondary=library_material_departments, lazy="selectin"
    )
