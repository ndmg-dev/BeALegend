"""Insights de nutrição (fase 1 — provider fake, sem OpenAI).

Cobre o gating (kill switch, opt-in, dados mínimos), a idempotência do upsert
e o isolamento por RLS.
"""

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import get_settings
from app.models import NutritionInsight
from tests.conftest import auth, register


def op(entity, operation, id_, payload):
    return {
        "idempotency_key": f"insight-{uuid.uuid4()}",
        "entidade": entity,
        "operacao": operation,
        "id": id_,
        "payload": payload,
    }


async def push(client, token, *operations):
    response = await client.post(
        "/sync/batch", json={"operations": operations}, headers=auth(token)
    )
    assert response.status_code == 200, response.text
    results = response.json()["results"]
    assert all(r["status"] == "applied" for r in results), results


async def registrar_refeicao(client, token, dia: str):
    await push(
        client,
        token,
        op("meal_plan", "create", str(uuid.uuid4()), {"nome": "Plano", "ativo": True}),
    )
    await push(
        client,
        token,
        op("meal_log", "create", str(uuid.uuid4()), {
            "data": dia, "horario": "12:30",
            "descricao": "Arroz, feijão e frango", "aderencia": "dentro",
            "tags": ["caseiro"],
        }),
    )


async def opt_in(client, token):
    resp = await client.patch(
        "/notifications/preferences",
        json={"insights_ia_enabled": True},
        headers=auth(token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["insights_ia_enabled"] is True


@pytest.fixture
def insights_on(monkeypatch):
    monkeypatch.setattr(get_settings(), "nutrition_insights_enabled", True)


async def test_today_204_quando_feature_desligada(client):
    _, token = await register(client)
    await opt_in(client, token)
    await registrar_refeicao(client, token, str(date.today()))

    resp = await client.get("/nutrition/insight/today", headers=auth(token))
    assert resp.status_code == 204


async def test_today_204_sem_opt_in(client, insights_on):
    _, token = await register(client)
    await registrar_refeicao(client, token, str(date.today()))

    resp = await client.get("/nutrition/insight/today", headers=auth(token))
    assert resp.status_code == 204


async def test_today_204_sem_refeicoes(client, insights_on):
    _, token = await register(client)
    await opt_in(client, token)

    resp = await client.get("/nutrition/insight/today", headers=auth(token))
    assert resp.status_code == 204


async def test_today_gera_e_e_idempotente(client, insights_on, owner_engine):
    email, token = await register(client)
    await opt_in(client, token)
    await registrar_refeicao(client, token, str(date.today()))

    first = await client.get("/nutrition/insight/today", headers=auth(token))
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["tipo"] == "diario"
    assert body["texto"]
    assert body["periodo_ref"] == str(date.today())

    second = await client.get("/nutrition/insight/today", headers=auth(token))
    assert second.status_code == 200
    assert second.json()["texto"] == body["texto"]

    Session = async_sessionmaker(owner_engine)
    async with Session() as s:
        count = await s.scalar(
            select(func.count(NutritionInsight.id)).where(NutritionInsight.tipo == "diario")
        )
    assert count == 1


async def test_weekly_gera(client, insights_on):
    _, token = await register(client)
    await opt_in(client, token)
    await registrar_refeicao(client, token, str(date.today()))

    resp = await client.get("/nutrition/insight/weekly", headers=auth(token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["tipo"] == "semanal"


async def test_insight_isolado_por_rls(client, insights_on, owner_engine):
    _, token_a = await register(client)
    _, token_b = await register(client)
    await opt_in(client, token_a)
    await opt_in(client, token_b)
    await registrar_refeicao(client, token_a, str(date.today()))
    await registrar_refeicao(client, token_b, str(date.today()))

    assert (await client.get("/nutrition/insight/today", headers=auth(token_a))).status_code == 200
    assert (await client.get("/nutrition/insight/today", headers=auth(token_b))).status_code == 200

    # Dois registros, um por dono — a policy de SELECT (mesma macro das outras
    # tabelas) garante que nenhum enxerga o do outro.
    Session = async_sessionmaker(owner_engine)
    async with Session() as s:
        donos = set(await s.scalars(select(NutritionInsight.user_id)))
    assert len(donos) == 2
