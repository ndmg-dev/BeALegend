"""Cadastro, login, rotacao de refresh token e logout.

Tabelas do plano de autenticacao (``app_user``, ``refresh_token``) nao tem RLS:
elas sao lidas antes de existir um usuario autenticado. Todo acesso a elas passa
por este modulo, que nunca aceita filtro vindo do cliente. As tabelas de *dados*
do usuario sao protegidas por RLS no Postgres.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Request, Response
from sqlalchemy import select, update

from app.config import get_settings
from app.deps import CurrentUser, DbSession
from app.errors import ProblemException
from app.ids import uuid7
from app.models import RefreshToken, User
from app.rate_limit import limiter
from app.schemas.auth import AccessToken, LoginRequest, RegisterRequest, UserOut, UserUpdate
from app.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

REFRESH_COOKIE = "bl_refresh"
REFRESH_PATH = settings.refresh_cookie_path

INVALID_CREDENTIALS = ProblemException(
    401,
    "Credenciais invalidas",
    "E-mail ou senha incorretos.",
    "https://bealegend.app/problems/invalid-credentials",
)
INVALID_REFRESH = ProblemException(
    401,
    "Sessao expirada",
    "O refresh token e invalido, expirou ou ja foi usado.",
    "https://bealegend.app/problems/invalid-refresh",
)


def _set_refresh_cookie(response: Response, raw: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        raw,
        max_age=settings.refresh_token_ttl_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=REFRESH_PATH,
        domain=settings.cookie_domain or None,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_PATH,
        domain=settings.cookie_domain or None,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


async def _issue_refresh(session: DbSession, user_id, family_id=None) -> str:
    raw, digest = new_refresh_token()
    session.add(
        RefreshToken(
            id=uuid7(),
            user_id=user_id,
            token_hash=digest,
            family_id=family_id or uuid7(),
            expira_em=datetime.now(UTC) + timedelta(days=settings.refresh_token_ttl_days),
            criado_em=datetime.now(UTC),
        )
    )
    return raw


@router.post("/register", response_model=AccessToken, status_code=201)
@limiter.limit(settings.rate_limit_register)
async def register(
    request: Request, response: Response, body: RegisterRequest, session: DbSession
) -> AccessToken:
    existing = await session.scalar(select(User.id).where(User.email == body.email.lower()))
    if existing:
        raise ProblemException(
            409,
            "E-mail ja cadastrado",
            "Ja existe uma conta com este e-mail.",
            "https://bealegend.app/problems/email-taken",
        )
    user = User(
        id=uuid7(),
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        nome=body.nome,
        timezone=body.timezone,
    )
    session.add(user)
    await session.flush()
    raw = await _issue_refresh(session, user.id)
    await session.commit()

    token, expires_in = create_access_token(user.id)
    _set_refresh_cookie(response, raw)
    return AccessToken(access_token=token, expires_in=expires_in)


@router.post("/login", response_model=AccessToken)
@limiter.limit(settings.rate_limit_login)
async def login(
    request: Request, response: Response, body: LoginRequest, session: DbSession
) -> AccessToken:
    user = await session.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        raise INVALID_CREDENTIALS

    raw = await _issue_refresh(session, user.id)
    await session.commit()

    token, expires_in = create_access_token(user.id)
    _set_refresh_cookie(response, raw)
    return AccessToken(access_token=token, expires_in=expires_in)


@router.post("/refresh", response_model=AccessToken)
@limiter.limit(settings.rate_limit_refresh)
async def refresh(request: Request, response: Response, session: DbSession) -> AccessToken:
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise INVALID_REFRESH

    digest = hash_refresh_token(raw)
    row = await session.scalar(select(RefreshToken).where(RefreshToken.token_hash == digest))
    if row is None or row.revogado_em is not None:
        _clear_refresh_cookie(response)
        raise INVALID_REFRESH

    now = datetime.now(UTC)

    # Reuse detection: a token presented twice means it leaked. Burn the family.
    if row.usado_em is not None:
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == row.family_id, RefreshToken.revogado_em.is_(None))
            .values(revogado_em=now)
        )
        await session.commit()
        _clear_refresh_cookie(response)
        raise INVALID_REFRESH

    if row.expira_em <= now:
        _clear_refresh_cookie(response)
        raise INVALID_REFRESH

    row.usado_em = now
    new_raw = await _issue_refresh(session, row.user_id, family_id=row.family_id)
    await session.commit()

    token, expires_in = create_access_token(row.user_id)
    _set_refresh_cookie(response, new_raw)
    return AccessToken(access_token=token, expires_in=expires_in)


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, session: DbSession) -> Response:
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        row = await session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw))
        )
        if row is not None:
            await session.execute(
                update(RefreshToken)
                .where(RefreshToken.family_id == row.family_id, RefreshToken.revogado_em.is_(None))
                .values(revogado_em=datetime.now(UTC))
            )
            await session.commit()
    _clear_refresh_cookie(response)
    response.status_code = 204
    return response


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserOut)
async def update_me(body: UserUpdate, user: CurrentUser, session: DbSession) -> User:
    if body.nome is not None:
        user.nome = body.nome
    if body.timezone is not None:
        user.timezone = body.timezone
    await session.commit()
    await session.refresh(user)
    return user
