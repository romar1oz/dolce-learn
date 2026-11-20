from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import DB, CurrentUser, StaffUser, audit, get_or_404, paginate
from app.models import Course, LessonMaterial, LibraryMaterial, MediaFile, User
from app.schemas.common import Msg, Page
from app.services.access import can_access_media
from app.services.storage import absolute_path, save_upload
from app.security.tokens import sign_media, verify_media_signature

router = APIRouter(prefix="/api/materials", tags=["materials"])


class MediaOut(BaseModel):
    id: str
    kind: str
    original_name: str
    mime_type: str
    size_bytes: int
    title: str | None = None
    description: str | None = None
    duration_sec: float | None = None
    thumbnail_id: str | None = None
    created_at: object | None = None

    model_config = {"from_attributes": True}


class MediaPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    duration_sec: float | None = None


@router.post("/upload", response_model=MediaOut, status_code=201)
async def upload(
    request: Request, user: StaffUser, db: DB, file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form()] = None, description: Annotated[str | None, Form()] = None,
    duration_sec: Annotated[float | None, Form()] = None,
):
    info = await save_upload(file)
    m = MediaFile(**info, title=(title or info["original_name"])[:255], description=description,
                  duration_sec=duration_sec if info["kind"] == "video" else None, uploaded_by=user.id)
    db.add(m)
    audit(db, user, "media.upload", "media", m.id, {"name": m.original_name, "size": m.size_bytes, "kind": m.kind},
          request)
    db.commit()
    return m


@router.post("/{media_id}/thumbnail", response_model=MediaOut)
async def upload_thumbnail(media_id: str, user: StaffUser, db: DB, file: Annotated[UploadFile, File()]):
    m = get_or_404(db, MediaFile, media_id, "Файл не найден")
    info = await save_upload(file, expected_kinds={"image"})
    thumb = MediaFile(**info, title=f"Превью: {m.title}"[:255], uploaded_by=user.id)
    db.add(thumb)
    db.flush()
    m.thumbnail_id = thumb.id
    db.commit()
    return m


@router.get("", response_model=Page[MediaOut])
def list_media(_: StaffUser, db: DB, kind: str | None = None, q: str | None = None,
               page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200)):
    stmt = select(MediaFile).order_by(MediaFile.created_at.desc())
    if kind:
        stmt = stmt.where(MediaFile.kind == kind)
    if q:
        stmt = stmt.where(or_(MediaFile.title.ilike(f"%{q}%"), MediaFile.original_name.ilike(f"%{q}%")))
    return paginate(db, stmt, page, page_size)


@router.get("/{media_id}", response_model=MediaOut)
def get_media(media_id: str, user: CurrentUser, db: DB):
    m = get_or_404(db, MediaFile, media_id, "Файл не найден")
    if not can_access_media(db, user, m):
        raise HTTPException(403, "Нет доступа к файлу")
    return m


@router.patch("/{media_id}", response_model=MediaOut)
def patch_media(media_id: str, data: MediaPatch, _: StaffUser, db: DB):
    m = get_or_404(db, MediaFile, media_id, "Файл не найден")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    return m


@router.get("/{media_id}/url")
def signed_url(media_id: str, user: CurrentUser, db: DB):
    """Подписанная ссылка для <video>/<img>, где невозможно передать заголовок Authorization."""
    m = get_or_404(db, MediaFile, media_id, "Файл не найден")
    if not can_access_media(db, user, m):
        raise HTTPException(403, "Нет доступа к файлу")
    return {"url": f"/api/materials/{m.id}/file?sig={sign_media(m.id, user.id)}"}


@router.get("/{media_id}/file")
def download(media_id: str, db: DB, request: Request, sig: str | None = None,
             download: bool = False):
    m = get_or_404(db, MediaFile, media_id, "Файл не найден")
    user: User | None = None
    if sig:
        uid = verify_media_signature(m.id, sig)
        user = db.get(User, uid) if uid else None
    else:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            from app.core.deps import get_current_user
            from fastapi.security import HTTPAuthorizationCredentials

            user = get_current_user(db, HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth[7:]))
    if user is None or not user.is_active:
        raise HTTPException(401, "Требуется авторизация")
    if not can_access_media(db, user, m):
        raise HTTPException(403, "Нет доступа к файлу")
    path = absolute_path(m.stored_path)
    if not path.exists():
        raise HTTPException(404, "Файл отсутствует в хранилище")
    return FileResponse(
        path, media_type=m.mime_type,
        filename=m.original_name if download else None,
        content_disposition_type="attachment" if download else "inline",
        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )


@router.delete("/{media_id}", response_model=Msg)
def delete_media(media_id: str, user: StaffUser, db: DB, request: Request):
    m = get_or_404(db, MediaFile, media_id, "Файл не найден")
    used = (db.scalar(select(LessonMaterial.id).where(LessonMaterial.media_id == m.id).limit(1))
            or db.scalar(select(LibraryMaterial.id).where(LibraryMaterial.media_id == m.id).limit(1))
            or db.scalar(select(Course.id).where(Course.cover_media_id == m.id).limit(1)))
    if used:
        raise HTTPException(409, "Файл используется в курсе или библиотеке")
    path = absolute_path(m.stored_path)
    db.delete(m)
    try:
        audit(db, user, "media.delete", "media", media_id, {"name": m.original_name}, request)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Файл используется")
    path.unlink(missing_ok=True)
    return Msg(detail="Файл удалён")
