"""Vínculo de parceiro: convite mútuo, RLS estendida e o resumo compartilhado.

O ponto central: `session`/`meal_log`/`habit`/`habit_checkin` ficam visíveis
para o parceiro só depois do `aceito`, e `finance_transaction` nunca fica —
a policy dela não foi tocada pela migration 0012.
"""

import uuid
from datetime import date

from app.services.push import settings as push_settings
from tests.conftest import auth, register

ENDPOINT_A = "https://push.example/subscription/partner-device-a"
ENDPOINT_B = "https://push.example/subscription/partner-device-b"
KEYS = {"p256dh": "p" * 80, "auth": "a" * 24}


def op(entidade, operacao, id_, payload):
    return {
        "idempotency_key": f"partner-{uuid.uuid4()}",
        "entidade": entidade,
        "operacao": operacao,
        "id": id_,
        "payload": payload,
    }


async def sync(client, token, *operations):
    resp = await client.post(
        "/sync/batch", json={"operations": operations}, headers=auth(token)
    )
    assert resp.status_code == 200, resp.text
    results = resp.json()["results"]
    assert all(r["status"] == "applied" for r in results), results


async def registrar_treino_concluido(client, token, dia: str):
    session_id = str(uuid.uuid4())
    await sync(
        client, token,
        op("session", "create", session_id, {"data": dia, "status": "concluida"}),
    )


async def _assinar_push(client, token, endpoint: str) -> None:
    resp = await client.post(
        "/notifications/subscriptions", json={"endpoint": endpoint, "keys": KEYS},
        headers=auth(token),
    )
    assert resp.status_code == 204, resp.text


async def test_convite_dispara_push_para_o_convidado(client, monkeypatch):
    _, token_a = await register(client)
    email_b, token_b = await register(client)
    await _assinar_push(client, token_b, ENDPOINT_B)

    chamadas = []
    monkeypatch.setattr("app.services.push.webpush", lambda **kw: chamadas.append(kw))
    monkeypatch.setattr(push_settings, "vapid_public_key", "public-test-key")
    monkeypatch.setattr(push_settings, "vapid_private_key", "private-test-key")

    resp = await client.post("/partners/invite", json={"email": email_b}, headers=auth(token_a))
    assert resp.status_code == 201, resp.text

    assert len(chamadas) == 1
    assert "convite" in chamadas[0]["data"].lower()


async def test_aceite_dispara_push_para_quem_convidou(client, monkeypatch):
    _, token_a = await register(client)
    await _assinar_push(client, token_a, ENDPOINT_A)
    email_b, token_b = await register(client)
    link_id = (
        await client.post("/partners/invite", json={"email": email_b}, headers=auth(token_a))
    ).json()["id"]

    chamadas = []
    monkeypatch.setattr("app.services.push.webpush", lambda **kw: chamadas.append(kw))
    monkeypatch.setattr(push_settings, "vapid_public_key", "public-test-key")
    monkeypatch.setattr(push_settings, "vapid_private_key", "private-test-key")

    resp = await client.post(f"/partners/{link_id}/accept", headers=auth(token_b))
    assert resp.status_code == 200, resp.text

    assert len(chamadas) == 1
    assert "aceit" in chamadas[0]["data"].lower()


async def test_push_de_convite_respeita_preferencia_desligada(client, monkeypatch):
    _, token_a = await register(client)
    email_b, token_b = await register(client)
    await _assinar_push(client, token_b, ENDPOINT_B)
    resp = await client.patch(
        "/notifications/preferences", json={"parceiro_enabled": False}, headers=auth(token_b)
    )
    assert resp.status_code == 200, resp.text

    chamadas = []
    monkeypatch.setattr("app.services.push.webpush", lambda **kw: chamadas.append(kw))
    monkeypatch.setattr(push_settings, "vapid_public_key", "public-test-key")
    monkeypatch.setattr(push_settings, "vapid_private_key", "private-test-key")

    await client.post("/partners/invite", json={"email": email_b}, headers=auth(token_a))

    assert chamadas == []


async def test_convite_e_aceite(client):
    email_a, token_a = await register(client)
    email_b, token_b = await register(client)

    resp = await client.post("/partners/invite", json={"email": email_b}, headers=auth(token_a))
    assert resp.status_code == 201, resp.text
    link = resp.json()
    assert link["status"] == "pendente"
    assert link["direcao"] == "enviado"
    assert link["partner_email"] == email_b

    listado_b = await client.get("/partners", headers=auth(token_b))
    assert listado_b.status_code == 200
    (visto_por_b,) = listado_b.json()
    assert visto_por_b["direcao"] == "recebido"
    assert visto_por_b["partner_email"] == email_a

    aceite = await client.post(f"/partners/{link['id']}/accept", headers=auth(token_b))
    assert aceite.status_code == 200, aceite.text
    assert aceite.json()["status"] == "aceito"


async def test_so_o_destinatario_aceita(client):
    _, token_a = await register(client)
    email_b, token_b = await register(client)
    resp = await client.post("/partners/invite", json={"email": email_b}, headers=auth(token_a))
    link_id = resp.json()["id"]

    # Quem convidou não pode aceitar o próprio convite.
    resp_a = await client.post(f"/partners/{link_id}/accept", headers=auth(token_a))
    assert resp_a.status_code == 404


async def test_nao_pode_convidar_duas_vezes(client):
    _, token_a = await register(client)
    email_b, token_b = await register(client)
    primeiro = await client.post("/partners/invite", json={"email": email_b}, headers=auth(token_a))
    assert primeiro.status_code == 201

    segundo = await client.post("/partners/invite", json={"email": email_b}, headers=auth(token_a))
    assert segundo.status_code == 409

    # O outro lado convidar de volta também esbarra no vínculo já pendente.
    email_a = (await client.get("/auth/me", headers=auth(token_a))).json()["email"]
    inverso = await client.post(
        "/partners/invite", json={"email": email_a}, headers=auth(token_b),
    )
    assert inverso.status_code == 409


async def test_convite_para_email_inexistente_404(client):
    _, token_a = await register(client)
    resp = await client.post(
        "/partners/invite", json={"email": "ninguem@exemplo.com"}, headers=auth(token_a)
    )
    assert resp.status_code == 404


async def test_recusar_convite(client):
    _, token_a = await register(client)
    email_b, token_b = await register(client)
    link_id = (
        await client.post("/partners/invite", json={"email": email_b}, headers=auth(token_a))
    ).json()["id"]

    recusa = await client.post(f"/partners/{link_id}/decline", headers=auth(token_b))
    assert recusa.status_code == 200
    assert recusa.json()["status"] == "recusado"

    # Recusado libera um novo convite entre os dois.
    novo = await client.post("/partners/invite", json={"email": email_b}, headers=auth(token_a))
    assert novo.status_code == 201


async def test_revogar_vinculo_aceito(client):
    _, token_a = await register(client)
    email_b, token_b = await register(client)
    link_id = (
        await client.post("/partners/invite", json={"email": email_b}, headers=auth(token_a))
    ).json()["id"]
    await client.post(f"/partners/{link_id}/accept", headers=auth(token_b))

    revoga = await client.delete(f"/partners/{link_id}", headers=auth(token_a))
    assert revoga.status_code == 204

    resumo = await client.get(f"/partners/{link_id}/summary", headers=auth(token_a))
    assert resumo.status_code == 404


async def test_resumo_so_libera_depois_do_aceite(client):
    _, token_a = await register(client)
    email_b, token_b = await register(client)
    await registrar_treino_concluido(client, token_b, str(date.today()))

    link_id = (
        await client.post("/partners/invite", json={"email": email_b}, headers=auth(token_a))
    ).json()["id"]

    ainda_pendente = await client.get(f"/partners/{link_id}/summary", headers=auth(token_a))
    assert ainda_pendente.status_code == 404

    await client.post(f"/partners/{link_id}/accept", headers=auth(token_b))
    depois_do_aceite = await client.get(f"/partners/{link_id}/summary", headers=auth(token_a))
    assert depois_do_aceite.status_code == 200, depois_do_aceite.text
    assert depois_do_aceite.json()["treinos_concluidos"] == 1


async def test_resumo_do_parceiro_nunca_inclui_financas(client):
    _, token_a = await register(client)
    email_b, token_b = await register(client)
    account_id = str(uuid.uuid4())
    await sync(
        client, token_b,
        op("account", "create", account_id, {
            "nome": "Carteira", "tipo": "carteira", "saldo_inicial_centavos": 0,
        }),
    )
    await sync(
        client, token_b,
        op("transaction", "create", str(uuid.uuid4()), {
            "account_id": account_id, "valor_centavos": 99999, "tipo": "despesa",
            "data": str(date.today()),
        }),
    )
    link_id = (
        await client.post("/partners/invite", json={"email": email_b}, headers=auth(token_a))
    ).json()["id"]
    await client.post(f"/partners/{link_id}/accept", headers=auth(token_b))

    resumo = await client.get(f"/partners/{link_id}/summary", headers=auth(token_a))
    assert resumo.status_code == 200, resumo.text
    assert "gasto_centavos" not in resumo.json()


async def test_isolamento_entre_terceiros(client):
    """C não tem vínculo com A nem B — não enxerga o progresso de nenhum."""
    _, token_a = await register(client)
    email_b, token_b = await register(client)
    _, token_c = await register(client)

    link_id = (
        await client.post("/partners/invite", json={"email": email_b}, headers=auth(token_a))
    ).json()["id"]
    await client.post(f"/partners/{link_id}/accept", headers=auth(token_b))

    listagem_c = await client.get("/partners", headers=auth(token_c))
    assert listagem_c.json() == []

    resumo_c = await client.get(f"/partners/{link_id}/summary", headers=auth(token_c))
    assert resumo_c.status_code == 404
