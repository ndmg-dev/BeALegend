async def test_healthz(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


async def test_readyz_toca_o_banco(client):
    resp = await client.get("/readyz")
    assert resp.status_code == 200
    assert resp.json()["db"] == "ok"
