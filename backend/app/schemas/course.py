from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.content import MATERIAL_KINDS
from app.schemas.common import ORM

URL_PATTERN = r"^(https?://|/)"


class CourseIn(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=20000)
    cover_media_id: str | None = None
    category_id: int | None = None
    department_id: int | None = None
    author_name: str | None = Field(default=None, max_length=255)
    level: str = Field(default="beginner", pattern="^(beginner|intermediate|advanced)$")
    duration_minutes: int = Field(default=0, ge=0, le=100000)
    is_mandatory: bool = False
    publish_date: date | None = None
    due_days: int | None = Field(default=None, ge=1, le=3650)
    pass_score: int = Field(default=80, ge=0, le=100)
    status: str = Field(default="draft", pattern="^(draft|published|archived)$")


class CoursePatch(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = None
    cover_media_id: str | None = None
    category_id: int | None = None
    department_id: int | None = None
    author_name: str | None = None
    level: str | None = Field(default=None, pattern="^(beginner|intermediate|advanced)$")
    duration_minutes: int | None = Field(default=None, ge=0)
    is_mandatory: bool | None = None
    publish_date: date | None = None
    due_days: int | None = Field(default=None, ge=1)
    pass_score: int | None = Field(default=None, ge=0, le=100)
    status: str | None = Field(default=None, pattern="^(draft|published|archived)$")


class CourseSummary(ORM):
    id: int
    title: str
    description: str | None = None
    cover_media_id: str | None = None
    category_id: int | None = None
    category_name: str | None = None
    department_id: int | None = None
    author_id: int | None = None
    author_name: str | None = None
    level: str
    duration_minutes: int
    is_mandatory: bool
    publish_date: date | None = None
    due_days: int | None = None
    pass_score: int
    status: str
    version: int
    module_count: int = 0
    lesson_count: int = 0
    assigned_count: int = 0
    completed_count: int = 0
    updated_at: datetime | None = None
    # для обучающегося
    progress_percent: float | None = None
    assignment_status: str | None = None
    due_date: date | None = None


class ModuleIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None


class LessonIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    duration_minutes: int = Field(default=0, ge=0)
    module_id: int | None = None  # перенос в другой модуль


class ReorderIn(BaseModel):
    ids: list[int]


class MaterialIn(BaseModel):
    kind: str
    title: str | None = Field(default=None, max_length=255)
    body: str | None = Field(default=None, max_length=200000)
    url: str | None = Field(default=None, max_length=1000)
    media_id: str | None = None
    test_id: int | None = None
    dialogue_id: int | None = None

    @field_validator("kind")
    @classmethod
    def kind_ok(cls, v: str) -> str:
        if v not in MATERIAL_KINDS:
            raise ValueError("Неизвестный тип элемента урока")
        return v

    @field_validator("url")
    @classmethod
    def url_ok(cls, v: str | None) -> str | None:
        if v and not (v.startswith("https://") or v.startswith("http://")):
            raise ValueError("Ссылка должна начинаться с http:// или https://")
        return v

    @model_validator(mode="after")
    def check_payload(self):
        k = self.kind
        if k in ("text", "instruction") and not (self.body or "").strip():
            raise ValueError("Заполните текст блока")
        if k == "link" and not self.url:
            raise ValueError("Укажите ссылку")
        if k in ("video", "pdf", "word", "excel", "powerpoint", "image", "file") and not self.media_id:
            raise ValueError("Загрузите файл")
        if k == "test" and not self.test_id:
            raise ValueError("Выберите тест")
        if k == "dialogue" and not self.dialogue_id:
            raise ValueError("Выберите сценарий тренажёра")
        return self


class MediaBrief(ORM):
    id: str
    kind: str
    original_name: str
    mime_type: str
    size_bytes: int
    title: str | None = None
    duration_sec: float | None = None
    thumbnail_id: str | None = None


class MaterialOut(ORM):
    id: int
    lesson_id: int
    kind: str
    title: str | None = None
    body: str | None = None
    url: str | None = None
    media_id: str | None = None
    test_id: int | None = None
    dialogue_id: int | None = None
    position: int
    media: MediaBrief | None = None


class LessonOut(ORM):
    id: int
    module_id: int
    title: str
    description: str | None = None
    position: int
    duration_minutes: int
    materials: list[MaterialOut] = []


class ModuleOut(ORM):
    id: int
    course_id: int
    title: str
    description: str | None = None
    position: int
    lessons: list[LessonOut] = []


class CourseDetail(CourseSummary):
    modules: list[ModuleOut] = []
