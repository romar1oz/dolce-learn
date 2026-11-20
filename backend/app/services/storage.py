"""Безопасное хранение загруженных файлов: белый список расширений, проверка сигнатур, случайные имена."""
import hashlib
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.config import settings

# extension -> (kind, mime)
ALLOWED: dict[str, tuple[str, str]] = {
    ".mp4": ("video", "video/mp4"),
    ".m4v": ("video", "video/mp4"),
    ".webm": ("video", "video/webm"),
    ".mov": ("video", "video/quicktime"),
    ".pdf": ("pdf", "application/pdf"),
    ".doc": ("word", "application/msword"),
    ".docx": ("word", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ".xls": ("excel", "application/vnd.ms-excel"),
    ".xlsx": ("excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ".ppt": ("powerpoint", "application/vnd.ms-powerpoint"),
    ".pptx": ("powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ".png": ("image", "image/png"),
    ".jpg": ("image", "image/jpeg"),
    ".jpeg": ("image", "image/jpeg"),
    ".webp": ("image", "image/webp"),
    ".gif": ("image", "image/gif"),
    ".txt": ("file", "text/plain"),
    ".csv": ("file", "text/csv"),
    ".zip": ("file", "application/zip"),
}

OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
ZIP = (b"PK\x03\x04", b"PK\x05\x06")


def _signature_ok(ext: str, head: bytes) -> bool:
    if ext in (".mp4", ".m4v", ".mov"):
        return head[4:8] in (b"ftyp", b"moov", b"mdat", b"wide", b"free", b"skip")
    if ext == ".webm":
        return head.startswith(b"\x1a\x45\xdf\xa3")
    if ext == ".pdf":
        return head.startswith(b"%PDF")
    if ext in (".docx", ".xlsx", ".pptx", ".zip"):
        return head.startswith(ZIP)
    if ext in (".doc", ".xls", ".ppt"):
        return head.startswith(OLE)
    if ext == ".png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if ext in (".jpg", ".jpeg"):
        return head.startswith(b"\xff\xd8\xff")
    if ext == ".gif":
        return head.startswith((b"GIF87a", b"GIF89a"))
    if ext == ".webp":
        return head.startswith(b"RIFF") and head[8:12] == b"WEBP"
    if ext in (".txt", ".csv"):
        try:
            head.decode("utf-8")
            return b"\x00" not in head
        except UnicodeDecodeError:
            # возможно, обрезан многобайтовый символ на границе — допускаем, если нет нулевых байтов
            return b"\x00" not in head
    return False


def classify(filename: str) -> tuple[str, str, str]:
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(415, f"Тип файла {ext or '(без расширения)'} не поддерживается. "
                                 f"Разрешены: {', '.join(sorted(ALLOWED))}")
    kind, mime = ALLOWED[ext]
    return ext, kind, mime


def max_bytes(kind: str) -> int:
    mb = settings.max_video_mb if kind == "video" else settings.max_document_mb
    return mb * 1024 * 1024


async def save_upload(file: UploadFile, expected_kinds: set[str] | None = None) -> dict:
    ext, kind, mime = classify(file.filename or "")
    if expected_kinds and kind not in expected_kinds:
        raise HTTPException(415, f"Ожидается файл типа: {', '.join(sorted(expected_kinds))}")
    limit = max_bytes(kind)
    media_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    rel = Path(f"{now:%Y}/{now:%m}/{media_id}{ext}")
    dest = settings.storage_path / "media" / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    sha = hashlib.sha256()
    size = 0
    head = b""
    try:
        with open(tmp, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                if not head:
                    head = chunk[:64]
                    if not _signature_ok(ext, head):
                        raise HTTPException(415, "Содержимое файла не соответствует его расширению")
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"Файл превышает допустимый размер {limit // (1024 * 1024)} МБ")
                sha.update(chunk)
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, "Файл пустой")
        os.replace(tmp, dest)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return {"id": media_id, "kind": kind, "mime_type": mime, "size_bytes": size, "sha256": sha.hexdigest(),
            "stored_path": str(Path("media") / rel), "original_name": Path(file.filename or "file").name[:255]}


def absolute_path(stored_path: str) -> Path:
    base = settings.storage_path.resolve()
    p = (base / stored_path).resolve()
    if base not in p.parents:
        raise HTTPException(400, "Недопустимый путь")
    return p
