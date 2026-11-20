from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from app.core.deps import DB, CurrentUser, StaffUser, audit, get_or_404
from app.models import Category, Department, LearningEvent, LibraryMaterial, MediaFile
from app.schemas.common import Msg
from app.services.access import is_staff, library_visible_clause
from app.services.packages import media_brief

router = APIRouter(prefix="/api/library", tags=["library"])


class LibraryIn(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=10000)
    category_id: int | None = None
    media_id: str | None = None
    url: str | None = Field(default=None, max_length=1000, pattern=r"^https?://")
    department_ids: list[int] = []


def out(m: LibraryMaterial) -> dict:
    return {
        "id": m.id, "title": m.title, "description": m.description, "category_id": m.category_id,
        "category_name": m.category.name if m.category else None, "url": m.url, "media_id": m.media_id,
        "media": media_brief(m.media) if m.media else None,
        "department_ids": [d.id for d in m.departments], "department_names": [d.name for d in m.departments],
        "created_at": m.created_at, "updated_at": m.updated_at,
    }


def _apply(db, m: LibraryMaterial, data: LibraryIn) -> None:
    if not data.media_id and not data.url:
        raise HTTPException(422, "Загрузите файл или укажите ссылку")
    if data.media_id and not db.get(MediaFile, data.media_id):
        raise HTTPException(422, "Файл не найден")
    if data.category_id and not db.get(Category, data.category_id):
        raise HTTPException(422, "Категория не найдена")
    m.title, m.description, m.category_id, m.media_id, m.url = (
        data.title, data.description, data.category_id, data.media_id, data.url)
    m.departments = list(db.scalars(select(Department).where(Department.id.in_(data.department_ids))).all()) \
        if data.department_ids else []


@router.get("")
def list_library(user: CurrentUser, db: DB, q: str | None = None, category_id: int | None = None,
                 kind: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=500)):
    stmt = select(LibraryMaterial).outerjoin(MediaFile, MediaFile.id == LibraryMaterial.media_id) \
        .order_by(LibraryMaterial.updated_at.desc())
    if not is_staff(user):
        stmt = stmt.where(library_visible_clause(user))
    if q:
        stmt = stmt.where(or_(LibraryMaterial.title.ilike(f"%{q}%"), LibraryMaterial.description.ilike(f"%{q}%")))
    if category_id:
        stmt = stmt.where(LibraryMaterial.category_id == category_id)
    if kind == "link":
        stmt = stmt.where(LibraryMaterial.media_id.is_(None))
    elif kind:
        stmt = stmt.where(MediaFile.kind == kind)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).unique().all()
    return {"items": [out(m) for m in rows], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=201)
def create_item(data: LibraryIn, user: StaffUser, db: DB, request: Request):
    m = LibraryMaterial(created_by=user.id, title=data.title)
    _apply(db, m, data)
    db.add(m)
    db.flush()
    audit(db, user, "library.create", "library", m.id, {"title": m.title}, request)
    db.commit()
    return out(m)


@router.patch("/{item_id}")
def update_item(item_id: int, data: LibraryIn, user: StaffUser, db: DB, request: Request):
    m = get_or_404(db, LibraryMaterial, item_id, "Материал не найден")
    _apply(db, m, data)
    audit(db, user, "library.update", "library", m.id, {"title": m.title}, request)
    db.commit()
    return out(m)


@router.delete("/{item_id}", response_model=Msg)
def delete_item(item_id: int, user: StaffUser, db: DB, request: Request):
    m = get_or_404(db, LibraryMaterial, item_id, "Материал не найден")
    db.delete(m)
    audit(db, user, "library.delete", "library", item_id, {"title": m.title}, request)
    db.commit()
    return Msg(detail="Материал удалён")


@router.post("/{item_id}/opened", response_model=Msg)
def mark_opened(item_id: int, user: CurrentUser, db: DB):
    get_or_404(db, LibraryMaterial, item_id, "Материал не найден")
    db.add(LearningEvent(user_id=user.id, event_type="library_open", payload={"item_id": item_id}))
    db.commit()
    return Msg(detail="ok")
