import os
import tempfile

# Отдельная тестовая БД и хранилище — задаются до импорта приложения
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://dolce:dolce_dev_password@127.0.0.1:5433/dolce_learn_test")
os.environ["STORAGE_DIR"] = tempfile.mkdtemp(prefix="dolce_test_storage_")
os.environ["JWT_SECRET"] = "test-secret-key-for-pytest-only-0123456789abcdef"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

BACKEND = os.path.dirname(os.path.dirname(__file__))
PASSWORD = "DolceDemo2026!"


@pytest.fixture(scope="session", autouse=True)
def database():
    url = os.environ["DATABASE_URL"]
    eng = create_engine(url)
    with eng.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    eng.dispose()
    cfg = Config(os.path.join(BACKEND, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND, "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    from app.seed import main as seed_main

    seed_main()
    yield


@pytest.fixture(scope="session")
def app():
    from app.main import app as fastapi_app

    return fastapi_app


def login(app, email: str) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    c.user = r.json()["user"]
    return c


@pytest.fixture
def admin(app):
    return login(app, "admin@dolce.local")


@pytest.fixture
def methodist(app):
    return login(app, "methodist@dolce.local")


@pytest.fixture
def manager(app):
    return login(app, "manager@dolce.local")


@pytest.fixture
def employee(app):
    return login(app, "employee@dolce.local")
