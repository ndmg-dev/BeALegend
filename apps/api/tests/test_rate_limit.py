"""O endpoint de cadastro e o alvo obvio de abuso: ele fica limitado."""

from tests.conftest import unique_email


async def test_register_e_limitado_por_ip(client):
    limite = 5
    for _ in range(limite):
        resp = await client.post(
            "/auth/register", json={"email": unique_email(), "password": "senha-de-teste-1"}
        )
        assert resp.status_code == 201, resp.text

    excedido = await client.post(
        "/auth/register", json={"email": unique_email(), "password": "senha-de-teste-1"}
    )
    assert excedido.status_code == 429
    assert excedido.json()["type"].endswith("/rate-limited")
