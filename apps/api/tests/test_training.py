"""Endpoints de leitura do plano e escrita de sessao/set_log via /sync/batch."""

import uuid
from datetime import date

from sqlalchemy import text

from tests.conftest import auth, register


def op(entidade, operacao, id_, payload=None, chave=None):
    return {
        "idempotency_key": chave or f"key-{uuid.uuid4()}",
        "entidade": entidade,
        "operacao": operacao,
        "id": id_,
        "payload": payload or {},
    }


async def drenar(client, token, *operations):
    resp = await client.post(
        "/sync/batch", json={"operations": list(operations)}, headers=auth(token)
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _criar_exercicio_global(owner_engine, nome="Supino reto") -> str:
    ex_id = uuid.uuid4()
    async with owner_engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO exercise (id, user_id, is_global, nome, grupo_muscular) "
                "VALUES (:id, NULL, true, :nome, ARRAY['peito']::varchar[])"
            ),
            {"id": ex_id, "nome": nome},
        )
    return str(ex_id)


async def _criar_plano_minimo(owner_engine, user_id: str, exercise_id: str) -> dict:
    """Cria training_plan/plan_day/plan_item direto como owner — o que o
    seed faz — para testar os endpoints de leitura sem depender do parser."""
    plan_id = str(uuid.uuid4())
    day_id = str(uuid.uuid4())
    item_id = str(uuid.uuid4())

    async with owner_engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO training_plan (id, user_id, nome, ativo) "
                "VALUES (:id, :uid, 'Plano de teste', true)"
            ),
            {"id": plan_id, "uid": user_id},
        )
        await conn.execute(
            text(
                "INSERT INTO plan_day (id, user_id, plan_id, dia_semana, tipo, foco) "
                "VALUES (:id, :uid, :plan_id, 'segunda', 'forca', 'Peito')"
            ),
            {"id": day_id, "uid": user_id, "plan_id": plan_id},
        )
        await conn.execute(
            text(
                "INSERT INTO plan_item "
                "(id, user_id, plan_day_id, exercise_id, ordem, series_min, series_max, "
                " reps_min, reps_max, unidade, rir_min, rir_max, descanso_seg) "
                "VALUES (:id, :uid, :day_id, :ex_id, 1, 4, 4, 8, 12, 'reps', 2, 2, 90)"
            ),
            {"id": item_id, "uid": user_id, "day_id": day_id, "ex_id": exercise_id},
        )
    return {"plan_id": plan_id, "day_id": day_id, "item_id": item_id}


# ---------------------------------------------------------------------------
# leitura do plano
# ---------------------------------------------------------------------------


async def test_plano_ativo_traz_dias_e_itens(client, owner_engine):
    _, token = await register(client)
    email = (await client.get("/auth/me", headers=auth(token))).json()["email"]
    user_id = (
        await owner_engine_scalar(owner_engine, "SELECT id FROM app_user WHERE email = :e", e=email)
    )

    exercise_id = await _criar_exercicio_global(owner_engine)
    await _criar_plano_minimo(owner_engine, user_id, exercise_id)

    resp = await client.get("/training/plans/active", headers=auth(token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["nome"] == "Plano de teste"
    assert len(body["dias"]) == 1
    assert body["dias"][0]["dia_semana"] == "segunda"
    assert body["dias"][0]["itens"][0]["exercise_id"] == exercise_id
    assert body["dias"][0]["itens"][0]["reps_min"] == 8


async def test_sem_plano_ativo_devolve_404(client):
    _, token = await register(client)
    resp = await client.get("/training/plans/active", headers=auth(token))
    assert resp.status_code == 404


async def test_plano_de_outro_usuario_e_invisivel(client, owner_engine):
    _, token_a = await register(client)
    _, token_b = await register(client)

    email_a = (await client.get("/auth/me", headers=auth(token_a))).json()["email"]
    user_a = await owner_engine_scalar(
        owner_engine, "SELECT id FROM app_user WHERE email = :e", e=email_a
    )
    exercise_id = await _criar_exercicio_global(owner_engine, "Exclusivo de A")
    await _criar_plano_minimo(owner_engine, user_a, exercise_id)

    resp = await client.get("/training/plans/active", headers=auth(token_b))
    assert resp.status_code == 404


async def owner_engine_scalar(owner_engine, sql, **params):
    async with owner_engine.begin() as conn:
        result = await conn.execute(text(sql), params)
        return result.scalar_one()


# ---------------------------------------------------------------------------
# dia de hoje
# ---------------------------------------------------------------------------


async def test_dia_de_hoje_sem_plano_devolve_null(client):
    _, token = await register(client)
    resp = await client.get("/training/days/today", headers=auth(token))
    assert resp.status_code == 200
    assert resp.json() is None


# ---------------------------------------------------------------------------
# sessao e set_log via /sync/batch
# ---------------------------------------------------------------------------


async def test_fluxo_completo_de_sessao_e_series(client, owner_engine):
    _, token = await register(client)
    exercise_id = await _criar_exercicio_global(owner_engine, "Agachamento")

    session_id = str(uuid.uuid4())
    corpo = await drenar(
        client,
        token,
        op("session", "create", session_id, {"data": str(date.today()), "status": "em_curso"}),
    )
    assert corpo["results"][0]["status"] == "applied"

    set_id = str(uuid.uuid4())
    corpo = await drenar(
        client,
        token,
        op(
            "set_log",
            "create",
            set_id,
            {
                "session_id": session_id,
                "exercise_id": exercise_id,
                "numero_serie": 1,
                "reps": 10,
                "carga_kg": 80.5,
                "rir": 2,
                "concluido_em": "2026-01-01T10:00:00Z",
            },
        ),
    )
    assert corpo["results"][0]["status"] == "applied"

    historico = await client.get(
        f"/training/exercises/{exercise_id}/history", headers=auth(token)
    )
    assert historico.status_code == 200
    assert len(historico.json()) == 1
    assert historico.json()[0]["carga_kg"] == 80.5

    finalizar = await drenar(
        client, token, op("session", "update", session_id, {"status": "concluida"})
    )
    assert finalizar["results"][0]["entity"]["status"] == "concluida"


async def test_set_log_para_sessao_de_outro_usuario_e_rejeitado(client, owner_engine):
    """A RLS bloqueia a leitura da sessao alheia, entao a checagem de
    referencia do engine ve 'nao existe' — nao um vazamento de dado."""
    _, token_a = await register(client)
    _, token_b = await register(client)
    exercise_id = await _criar_exercicio_global(owner_engine)

    session_id = str(uuid.uuid4())
    await drenar(client, token_a, op("session", "create", session_id, {"data": str(date.today())}))

    corpo = await drenar(
        client,
        token_b,
        op(
            "set_log",
            "create",
            str(uuid.uuid4()),
            {
                "session_id": session_id,
                "exercise_id": exercise_id,
                "numero_serie": 1,
                "reps": 10,
                "carga_kg": 50,
                "concluido_em": "2026-01-01T10:00:00Z",
            },
        ),
    )
    assert corpo["results"][0]["status"] == "rejected"
    assert corpo["results"][0]["problem"]["title"] == "Referencia invalida"


async def test_set_log_nao_aceita_update_nem_delete(client, owner_engine):
    _, token = await register(client)
    exercise_id = await _criar_exercicio_global(owner_engine)
    session_id = str(uuid.uuid4())
    await drenar(client, token, op("session", "create", session_id, {"data": str(date.today())}))

    set_id = str(uuid.uuid4())
    await drenar(
        client,
        token,
        op(
            "set_log",
            "create",
            set_id,
            {
                "session_id": session_id,
                "exercise_id": exercise_id,
                "numero_serie": 1,
                "reps": 10,
                "carga_kg": 50,
                "concluido_em": "2026-01-01T10:00:00Z",
            },
        ),
    )

    corpo = await drenar(client, token, op("set_log", "update", set_id, {"reps": 12}))
    assert corpo["results"][0]["status"] == "rejected"
    assert "append-only" in corpo["results"][0]["problem"]["detail"]


async def test_plan_day_e_somente_leitura(client, owner_engine):
    _, token = await register(client)
    email = (await client.get("/auth/me", headers=auth(token))).json()["email"]
    user_id = await owner_engine_scalar(
        owner_engine, "SELECT id FROM app_user WHERE email = :e", e=email
    )
    exercise_id = await _criar_exercicio_global(owner_engine)
    contexto = await _criar_plano_minimo(owner_engine, user_id, exercise_id)

    corpo = await drenar(
        client, token, op("plan_day", "update", contexto["day_id"], {"foco": "Hackeado"})
    )
    assert corpo["results"][0]["status"] == "rejected"
    assert "somente leitura" in corpo["results"][0]["problem"]["detail"]
