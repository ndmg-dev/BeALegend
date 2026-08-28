from tests.conftest import auth, register, unique_email


async def test_register_devolve_access_token_e_cookie_httponly(client):
    email = unique_email()
    resp = await client.post(
        "/auth/register", json={"email": email, "password": "senha-de-teste-1"}
    )
    assert resp.status_code == 201
    assert resp.json()["token_type"] == "bearer"

    cookie = resp.headers.get("set-cookie", "")
    assert "bl_refresh=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie.replace("samesite", "SameSite")


async def test_senha_curta_e_rejeitada_com_problem_json(client):
    resp = await client.post("/auth/register", json={"email": unique_email(), "password": "curta"})
    assert resp.status_code == 422
    assert resp.headers["content-type"].startswith("application/problem+json")
    assert resp.json()["title"] == "Requisicao invalida"


async def test_email_duplicado_devolve_409(client):
    email, _ = await register(client)
    resp = await client.post(
        "/auth/register", json={"email": email, "password": "senha-de-teste-1"}
    )
    assert resp.status_code == 409


async def test_login_com_senha_errada_falha(client):
    email, _ = await register(client)
    resp = await client.post("/auth/login", json={"email": email, "password": "senha-errada-x"})
    assert resp.status_code == 401


async def test_me_exige_token(client):
    assert (await client.get("/auth/me")).status_code == 401


async def test_me_devolve_o_usuario_e_seu_fuso(client):
    email, token = await register(client)
    resp = await client.get("/auth/me", headers=auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == email
    assert body["timezone"] == "America/Sao_Paulo"


async def test_refresh_rotaciona_o_token(client):
    await register(client)
    first = client.cookies.get("bl_refresh")
    resp = await client.post("/auth/refresh")
    assert resp.status_code == 200
    assert client.cookies.get("bl_refresh") != first


async def test_reuso_de_refresh_token_derruba_a_familia(client):
    await register(client)
    stolen = client.cookies.get("bl_refresh")

    assert (await client.post("/auth/refresh")).status_code == 200

    rotacionado = client.cookies.get("bl_refresh")

    # o token antigo, apresentado de novo, e um vazamento
    client.cookies.set("bl_refresh", stolen)
    assert (await client.post("/auth/refresh")).status_code == 401

    # e o token rotacionado morre junto com a familia inteira
    client.cookies.set("bl_refresh", rotacionado)
    assert (await client.post("/auth/refresh")).status_code == 401


async def test_logout_invalida_o_refresh(client):
    await register(client)
    assert (await client.post("/auth/logout")).status_code == 204
    assert (await client.post("/auth/refresh")).status_code == 401
