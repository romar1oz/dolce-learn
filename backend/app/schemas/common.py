from datetime import date, datetime
from typing import Generic, TypeVar

from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

T = TypeVar("T")

import re as _re

_EMAIL_RE = _re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)+$")


def _email(v: str) -> str:
    v = v.strip().lower()
    if len(v) > 255 or not _EMAIL_RE.match(v):
        raise ValueError("Некорректный email")
    return v


# Внутренние корпоративные домены (*.local) допустимы, поэтому не используем EmailStr
EmailStr = Annotated[str, AfterValidator(_email)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class Msg(BaseModel):
    detail: str


# ---------- users / auth ----------
class UserOut(ORM):
    id: int
    email: str
    full_name: str
    position: str | None = None
    employee_number: str | None = None
    phone: str | None = None
    role: str
    role_name: str
    department_id: int | None = None
    department_name: str | None = None
    is_active: bool
    locale: str = "ru"
    last_login_at: datetime | None = None
    created_at: datetime | None = None

    @classmethod
    def of(cls, u) -> "UserOut":
        return cls(
            id=u.id, email=u.email, full_name=u.full_name, position=u.position, employee_number=u.employee_number,
            phone=u.phone, role=u.role.code, role_name=u.role.name, department_id=u.department_id,
            department_name=u.department.name if u.department else None, is_active=u.is_active, locale=u.locale,
            last_login_at=u.last_login_at, created_at=u.created_at,
        )


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    refresh_expires_at: datetime
    user: UserOut


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=200)

    @field_validator("new_password")
    @classmethod
    def strong(cls, v: str) -> str:
        if not (any(c.isdigit() for c in v) and any(c.isalpha() for c in v)):
            raise ValueError("Пароль должен содержать буквы и цифры")
        return v


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=10, max_length=200)
    role: str
    position: str | None = Field(default=None, max_length=200)
    employee_number: str | None = Field(default=None, max_length=50)
    phone: str | None = Field(default=None, max_length=50)
    department_id: int | None = None
    is_active: bool = True


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    password: str | None = Field(default=None, min_length=10, max_length=200)
    role: str | None = None
    position: str | None = None
    employee_number: str | None = None
    phone: str | None = None
    department_id: int | None = None
    is_active: bool | None = None
    locale: str | None = Field(default=None, pattern="^(ru|kk|en)$")


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    locale: str | None = Field(default=None, pattern="^(ru|kk|en)$")


class RoleOut(ORM):
    id: int
    code: str
    name: str
    description: str | None = None


class DepartmentIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    code: str = Field(min_length=1, max_length=50)
    description: str | None = None
    manager_id: int | None = None


class DepartmentOut(ORM):
    id: int
    name: str
    code: str
    description: str | None = None
    manager_id: int | None = None
    manager_name: str | None = None
    employee_count: int = 0


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    kind: str = Field(default="course", pattern="^(course|library)$")
    description: str | None = None


class CategoryOut(ORM):
    id: int
    name: str
    kind: str
    description: str | None = None


class DateRange(BaseModel):
    date_from: date | None = None
    date_to: date | None = None
