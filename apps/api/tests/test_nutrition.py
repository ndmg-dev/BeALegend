"""Nutricao: plano diario, aderencia, agua e referencias isoladas por RLS."""

import uuid
from datetime import date

from tests.conftest import auth, register


def op(entity, operation, id_, payload):
    return {
        "idempotency_key": f"nutrition-{uuid.uuid4()}",
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
    return response.json()["results"]


async def create_plan(client, token):
    plan_id = str(uuid.uuid4())
    slot_id = str(uuid.uuid4())
    results = await push(
        client,
        token,
        op("meal_plan", "create", plan_id, {"nome": "Plano diário", "ativo": True}),
        op("meal_slot", "create", slot_id, {
            "meal_plan_id": plan_id, "nome": "Almoço", "horario_alvo": "12:30",
            "descricao": "Arroz, feijão e proteína", "ordem": 2,
        }),
    )
    assert all(result["status"] == "applied" for result in results)
    return plan_id, slot_id


async def test_refeicao_agua_e_visao_do_dia(client):
    _, token = await register(client)
    _, slot_id = await create_plan(client, token)
    today = str(date.today())
    results = await push(
        client,
        token,
        op("meal_log", "create", str(uuid.uuid4()), {
            "data": today, "slot_id": slot_id, "horario": "12:35",
            "descricao": "Arroz, feijão e frango", "aderencia": "dentro",
            "tags": ["caseiro", "proteína"],
        }),
        op("water_log", "create", str(uuid.uuid4()), {
            "data": today, "ml": 250, "registrado_em": "2026-08-28T12:00:00Z",
        }),
        op("water_log", "create", str(uuid.uuid4()), {
            "data": today, "ml": 500, "registrado_em": "2026-08-28T13:00:00Z",
        }),
    )
    assert all(result["status"] == "applied" for result in results)

    response = await client.get(f"/nutrition/day/{today}", headers=auth(token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["agua_ml"] == 750
    assert body["slots"][0]["nome"] == "Almoço"
    assert body["refeicoes"][0]["aderencia"] == "dentro"
    assert body["refeicoes"][0]["tags"] == ["caseiro", "proteína"]


async def test_refeicao_nao_aceita_slot_de_outro_usuario(client):
    _, token_a = await register(client)
    _, token_b = await register(client)
    _, slot_a = await create_plan(client, token_a)
    results = await push(client, token_b, op("meal_log", "create", str(uuid.uuid4()), {
        "data": str(date.today()), "slot_id": slot_a, "horario": "12:30",
        "descricao": "Tentativa", "aderencia": "fora",
    }))
    assert results[0]["status"] == "rejected"
    assert results[0]["problem"]["title"] == "Referencia invalida"


async def test_aderencia_e_agua_invalidas_sao_rejeitadas(client):
    _, token = await register(client)
    results = await push(
        client,
        token,
        op("meal_log", "create", str(uuid.uuid4()), {
            "data": str(date.today()), "horario": "09:00",
            "descricao": "Café", "aderencia": "mais_ou_menos",
        }),
        op("water_log", "create", str(uuid.uuid4()), {
            "data": str(date.today()), "ml": 0, "registrado_em": "2026-08-28T12:00:00Z",
        }),
    )
    assert all(result["status"] == "rejected" for result in results)
