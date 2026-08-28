"""O isolamento tem que vir do Postgres, nao do WHERE da aplicacao.

Os endpoints de exercicio nao filtram por user_id de proposito. Se a policy
sumir, estes testes ficam vermelhos.
"""

import uuid

from sqlalchemy import text

from tests.conftest import auth, register


async def test_usuario_nao_ve_exercicio_de_outro(client):
    _, token_a = await register(client)
    _, token_b = await register(client)

    criado = await client.post(
        "/training/exercises",
        json={"nome": "Supino inclinado com halteres", "grupo_muscular": ["peito"]},
        headers=auth(token_a),
    )
    assert criado.status_code == 201
    exercise_id = criado.json()["id"]

    lista_b = await client.get("/training/exercises", headers=auth(token_b))
    assert lista_b.status_code == 200
    assert all(e["id"] != exercise_id for e in lista_b.json())

    # e nem por id direto
    assert (
        await client.get(f"/training/exercises/{exercise_id}", headers=auth(token_b))
    ).status_code == 404

    # o dono ve
    assert (
        await client.get(f"/training/exercises/{exercise_id}", headers=auth(token_a))
    ).status_code == 200


async def test_catalogo_global_e_visivel_para_todos(client, owner_engine):
    _, token = await register(client)

    global_id = uuid.uuid4()
    async with owner_engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO exercise (id, user_id, is_global, nome, grupo_muscular) "
                "VALUES (:id, NULL, true, :nome, ARRAY['costas']::varchar[])"
            ),
            {"id": global_id, "nome": "Remada curvada"},
        )

    lista = await client.get("/training/exercises", headers=auth(token))
    assert any(e["id"] == str(global_id) and e["is_global"] for e in lista.json())


async def test_cliente_pode_escolher_o_proprio_uuid(client):
    _, token = await register(client)
    meu_id = str(uuid.uuid4())
    resp = await client.post(
        "/training/exercises",
        json={"id": meu_id, "nome": "Agachamento livre"},
        headers=auth(token),
    )
    assert resp.status_code == 201
    assert resp.json()["id"] == meu_id


async def test_anonimo_nao_le_nada(client):
    assert (await client.get("/training/exercises")).status_code == 401


async def test_sem_app_user_id_a_policy_nega_tudo():
    """Conexao da role de runtime sem contexto RLS enxerga zero linhas privadas."""
    from app.db import SessionLocal, set_session_user

    async with SessionLocal() as session:
        await set_session_user(session, None)
        result = await session.execute(text("SELECT count(*) FROM exercise WHERE NOT is_global"))
        rows = result.scalar_one()
        assert rows == 0


async def test_contexto_de_rls_sobrevive_ao_commit(client):
    """set_config e transaction-local: sem o listener de after_begin, a leitura
    logo apos o commit rodaria sem usuario e a policy negaria a propria linha."""
    _, token = await register(client)
    resp = await client.post(
        "/training/exercises",
        json={"nome": "Levantamento terra", "grupo_muscular": ["posterior"]},
        headers=auth(token),
    )
    # o corpo so existe porque o refresh pos-commit enxergou a linha recem-criada
    assert resp.status_code == 201
    assert resp.json()["nome"] == "Levantamento terra"
