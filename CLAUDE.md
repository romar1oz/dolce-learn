# Dolce Learn — правила проекта

Корпоративная offline-first LMS для производственного персонала Dolce Pharm.

## Стек
- `backend/` — Python 3.12+ (локально 3.14), FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, JWT (PyJWT), bcrypt, openpyxl, ReportLab.
- `frontend/` — React 19 + TypeScript + Vite, Tailwind CSS v4, компоненты в стиле shadcn/ui (`src/components/ui`), Lucide, React Router, TanStack Query, Zustand, React Hook Form + Zod, Recharts, Dexie (IndexedDB), vite-plugin-pwa (Workbox).
- PostgreSQL 17 — единственное постоянное хранилище. Файлы — в `storage/` на локальном диске сервера.

## Локальное окружение (macOS этого разработчика)
- Docker, Node и PostgreSQL в системе не установлены. Переносимые Node 24 и PostgreSQL 17 лежат в `.tools/` (в git не попадают).
- `scripts/dev.sh` — поднимает PostgreSQL (порт 5433, данные в `.data/pg`), миграции, seed, backend :8000 и frontend :5173.
- `scripts/test.sh` — pytest + vitest.
- Для production/других машин: `docker compose up --build`.

## Правила
- Интерфейс по умолчанию на русском; строки навигации и общие строки — через `src/i18n` (ru/kk/en словари, ru — источник).
- Никаких реальных персональных данных — только синтетические.
- Права проверяются на backend (`app/core/deps.py: require_roles`, проверки области подразделения для руководителя). Frontend лишь скрывает разделы.
- Все изменения схемы БД — только через Alembic-миграции (`backend/migrations/versions`).
- Офлайн-события: UUID на клиенте, идемпотентность через уникальный `sync_events.event_uuid`; попытки тестов — UUID попытки как первичный ключ.
- Правильные ответы тестов никогда не отдаются клиенту до завершения попытки; офлайн-попытка оценивается сервером после синхронизации.
- Не хранить токены в localStorage: access — в памяти, refresh — httpOnly cookie (`/api/auth`).
- Не заявлять функцию готовой без проверки (pytest / vitest / прогон в браузере).
- Демо-пароль `DolceDemo2026!` — только для локальной демонстрации.
