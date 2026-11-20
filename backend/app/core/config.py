from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(ROOT_DIR / ".env"), str(BACKEND_DIR / ".env")),
        extra="ignore",
    )

    app_name: str = "Dolce Learn"
    environment: str = "development"
    database_url: str = "postgresql+psycopg://dolce:dolce_dev_password@127.0.0.1:5433/dolce_learn"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    media_token_minutes: int = 240
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    storage_dir: str = str(ROOT_DIR / "storage")
    max_video_mb: int = 1024
    max_document_mb: int = 100
    cookie_secure: bool = False
    seed_demo_password: str = "DolceDemo2026!"
    # Максимум активных секунд, принимаемых в одном heartbeat-событии
    heartbeat_max_seconds: int = 60

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def storage_path(self) -> Path:
        p = Path(self.storage_dir)
        if not p.is_absolute():
            p = (BACKEND_DIR / p).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
