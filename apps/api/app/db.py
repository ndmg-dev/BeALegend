"""Async engine + session.

Every request-scoped session sets ``app.user_id``, which is what the
Row-Level Security policies read. Isolation lives in Postgres, not in the
application's WHERE clauses.
"""

from collections.abc import AsyncIterator
from uuid import UUID

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session as SyncSession

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


@event.listens_for(SyncSession, "after_begin")
def _apply_rls_context(session: SyncSession, transaction, connection) -> None:  # noqa: ANN001
    """Reaplica ``app.user_id`` a cada transacao aberta por esta sessao.

    ``set_config(..., true)`` e transaction-local — de proposito, porque assim o
    valor nunca vaza para o proximo checkout de uma conexao do pool. O preco e
    que um ``commit`` apaga o contexto: sem este listener, a primeira query
    depois do commit rodaria sem usuario e a policy negaria tudo.
    """
    user_id = session.info.get("app_user_id")
    connection.execute(
        text("SELECT set_config('app.user_id', :uid, true)"),
        {"uid": str(user_id) if user_id else ""},
    )


async def set_session_user(session: AsyncSession, user_id: UUID | None) -> None:
    """Vincula o contexto de RLS a esta sessao, agora e em toda transacao futura."""
    session.info["app_user_id"] = user_id
    await session.execute(
        text("SELECT set_config('app.user_id', :uid, true)"),
        {"uid": str(user_id) if user_id else ""},
    )


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
