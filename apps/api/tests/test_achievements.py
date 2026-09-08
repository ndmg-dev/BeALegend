"""Entidade achievement_unlock — sync append-only, idempotência e RLS."""

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import AchievementUnlock
from app.services.push import settings as push_settings
from tests.conftest import auth, register

DESBLOQUEADO_EM = "2026-08-31T12:00:00Z"
ENDPOINT = "https://push.example/subscription/achievement-device"
KEYS = {"p256dh": "p" * 80, "auth": "a" * 24}


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


async def _assinar_push(client, token) -> None:
    resp = await client.post(
        "/notifications/subscriptions", json={"endpoint": ENDPOINT, "keys": KEYS},
        headers=auth(token),
    )
    assert resp.status_code == 204, resp.text


async def test_desbloqueio_dispara_push(client, monkeypatch):
    _, token = await register(client)
    await _assinar_push(client, token)

    chamadas = []
    monkeypatch.setattr("app.services.push.webpush", lambda **kw: chamadas.append(kw))
    monkeypatch.setattr(push_settings, "vapid_public_key", "public-test-key")
    monkeypatch.setattr(push_settings, "vapid_private_key", "private-test-key")

    await sync(client, token, op("create", str(uuid.uuid4()), unlock_payload("treino.primeiro")))

    assert len(chamadas) == 1
    assert "Conquista desbloqueada" in chamadas[0]["data"]


async def test_desbloqueio_repetido_nao_duplica_push(client, monkeypatch):
    """Reenvio do mesmo desbloqueio (outbox reconstruída, retry) não pode
    disparar um segundo push — `scheduled_for=desbloqueado_em` é estável."""
    _, token = await register(client)
    await _assinar_push(client, token)

    chamadas = []
    monkeypatch.setattr("app.services.push.webpush", lambda **kw: chamadas.append(kw))
    monkeypatch.setattr(push_settings, "vapid_public_key", "public-test-key")
    monkeypatch.setattr(push_settings, "vapid_private_key", "private-test-key")

    unlock_id = str(uuid.uuid4())
    payload = unlock_payload("comer.primeira")
    await sync(client, token, op("create", unlock_id, payload, key="unlock:comer.primeira"))
    await sync(client, token, op("create", unlock_id, payload, key="unlock:comer.primeira"))

    assert len(chamadas) == 1


async def test_desbloqueio_respeita_preferencia_desligada(client, monkeypatch):
    _, token = await register(client)
    await _assinar_push(client, token)
    resp = await client.patch(
        "/notifications/preferences", json={"conquista_enabled": False}, headers=auth(token)
    )
    assert resp.status_code == 200, resp.text

    chamadas = []
    monkeypatch.setattr("app.services.push.webpush", lambda **kw: chamadas.append(kw))
    monkeypatch.setattr(push_settings, "vapid_public_key", "public-test-key")
    monkeypatch.setattr(push_settings, "vapid_private_key", "private-test-key")

    await sync(client, token, op("create", str(uuid.uuid4()), unlock_payload("treino.primeiro")))

    assert chamadas == []


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
