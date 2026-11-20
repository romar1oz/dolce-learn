import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from sqlalchemy import func, select, update

from app.core.config import settings
from app.core.deps import DB, CurrentUser, audit, client_ip
from app.models import LearningEvent, RefreshToken, User
from app.schemas.common import ChangePasswordIn, LoginIn, Msg, ProfileUpdate, TokenOut, UserOut
from app.security.tokens import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
REFRESH_COOKIE = "dl_refresh"

# Простейшая защита от перебора паролей (в памяти процесса; для кластера — вынести в Redis)
_failed: dict[str, list[float]] = defaultdict(list)
MAX_FAILS, WINDOW = 8, 300


def _check_rate(key: str) -> None:
    now = time.time()
    _failed[key] = [t for t in _failed[key] if now - t < WINDOW]
    if len(_failed[key]) >= MAX_FAILS:
        raise HTTPException(429, "Слишком много неудачных попыток входа. Повторите через 5 минут.")


def _set_cookie(response: Response, raw: str, expires: datetime) -> None:
    response.set_cookie(
        REFRESH_COOKIE, raw, httponly=True, secure=settings.cookie_secure, samesite="strict",
        path="/api/auth", expires=expires,
    )


def _issue(db, user: User, request: Request, response: Response, family: str | None = None) -> TokenOut:
    access, exp = create_access_token(user.id, user.role.code, user.token_version)
    raw, h = new_refresh_token()
    r_exp = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days)
    db.add(RefreshToken(user_id=user.id, token_hash=h, family_id=family or uuid.uuid4().hex, expires_at=r_exp,
                        user_agent=(request.headers.get("user-agent") or "")[:500], ip=client_ip(request)))
    _set_cookie(response, raw, r_exp)
    return TokenOut(access_token=access, expires_at=exp, refresh_expires_at=r_exp, user=UserOut.of(user))


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, request: Request, response: Response, db: DB):
    key = f"{data.email.lower()}|{client_ip(request)}"
    _check_rate(key)
    user = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    if user is None or not verify_password(data.password, user.password_hash):
        _failed[key].append(time.time())
        audit(db, user, "auth.login_failed", "user", user.id if user else None, {"email": data.email}, request)
        db.commit()
        raise HTTPException(401, "Неверный email или пароль")
    if not user.is_active:
        raise HTTPException(403, "Учётная запись заблокирована")
    _failed.pop(key, None)
    user.last_login_at = datetime.now(timezone.utc)
    out = _issue(db, user, request, response)
    db.add(LearningEvent(user_id=user.id, event_type="login", source="online"))
    audit(db, user, "auth.login", "user", user.id, None, request)
    db.commit()
    return out


@router.post("/refresh", response_model=TokenOut)
def refresh(request: Request, response: Response, db: DB, dl_refresh: str | None = Cookie(default=None)):
    if not dl_refresh:
        raise HTTPException(401, "Нет активной сессии")
    tok = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(dl_refresh)))
    now = datetime.now(timezone.utc)
    if tok is None:
        raise HTTPException(401, "Сессия не найдена")
    if tok.revoked_at is not None:
        # Повторное использование отозванного токена — отзываем всё семейство (возможная кража)
        db.execute(update(RefreshToken).where(RefreshToken.family_id == tok.family_id, RefreshToken.revoked_at.is_(None))
                   .values(revoked_at=now))
        db.commit()
        response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
        raise HTTPException(401, "Сессия отозвана")
    if tok.expires_at < now:
        raise HTTPException(401, "Сессия истекла")
    user = db.get(User, tok.user_id)
    if user is None or not user.is_active:
        raise HTTPException(401, "Пользователь недоступен")
    tok.revoked_at = now
    out = _issue(db, user, request, response, family=tok.family_id)
    db.commit()
    return out


@router.post("/logout", response_model=Msg)
def logout(request: Request, response: Response, db: DB, dl_refresh: str | None = Cookie(default=None)):
    if dl_refresh:
        tok = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(dl_refresh)))
        if tok:
            tok.revoked_at = datetime.now(timezone.utc)
            db.add(LearningEvent(user_id=tok.user_id, event_type="logout", source="online"))
            audit(db, db.get(User, tok.user_id), "auth.logout", "user", tok.user_id, None, request)
            db.commit()
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
    return Msg(detail="Выход выполнен")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return UserOut.of(user)


@router.patch("/me", response_model=UserOut)
def update_me(data: ProfileUpdate, user: CurrentUser, db: DB):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    return UserOut.of(user)


@router.post("/change-password", response_model=Msg)
def change_password(data: ChangePasswordIn, request: Request, user: CurrentUser, db: DB):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(400, "Текущий пароль указан неверно")
    user.password_hash = hash_password(data.new_password)
    user.token_version += 1
    db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
               .values(revoked_at=datetime.now(timezone.utc)))
    audit(db, user, "auth.password_changed", "user", user.id, None, request)
    db.commit()
    return Msg(detail="Пароль изменён. Войдите снова.")
