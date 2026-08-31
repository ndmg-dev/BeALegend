"""Entidade achievement_unlock — sync append-only, idempotência e RLS."""

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import AchievementUnlock
from tests.conftest import auth, register

DESBLOQUEADO_EM = "2026-08-31T12:00:00Z"


def unlock_payload(key: str) -> dict:
    return {"achievement_key": key, "desbloqueado_em": DESBLOQUEADO_EM}


def op(operation, id_, payload, *, key=None):
    return {
        "idempotency_key": key or f"achv-{uuid.uuid4()}",
        "entidade": "achievement_unlock",
        "operacao": operation,
        "id": id_,
        "payload": payload,
    }


async def sync(client, token, *operations):
    resp = await client.post(
        "/sync/batch", json={"operations": operations}, headers=auth(token)
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["results"]


async def test_desbloqueio_via_sync(client, owner_engine):
    _, token = await register(client)
    unlock_id = str(uuid.uuid4())

    results = await sync(
        client, token, op("create", unlock_id, unlock_payload("treino.primeiro"))
    )
    assert results[0]["status"] == "applied"
    assert results[0]["entity"]["achievement_key"] == "treino.primeiro"

    Session = async_sessionmaker(owner_engine)
    async with Session() as s:
        row = await s.scalar(
            select(AchievementUnlock).where(AchievementUnlock.id == uuid.UUID(unlock_id))
        )
    assert row is not None and row.achievement_key == "treino.primeiro"


@pytest.mark.parametrize("operacao", ["update", "delete"])
async def test_append_only_recusa_edicao(client, operacao):
    _, token = await register(client)
    unlock_id = str(uuid.uuid4())
    await sync(client, token, op("create", unlock_id, unlock_payload("comer.primeira")))

    results = await sync(client, token, op(operacao, unlock_id, {"achievement_key": "hack"}))
    assert results[0]["status"] == "rejected"
    assert "append-only" in results[0]["problem"]["detail"]


async def test_idempotencia_por_chave_estavel(client, owner_engine):
    _, token = await register(client)
    unlock_id = str(uuid.uuid4())
    payload = unlock_payload("geral.semana")

    r1 = await sync(client, token, op("create", unlock_id, payload, key="unlock:geral.semana"))
    r2 = await sync(client, token, op("create", unlock_id, payload, key="unlock:geral.semana"))
    assert r1[0]["status"] == "applied"
    assert r2[0]["status"] == "duplicate"

    Session = async_sessionmaker(owner_engine)
    async with Session() as s:
        total = await s.scalar(select(func.count(AchievementUnlock.id)))
    assert total == 1


async def test_isolado_por_rls(client, owner_engine):
    _, token_a = await register(client)
    _, token_b = await register(client)
    payload = unlock_payload("treino.primeiro")

    await sync(client, token_a, op("create", str(uuid.uuid4()), payload))
    await sync(client, token_b, op("create", str(uuid.uuid4()), payload))

    # Mesma achievement_key para dois donos: a policy de SELECT (macro padrão)
    # garante que nenhum enxerga o do outro; o unique é por (user_id, key).
    Session = async_sessionmaker(owner_engine)
    async with Session() as s:
        donos = set(await s.scalars(select(AchievementUnlock.user_id)))
    assert len(donos) == 2
