from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import (
    DB,
    AdminUser,
    CurrentUser,
    ManagerOrStaff,
    StaffUser,
    audit,
    ensure_can_view_user,
    get_or_404,
    paginate,
    scope_department_id,
)
from app.models import Category, Department, PlatformSetting, Role, User
from app.models.org import ROLE_SUPER_ADMIN
from app.schemas.common import (
    CategoryIn,
    CategoryOut,
    DepartmentIn,
    DepartmentOut,
    Msg,
    Page,
    RoleOut,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.security.tokens import hash_password

users = APIRouter(prefix="/api/users", tags=["users"])
roles = APIRouter(prefix="/api/roles", tags=["roles"])
departments = APIRouter(prefix="/api/departments", tags=["departments"])
categories = APIRouter(prefix="/api/categories", tags=["categories"])
settings_router = APIRouter(prefix="/api/settings", tags=["settings"])


# ---------------- users ----------------
@users.get("", response_model=Page[UserOut])
def list_users(viewer: ManagerOrStaff, db: DB, q: str | None = None, role: str | None = None,
               department_id: int | None = None, is_active: bool | None = None,
               page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=500)):
    stmt = select(User).join(Role).order_by(User.full_name)
    scope = scope_department_id(viewer)
    if scope is not None:
        stmt = stmt.where(User.department_id == scope)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like), User.employee_number.ilike(like),
                              User.position.ilike(like)))
    if role:
        stmt = stmt.where(Role.code == role)
    if department_id:
        stmt = stmt.where(User.department_id == department_id)
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    res = paginate(db, stmt, page, page_size)
    res["items"] = [UserOut.of(u) for u in res["items"]]
    return res


def _role(db, code: str) -> Role:
    r = db.scalar(select(Role).where(Role.code == code))
    if r is None:
        raise HTTPException(422, "Неизвестная роль")
    return r


def _guard_role_change(actor: User, role_code: str) -> None:
    # Только Super Admin может создавать/назначать Super Admin и методистов-администраторов
    if role_code == ROLE_SUPER_ADMIN and actor.role.code != ROLE_SUPER_ADMIN:
        raise HTTPException(403, "Назначать роль Super Admin может только Super Admin")


@users.post("", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, actor: StaffUser, db: DB, request: Request):
    _guard_role_change(actor, data.role)
    if actor.role.code != ROLE_SUPER_ADMIN and data.role not in ("employee", "manager"):
        raise HTTPException(403, "Методист может создавать только сотрудников и руководителей")
    u = User(email=data.email.lower(), full_name=data.full_name, password_hash=hash_password(data.password),
             role_id=_role(db, data.role).id, position=data.position, employee_number=data.employee_number or None,
             phone=data.phone, department_id=data.department_id, is_active=data.is_active)
    db.add(u)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Пользователь с таким email или табельным номером уже существует")
    audit(db, actor, "user.create", "user", u.id, {"email": u.email, "role": data.role}, request)
    db.commit()
    db.refresh(u)
    return UserOut.of(u)


@users.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, viewer: CurrentUser, db: DB):
    return UserOut.of(ensure_can_view_user(db, viewer, user_id))


@users.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, actor: StaffUser, db: DB, request: Request):
    u = get_or_404(db, User, user_id, "Пользователь не найден")
    if u.role.code == ROLE_SUPER_ADMIN and actor.role.code != ROLE_SUPER_ADMIN:
        raise HTTPException(403, "Изменять Super Admin может только Super Admin")
    payload = data.model_dump(exclude_unset=True)
    if "role" in payload and payload["role"]:
        _guard_role_change(actor, payload["role"])
        if actor.role.code != ROLE_SUPER_ADMIN and payload["role"] not in ("employee", "manager"):
            raise HTTPException(403, "Недостаточно прав для назначения этой роли")
        if u.id == actor.id and payload["role"] != actor.role.code:
            raise HTTPException(400, "Нельзя изменить собственную роль")
        u.role_id = _role(db, payload.pop("role")).id
        u.token_version += 1
    payload.pop("role", None)
    if payload.get("password"):
        u.password_hash = hash_password(payload.pop("password"))
        u.token_version += 1
    payload.pop("password", None)
    if payload.get("is_active") is False:
        if u.id == actor.id:
            raise HTTPException(400, "Нельзя заблокировать самого себя")
        u.token_version += 1
    if "email" in payload and payload["email"]:
        payload["email"] = payload["email"].lower()
    for k, v in payload.items():
        setattr(u, k, v)
    try:
        audit(db, actor, "user.update", "user", u.id, {k: v for k, v in data.model_dump(exclude_unset=True).items()
                                                        if k != "password"}, request)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email или табельный номер уже используется")
    db.refresh(u)
    return UserOut.of(u)


@users.delete("/{user_id}", response_model=Msg)
def deactivate_user(user_id: int, actor: StaffUser, db: DB, request: Request):
    """Пользователи не удаляются физически (история обучения важна для аттестации) — только блокируются."""
    u = get_or_404(db, User, user_id, "Пользователь не найден")
    if u.id == actor.id:
        raise HTTPException(400, "Нельзя заблокировать самого себя")
    if u.role.code == ROLE_SUPER_ADMIN and actor.role.code != ROLE_SUPER_ADMIN:
        raise HTTPException(403, "Недостаточно прав")
    u.is_active = False
    u.token_version += 1
    audit(db, actor, "user.deactivate", "user", u.id, None, request)
    db.commit()
    return Msg(detail="Пользователь заблокирован")


# ---------------- roles ----------------
@roles.get("", response_model=list[RoleOut])
def list_roles(_: CurrentUser, db: DB):
    return db.scalars(select(Role).order_by(Role.id)).all()


# ---------------- departments ----------------
def _dep_out(db, d: Department) -> DepartmentOut:
    cnt = db.scalar(select(func.count()).select_from(User).where(User.department_id == d.id, User.is_active)) or 0
    return DepartmentOut(id=d.id, name=d.name, code=d.code, description=d.description, manager_id=d.manager_id,
                         manager_name=d.manager.full_name if d.manager else None, employee_count=cnt)


@departments.get("", response_model=list[DepartmentOut])
def list_departments(_: CurrentUser, db: DB):
    return [_dep_out(db, d) for d in db.scalars(select(Department).order_by(Department.name)).all()]


@departments.post("", response_model=DepartmentOut, status_code=201)
def create_department(data: DepartmentIn, actor: StaffUser, db: DB, request: Request):
    d = Department(**data.model_dump())
    db.add(d)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Подразделение с таким названием или кодом уже существует")
    audit(db, actor, "department.create", "department", d.id, data.model_dump(), request)
    db.commit()
    return _dep_out(db, d)


@departments.patch("/{dep_id}", response_model=DepartmentOut)
def update_department(dep_id: int, data: DepartmentIn, actor: StaffUser, db: DB, request: Request):
    d = get_or_404(db, Department, dep_id)
    for k, v in data.model_dump().items():
        setattr(d, k, v)
    try:
        audit(db, actor, "department.update", "department", d.id, data.model_dump(), request)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Название или код уже используется")
    db.refresh(d)
    return _dep_out(db, d)


@departments.delete("/{dep_id}", response_model=Msg)
def delete_department(dep_id: int, actor: AdminUser, db: DB, request: Request):
    d = get_or_404(db, Department, dep_id)
    if db.scalar(select(func.count()).select_from(User).where(User.department_id == d.id)):
        raise HTTPException(409, "В подразделении есть сотрудники — сначала переведите их")
    db.delete(d)
    audit(db, actor, "department.delete", "department", dep_id, None, request)
    db.commit()
    return Msg(detail="Подразделение удалено")


# ---------------- categories ----------------
@categories.get("", response_model=list[CategoryOut])
def list_categories(_: CurrentUser, db: DB, kind: str | None = None):
    stmt = select(Category).order_by(Category.name)
    if kind:
        stmt = stmt.where(Category.kind == kind)
    return db.scalars(stmt).all()


@categories.post("", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryIn, actor: StaffUser, db: DB):
    c = Category(**data.model_dump())
    db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Такая категория уже существует")
    return c


@categories.patch("/{cat_id}", response_model=CategoryOut)
def update_category(cat_id: int, data: CategoryIn, actor: StaffUser, db: DB):
    c = get_or_404(db, Category, cat_id)
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Такая категория уже существует")
    return c


@categories.delete("/{cat_id}", response_model=Msg)
def delete_category(cat_id: int, actor: StaffUser, db: DB):
    db.delete(get_or_404(db, Category, cat_id))
    db.commit()
    return Msg(detail="Категория удалена")


# ---------------- platform settings ----------------
DEFAULT_SETTINGS = {
    "company_name": "Dolce Pharm",
    "default_pass_score": 80,
    "certificate_validity_months": 12,
    "offline_session_days": 14,
    "max_video_mb": None,
    "support_contact": "Учебный центр, вн. 100",
}


@settings_router.get("")
def get_settings(_: CurrentUser, db: DB):
    data = dict(DEFAULT_SETTINGS)
    for s in db.scalars(select(PlatformSetting)).all():
        data[s.key] = s.value
    return data


@settings_router.put("")
def put_settings(payload: dict, actor: AdminUser, db: DB, request: Request):
    for k, v in payload.items():
        if k not in DEFAULT_SETTINGS:
            raise HTTPException(422, f"Неизвестная настройка: {k}")
        row = db.get(PlatformSetting, k)
        if row:
            row.value = v
        else:
            db.add(PlatformSetting(key=k, value=v))
    audit(db, actor, "settings.update", "settings", None, payload, request)
    db.commit()
    return get_settings(actor, db)
