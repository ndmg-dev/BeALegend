"""Rotina, metas calculadas e resumo acionavel do dia."""

import uuid
from datetime import date

from tests.conftest import auth, register


def op(entity, operation, id_, payload):
    return {
        "idempotency_key": f"routine-{uuid.uuid4()}",
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


async def test_habitos_metas_e_dashboard_sao_calculados(client):
    _, token = await register(client)
    today = str(date.today())
    habit_id = str(uuid.uuid4())
    results = await push(
        client,
        token,
        op("habit", "create", habit_id, {
            "nome": "Ler 20 min", "icone": "livro", "frequencia_rrule": "FREQ=DAILY",
            "meta_por_semana": 7, "ativo": True,
        }),
        op("habit_checkin", "create", str(uuid.uuid4()), {
            "habit_id": habit_id, "data": today, "concluido": True,
        }),
        op("goal", "create", str(uuid.uuid4()), {
            "titulo": "Um habito hoje", "dominio": "rotina", "tipo": "numerica",
            "alvo": 1, "unidade": "habito", "metrica_ref": "routine.habits.today",
            "status": "ativa",
        }),
        op("water_log", "create", str(uuid.uuid4()), {
            "data": today, "ml": 500, "registrado_em": "2026-08-28T12:00:00Z",
        }),
    )
    assert all(result["status"] == "applied" for result in results)

    habits = await client.get("/routine/habits/today", headers=auth(token))
    assert habits.status_code == 200, habits.text
    assert habits.json()[0]["concluido"] is True

    goals = await client.get("/goals", headers=auth(token))
    assert goals.status_code == 200, goals.text
    assert goals.json()[0]["atual"] == 1

    dashboard = await client.get("/dashboard/today", headers=auth(token))
    assert dashboard.status_code == 200, dashboard.text
    assert dashboard.json()["agua_ml"] == 500
    assert dashboard.json()["habitos_concluidos"] == 1
    assert dashboard.json()["habitos_total"] == 1


async def test_checkin_nao_aceita_habito_de_outro_usuario(client):
    _, token_a = await register(client)
    _, token_b = await register(client)
    habit_id = str(uuid.uuid4())
    created = await push(client, token_a, op("habit", "create", habit_id, {
        "nome": "Privado", "frequencia_rrule": "FREQ=DAILY", "meta_por_semana": 7,
    }))
    assert created[0]["status"] == "applied"

    result = await push(client, token_b, op("habit_checkin", "create", str(uuid.uuid4()), {
        "habit_id": habit_id, "data": str(date.today()), "concluido": True,
    }))
    assert result[0]["status"] == "rejected"
    assert result[0]["problem"]["title"] == "Referencia invalida"


async def test_habito_e_meta_invalidos_sao_rejeitados(client):
    _, token = await register(client)
    results = await push(
        client,
        token,
        op("habit", "create", str(uuid.uuid4()), {
            "nome": "Excesso", "frequencia_rrule": "FREQ=DAILY", "meta_por_semana": 8,
        }),
        op("goal", "create", str(uuid.uuid4()), {
            "titulo": "Manual", "dominio": "desconhecido", "tipo": "numerica",
            "alvo": 0, "metrica_ref": "manual",
        }),
    )
    assert all(result["status"] == "rejected" for result in results)
