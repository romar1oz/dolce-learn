"""Хеширование паролей, JWT access-токены, refresh-токены и подписанные ссылки на медиа."""
import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode())
    except ValueError:
        return False


def create_access_token(user_id: int, role: str, token_version: int) -> tuple[str, datetime]:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    payload = {"sub": str(user_id), "role": role, "tv": token_version, "type": "access", "exp": exp,
               "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm), exp


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def new_refresh_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(48)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def sign_media(media_id: str, user_id: int, minutes: int | None = None) -> str:
    """Короткоживущая подпись для <video src> / <img src>, где нельзя передать заголовок Authorization."""
    exp = int(time.time()) + 60 * (minutes or settings.media_token_minutes)
    msg = f"{media_id}:{user_id}:{exp}".encode()
    sig = hmac.new(settings.jwt_secret.encode(), msg, hashlib.sha256).hexdigest()[:40]
    return f"{user_id}.{exp}.{sig}"


def verify_media_signature(media_id: str, token: str) -> int | None:
    try:
        uid_s, exp_s, sig = token.split(".")
        uid, exp = int(uid_s), int(exp_s)
    except ValueError:
        return None
    if exp < time.time():
        return None
    msg = f"{media_id}:{uid}:{exp}".encode()
    expected = hmac.new(settings.jwt_secret.encode(), msg, hashlib.sha256).hexdigest()[:40]
    return uid if hmac.compare_digest(expected, sig) else None
