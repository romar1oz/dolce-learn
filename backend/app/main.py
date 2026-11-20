import logging

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text

from app.api import analytics, auth, certificates, competencies, courses, dialogues, learning, library, materials, org, tests
from app.core.config import settings
from app.core.deps import DB, AdminUser
from app.models import AuditLog

log = logging.getLogger("dolce")

app = FastAPI(
    title="Dolce Learn API",
    version="1.0.0",
    description="REST API корпоративной LMS Dolce Learn (Dolce Pharm). Авторизация: Bearer JWT. "
                "Готово к интеграции с 1С и Битрикс24 через выгрузки /api/reports и /api/analytics.",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    if request.url.path.startswith("/api/") and "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-store"
    return response


def _humanize(err: dict) -> str:
    loc = ".".join(str(x) for x in err.get("loc", []) if x not in ("body", "query", "path"))
    msg = err.get("msg", "")
    if msg.startswith("Value error, "):
        msg = msg[len("Value error, "):]
    return f"{loc}: {msg}" if loc else msg


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    return JSONResponse(status_code=422, content={
        "detail": "; ".join(_humanize(e) for e in errors[:5]) or "Ошибка валидации",
        "errors": [{"loc": e.get("loc"), "msg": e.get("msg")} for e in errors],
    })


for r in (auth.router, org.users, org.roles, org.departments, org.categories, org.settings_router,
          materials.router, courses.router, courses.modules, courses.lessons, library.router,
          tests.router, tests.attempts, learning.sync_router, learning.assignments, learning.progress,
          analytics.router, analytics.reports, certificates.router, certificates.protocols,
          competencies.router, dialogues.router):
    app.include_router(r)


@app.get("/api/health", tags=["system"])
def health(db: DB):
    db.execute(text("select 1"))
    return {"status": "ok", "app": settings.app_name, "environment": settings.environment}


@app.get("/api/audit", tags=["system"])
def audit_log(_: AdminUser, db: DB, limit: int = Query(100, ge=1, le=1000), action: str | None = None):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"{action}%"))
    return [{"id": a.id, "action": a.action, "user_name": a.user.full_name if a.user else None,
             "entity_type": a.entity_type, "entity_id": a.entity_id, "details": a.details, "ip": a.ip,
             "created_at": a.created_at} for a in db.scalars(stmt).unique().all()]
