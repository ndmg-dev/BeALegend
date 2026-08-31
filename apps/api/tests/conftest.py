"""Os testes rodam contra um Postgres de verdade.

RLS nao existe em SQLite. Testar isolamento sem Postgres seria testar o
``WHERE`` da aplicacao — exatamente aquilo de que a arquitetura nao quer
depender. Suba o banco com ``docker compose -f infra/docker-compose.yml up db``
ou aponte TEST_DATABASE_OWNER_URL/TEST_DATABASE_URL para outro servidor.
"""

import os
import subprocess
import sys
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

OWNER_URL = os.environ.get(
    "TEST_DATABASE_OWNER_URL",
    "postgresql+asyncpg://bealegend:changeme@localhost:5432/bealegend_test",
)
APP_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://bealegend_app:changeme_app@localhost:5432/bealegend_test",
)

os.environ["DATABASE_OWNER_URL"] = OWNER_URL
os.environ["DATABASE_URL"] = APP_URL
os.environ.setdefault("JWT_SECRET", "test-secret")
# O cliente ASGI fala com a API direto, sem o prefixo /api do proxy — o cookie
# precisa do caminho interno para o jar do httpx devolvê-lo.
os.environ["REFRESH_COOKIE_PATH"] = "/auth"


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session", autouse=True)
def _migrate():
    """Alembic roda em subprocesso: o env.py chama asyncio.run(), que nao pode
    ser invocado de dentro do loop do pytest-asyncio."""
    api_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=api_dir,
        check=True,
        env={**os.environ, "DATABASE_OWNER_URL": OWNER_URL, "DATABASE_URL": APP_URL},
    )
    yield


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    """O rate limiter e global e por IP. Sem reset, o quinto cadastro da suite
    levaria 429 e mascararia o teste de verdade. O limite em si e coberto por
    test_rate_limit.py."""
    from app.rate_limit import limiter

    limiter.reset()
    yield


@pytest_asyncio.fixture(autouse=True)
async def _dispose_engine():
    """O engine do app e criado no import e fica preso ao loop que o usou
    primeiro. pytest-asyncio abre um loop por teste, entao o pool tem que ser
    descartado no fim de cada um."""
    yield
    from app.db import engine

    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clean_db():
    engine = create_async_engine(OWNER_URL)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                'TRUNCATE notification_delivery, push_subscription, notification_preference, '
                'idempotency_record, habit_checkin, habit, goal, '
                'water_log, meal_log, meal_slot, meal_plan, '
                'budget, "transaction", recurring, category, account, '
                "set_log, cardio_log, body_metric, session, "
                "plan_item, plan_day, training_plan, cardio_protocol, exercise, "
                "refresh_token, app_user CASCADE"
            )
        )
    await engine.dispose()
    yield


@pytest_asyncio.fixture
async def client():
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def owner_engine():
    engine = create_async_engine(OWNER_URL)
    yield engine
    await engine.dispose()


def unique_email(prefix: str = "user") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@exemplo.com"


async def register(
    client: AsyncClient, email: str | None = None, password: str = "senha-de-teste-1"
) -> tuple[str, str]:
    """Cadastra e devolve (email, access_token)."""
    email = email or unique_email()
    resp = await client.post("/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 201, resp.text
    return email, resp.json()["access_token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
