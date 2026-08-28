"""O endpoint de cadastro e o alvo obvio de abuso: ele fica limitado."""

from tests.conftest import unique_email


async def test_register_e_limitado_por_ip(client):
    from app.config import get_settings

    limite = int(get_settings().rate_limit_register.split("/")[0])
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
