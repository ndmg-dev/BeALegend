"""Financas: sync offline, agregacoes em centavos e isolamento RLS."""

import uuid
from datetime import date

from tests.conftest import auth, register


def op(entity, operation, id_, payload):
    return {
        "idempotency_key": f"finance-{uuid.uuid4()}",
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


async def setup_finance(client, token):
    account_id = str(uuid.uuid4())
    category_id = str(uuid.uuid4())
    results = await push(
        client,
        token,
        op("account", "create", account_id,
           {"nome": "Carteira", "tipo": "carteira", "saldo_inicial_centavos": 0}),
        op("category", "create", category_id,
           {"nome": "Mercado", "tipo": "despesa"}),
    )
    assert all(result["status"] == "applied" for result in results)
    return account_id, category_id


async def test_fluxo_financeiro_e_resumo(client):
    _, token = await register(client)
    account_id, category_id = await setup_finance(client, token)
    transaction_id = str(uuid.uuid4())
    budget_id = str(uuid.uuid4())
    today = str(date.today())
    month = today[:7]

    results = await push(
        client,
        token,
        op("transaction", "create", transaction_id, {
            "account_id": account_id, "category_id": category_id,
            "valor_centavos": 8740, "tipo": "despesa", "data": today,
        }),
        op("budget", "create", budget_id, {
            "category_id": category_id, "mes_ano": month, "limite_centavos": 90000,
        }),
    )
    assert all(result["status"] == "applied" for result in results)

    summary = await client.get(
        "/finance/summary", params={"from": today, "to": today}, headers=auth(token)
    )
    assert summary.status_code == 200
    assert summary.json()["despesas_centavos"] == 8740
    assert summary.json()["saldo_centavos"] == -8740

    budgets = await client.get(f"/finance/budgets/{month}", headers=auth(token))
    assert budgets.status_code == 200, budgets.text
    assert budgets.json()[0]["gasto_centavos"] == 8740


async def test_transacao_nao_aceita_conta_de_outro_usuario(client):
    _, token_a = await register(client)
    _, token_b = await register(client)
    account_a, category_a = await setup_finance(client, token_a)
    results = await push(client, token_b, op("transaction", "create", str(uuid.uuid4()), {
        "account_id": account_a, "category_id": category_a,
        "valor_centavos": 100, "tipo": "despesa", "data": str(date.today()),
    }))
    assert results[0]["status"] == "rejected"
    assert results[0]["problem"]["title"] == "Referencia invalida"


async def test_patch_nao_troca_para_conta_de_outro_usuario(client):
    _, token_a = await register(client)
    _, token_b = await register(client)
    account_a, category_a = await setup_finance(client, token_a)
    account_b, _ = await setup_finance(client, token_b)
    transaction_id = str(uuid.uuid4())
    await push(client, token_a, op("transaction", "create", transaction_id, {
        "account_id": account_a, "category_id": category_a,
        "valor_centavos": 100, "tipo": "despesa", "data": str(date.today()),
    }))
    results = await push(
        client, token_a, op("transaction", "update", transaction_id, {"account_id": account_b})
    )
    assert results[0]["status"] == "rejected"
    assert results[0]["problem"]["title"] == "Referencia invalida"


async def test_valor_zero_e_rejeitado(client):
    _, token = await register(client)
    account_id, category_id = await setup_finance(client, token)
    results = await push(client, token, op("transaction", "create", str(uuid.uuid4()), {
        "account_id": account_id, "category_id": category_id,
        "valor_centavos": 0, "tipo": "despesa", "data": str(date.today()),
    }))
    assert results[0]["status"] == "rejected"
