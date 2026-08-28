from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal, set_session_user
from app.errors import ProblemException
from app.models import User
from app.security import decode_access_token

UNAUTHORIZED = ProblemException(
    401,
    "Nao autenticado",
    "Envie um access token valido no cabecalho Authorization.",
    "https://bealegend.app/problems/unauthorized",
)


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


async def get_db_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Session with the RLS context already bound to the caller, if any.

    Anonymous requests get ``app.user_id`` unset, which makes every policy
    evaluate to false — deny by default.
    """
    token = _bearer(request)
    user_id: UUID | None = None
    if token:
        payload = decode_access_token(token)
        if payload:
            try:
                user_id = UUID(payload["sub"])
            except (KeyError, ValueError):
                user_id = None

    async with SessionLocal() as session:
        await set_session_user(session, user_id)
        request.state.user_id = user_id
        yield session


DbSession = Annotated[AsyncSession, Depends(get_db_session)]


async def get_current_user(request: Request, session: DbSession) -> User:
    user_id: UUID | None = getattr(request.state, "user_id", None)
    if user_id is None:
        raise UNAUTHORIZED
    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active:
        raise UNAUTHORIZED
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_admin_user(user: CurrentUser) -> User:
    if not user.is_admin:
        raise ProblemException(
            403,
            "Acesso negado",
            "Este recurso exige privilegio de administrador.",
            "https://bealegend.app/problems/forbidden",
        )
    return user


AdminUser = Annotated[User, Depends(get_admin_user)]
