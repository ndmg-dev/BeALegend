"""Os testes que fecham a fase 1.

Escrita offline que chega intacta, retry duplicado que nao duplica, e edicao
concorrente com resolucao deterministica. Se algum destes ficar vermelho, a
camada offline nao pode ser usada.
"""

import uuid
from dataclasses import replace

import pytest

from tests.conftest import auth, register


def op(
    entidade: str,
    operacao: str,
    id_: str,
    payload: dict | None = None,
    chave: str | None = None,
) -> dict:
    return {
        "idempotency_key": chave or f"key-{uuid.uuid4()}",
        "entidade": entidade,
        "operacao": operacao,
        "id": id_,
        "payload": payload or {},
    }


async def drenar(client, token: str, *operations: dict) -> dict:
    resp = await client.post(
        "/sync/batch", json={"operations": list(operations)}, headers=auth(token)
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# 1. escrita offline -> volta online -> dado integro no servidor
# ---------------------------------------------------------------------------


async def test_lote_offline_chega_integro(client):
    _, token = await register(client)
    a, b = str(uuid.uuid4()), str(uuid.uuid4())

    # Tres registros feitos sem rede, drenados de uma vez quando ela voltou.
    corpo = await drenar(
        client,
        token,
        op("exercise", "create", a, {"nome": "Agachamento", "grupo_muscular": ["quadriceps"]}),
        op("exercise", "create", b, {"nome": "Remada", "grupo_muscular": ["costas"]}),
        op("exercise", "update", a, {"equipamento": "barra"}),
    )

    assert [r["status"] for r in corpo["results"]] == ["applied", "applied", "applied"]

    lista = (await client.get("/training/exercises", headers=auth(token))).json()
    por_id = {e["id"]: e for e in lista}
    assert por_id[a]["nome"] == "Agachamento"
    assert por_id[a]["equipamento"] == "barra"
    assert por_id[b]["nome"] == "Remada"


async def test_id_do_cliente_e_preservado(client):
    _, token = await register(client)
    meu_id = str(uuid.uuid4())
    corpo = await drenar(client, token, op("exercise", "create", meu_id, {"nome": "Levantamento"}))
    assert corpo["results"][0]["entity"]["id"] == meu_id


# ---------------------------------------------------------------------------
# 2. retry duplicado -> um unico registro
# ---------------------------------------------------------------------------


async def test_retry_com_a_mesma_chave_nao_duplica(client):
    _, token = await register(client)
    id_ = str(uuid.uuid4())
    operacao = op("exercise", "create", id_, {"nome": "Supino"}, chave="chave-estavel-1")

    primeiro = await drenar(client, token, operacao)
    # O cliente nao recebeu a resposta (timeout) e reenviou o mesmo item.
    segundo = await drenar(client, token, operacao)

    assert primeiro["results"][0]["status"] == "applied"
    assert segundo["results"][0]["status"] == "duplicate"
    assert segundo["results"][0]["entity"]["id"] == id_

    lista = (await client.get("/training/exercises", headers=auth(token))).json()
    assert len([e for e in lista if e["id"] == id_]) == 1


async def test_chave_repetida_dentro_do_mesmo_lote_aplica_uma_vez(client):
    _, token = await register(client)
    id_ = str(uuid.uuid4())
    operacao = op("exercise", "create", id_, {"nome": "Puxada"}, chave="chave-estavel-2")

    corpo = await drenar(client, token, operacao, operacao)
    assert [r["status"] for r in corpo["results"]] == ["applied", "duplicate"]


async def test_chave_de_idempotencia_e_escopada_por_usuario(client):
    """Uma chave adivinhada nao pode devolver a resposta de outra pessoa."""
    _, token_a = await register(client)
    _, token_b = await register(client)

    id_a = str(uuid.uuid4())
    chave = "chave-compartilhada-1"
    await drenar(client, token_a, op("exercise", "create", id_a, {"nome": "Secreto"}, chave=chave))

    id_b = str(uuid.uuid4())
    corpo_b = await drenar(
        client, token_b, op("exercise", "create", id_b, {"nome": "Meu"}, chave=chave)
    )
    assert corpo_b["results"][0]["status"] == "applied"
    assert corpo_b["results"][0]["entity"]["nome"] == "Meu"


# ---------------------------------------------------------------------------
# 3. edicao concorrente em dois dispositivos -> resolucao deterministica
# ---------------------------------------------------------------------------


async def test_dispositivos_que_editam_campos_diferentes_convivem(client):
    _, token = await register(client)
    id_ = str(uuid.uuid4())
    await drenar(client, token, op("exercise", "create", id_, {"nome": "Rosca direta"}))

    # Celular mudou o nome; notebook mudou o equipamento. Cada um so envia o
    # campo que tocou — e por isso os dois sobrevivem.
    await drenar(client, token, op("exercise", "update", id_, {"nome": "Rosca alternada"}))
    await drenar(client, token, op("exercise", "update", id_, {"equipamento": "halter"}))

    linha = (await client.get(f"/training/exercises/{id_}", headers=auth(token))).json()
    assert linha["nome"] == "Rosca alternada"
    assert linha["equipamento"] == "halter"


async def test_no_mesmo_campo_quem_chega_depois_vence(client):
    _, token = await register(client)
    id_ = str(uuid.uuid4())
    await drenar(client, token, op("exercise", "create", id_, {"nome": "Original"}))

    await drenar(client, token, op("exercise", "update", id_, {"nome": "Do celular"}))
    await drenar(client, token, op("exercise", "update", id_, {"nome": "Do notebook"}))

    linha = (await client.get(f"/training/exercises/{id_}", headers=auth(token))).json()
    assert linha["nome"] == "Do notebook"


async def test_row_version_cresce_a_cada_escrita(client):
    _, token = await register(client)
    id_ = str(uuid.uuid4())
    criado = await drenar(client, token, op("exercise", "create", id_, {"nome": "A"}))
    editado = await drenar(client, token, op("exercise", "update", id_, {"nome": "B"}))

    antes = criado["results"][0]["entity"]["row_version"]
    depois = editado["results"][0]["entity"]["row_version"]
    assert depois > antes


# ---------------------------------------------------------------------------
# delta
# ---------------------------------------------------------------------------


async def test_delta_devolve_so_o_que_mudou_depois_do_cursor(client):
    _, token = await register(client)
    a = str(uuid.uuid4())
    await drenar(client, token, op("exercise", "create", a, {"nome": "Primeiro"}))

    inicial = (await client.get("/sync", headers=auth(token))).json()
    cursor = inicial["cursor"]
    assert any(e["id"] == a for e in inicial["changes"]["exercise"])

    b = str(uuid.uuid4())
    await drenar(client, token, op("exercise", "create", b, {"nome": "Segundo"}))

    delta = (await client.get(f"/sync?since={cursor}", headers=auth(token))).json()
    ids = [e["id"] for e in delta["changes"].get("exercise", [])]
    assert ids == [b]


async def test_delta_vazio_nao_regride_o_cursor(client):
    _, token = await register(client)
    await drenar(client, token, op("exercise", "create", str(uuid.uuid4()), {"nome": "X"}))
    cursor = (await client.get("/sync", headers=auth(token))).json()["cursor"]

    vazio = (await client.get(f"/sync?since={cursor}", headers=auth(token))).json()
    assert vazio["cursor"] == cursor
    assert vazio["changes"] == {}


async def test_delete_e_logico_e_aparece_no_delta(client):
    """Um DELETE de verdade sumiria do delta — e a linha ressuscitaria no
    proximo push do outro dispositivo."""
    _, token = await register(client)
    id_ = str(uuid.uuid4())
    await drenar(client, token, op("exercise", "create", id_, {"nome": "Some"}))
    cursor = (await client.get("/sync", headers=auth(token))).json()["cursor"]

    await drenar(client, token, op("exercise", "delete", id_))

    delta = (await client.get(f"/sync?since={cursor}", headers=auth(token))).json()
    apagado = next(e for e in delta["changes"]["exercise"] if e["id"] == id_)
    assert apagado["deleted_at"] is not None

    lista = (await client.get("/training/exercises", headers=auth(token))).json()
    assert all(e["id"] != id_ for e in lista)


async def test_delta_respeita_a_rls(client):
    _, token_a = await register(client)
    _, token_b = await register(client)

    id_a = str(uuid.uuid4())
    await drenar(client, token_a, op("exercise", "create", id_a, {"nome": "So do A"}))

    delta_b = (await client.get("/sync", headers=auth(token_b))).json()
    assert all(e["id"] != id_a for e in delta_b["changes"].get("exercise", []))


# ---------------------------------------------------------------------------
# rejeicoes
# ---------------------------------------------------------------------------


async def test_entidade_desconhecida_e_rejeitada_sem_derrubar_o_lote(client):
    _, token = await register(client)
    bom = str(uuid.uuid4())
    corpo = await drenar(
        client,
        token,
        op("planeta", "create", str(uuid.uuid4()), {"nome": "Marte"}),
        op("exercise", "create", bom, {"nome": "Valido"}),
    )
    assert corpo["results"][0]["status"] == "rejected"
    assert corpo["results"][1]["status"] == "applied"

    lista = (await client.get("/training/exercises", headers=auth(token))).json()
    assert any(e["id"] == bom for e in lista)


async def test_update_de_linha_inexistente_e_rejeitado(client):
    _, token = await register(client)
    corpo = await drenar(
        client, token, op("exercise", "update", str(uuid.uuid4()), {"nome": "Fantasma"})
    )
    assert corpo["results"][0]["status"] == "rejected"
    assert corpo["results"][0]["problem"]["title"] == "Registro inexistente"


async def test_payload_com_campo_desconhecido_e_rejeitado(client):
    _, token = await register(client)
    id_ = str(uuid.uuid4())
    await drenar(client, token, op("exercise", "create", id_, {"nome": "Base"}))
    corpo = await drenar(client, token, op("exercise", "update", id_, {"calorias": 300}))
    assert corpo["results"][0]["status"] == "rejected"


async def test_sync_exige_autenticacao(client):
    assert (await client.get("/sync")).status_code == 401
    assert (await client.post("/sync/batch", json={"operations": []})).status_code == 401


@pytest.mark.parametrize("operacao", ["update", "delete"])
def test_entidade_append_only_recusa_edicao(operacao):
    """A regra que protege o log de treino, testada isolada da rota.

    set_log se registra com append_only=True na fase 2: uma serie registrada
    nao e editada nem apagada.
    """
    from app.sync.registry import REGISTRY, OperacaoInvalida, validar_operacao

    original = REGISTRY["exercise"]
    REGISTRY["exercise"] = replace(original, append_only=True)
    try:
        with pytest.raises(OperacaoInvalida, match="append-only"):
            validar_operacao("exercise", operacao)
        assert validar_operacao("exercise", "create") is not None
    finally:
        REGISTRY["exercise"] = original
