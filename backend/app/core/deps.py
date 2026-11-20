from collections.abc import Callable
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import AuditLog, User
from app.models.org import ROLE_MANAGER, ROLE_METHODIST, ROLE_SUPER_ADMIN
from app.security.tokens import decode_access_token

bearer = HTTPBearer(auto_error=False)

DB = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DB, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется авторизация",
                            headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Срок действия токена истёк")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Недействительный токен")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь не найден или заблокирован")
    if payload.get("tv") != user.token_version:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Сессия отозвана")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: str) -> Callable[..., User]:
    def checker(user: CurrentUser) -> User:
        if user.role.code not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Недостаточно прав")
        return user

    return checker


StaffUser = Annotated[User, Depends(require_roles(ROLE_SUPER_ADMIN, ROLE_METHODIST))]
AdminUser = Annotated[User, Depends(require_roles(ROLE_SUPER_ADMIN))]
ManagerOrStaff = Annotated[User, Depends(require_roles(ROLE_SUPER_ADMIN, ROLE_METHODIST, ROLE_MANAGER))]


def is_staff(user: User) -> bool:
    return user.role.code in (ROLE_SUPER_ADMIN, ROLE_METHODIST)


def scope_department_id(user: User) -> int | None:
    """Для руководителя возвращает id его подразделения (ограничение области данных), для staff — None."""
    if user.role.code == ROLE_MANAGER:
        if user.department_id is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Руководитель не привязан к подразделению")
        return user.department_id
    return None


def ensure_can_view_user(db: Session, viewer: User, target_user_id: int) -> User:
    target = db.get(User, target_user_id)
    if target is None:
        raise HTTPException(404, "Пользователь не найден")
    if is_staff(viewer) or viewer.id == target.id:
        return target
    if viewer.role.code == ROLE_MANAGER and viewer.department_id and target.department_id == viewer.department_id:
        return target
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к данным этого сотрудника")


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def audit(db: Session, user: User | None, action: str, entity_type: str | None = None,
          entity_id: Any = None, details: dict | None = None, request: Request | None = None) -> None:
    db.add(AuditLog(user_id=user.id if user else None, action=action, entity_type=entity_type,
                    entity_id=str(entity_id) if entity_id is not None else None, details=details,
                    ip=client_ip(request) if request else None))


def get_or_404(db: Session, model, obj_id, msg: str = "Объект не найден"):
    obj = db.get(model, obj_id)
    if obj is None:
        raise HTTPException(404, msg)
    return obj


def paginate(db: Session, stmt, page: int, page_size: int):
    from sqlalchemy import func

    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    items = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).unique().all()
    return {"items": items, "total": total or 0, "page": page, "page_size": page_size}
