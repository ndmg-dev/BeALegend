import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import NotificationDelivery, User
from app.services.push import dispatch_due_notifications, schedule_matches, settings
from tests.conftest import auth, register

ENDPOINT = "https://push.example/subscription/device-1"
KEYS = {"p256dh": "p" * 80, "auth": "a" * 24}


def op(entity, operation, id_, payload):
    return {
        "idempotency_key": f"phase6-{uuid.uuid4()}",
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
    results = response.json()["results"]
    assert all(result["status"] == "applied" for result in results), results


async def test_assinatura_preferencias_e_troca_segura_de_conta(client):
    _, token_a = await register(client)
    _, token_b = await register(client)

    config = await client.get("/notifications/config", headers=auth(token_a))
    assert config.status_code == 200
    assert config.json()["subscribed"] is False
    assert config.json()["configured"] is False

    subscribed = await client.post(
        "/notifications/subscriptions",
        json={"endpoint": ENDPOINT, "keys": KEYS},
        headers=auth(token_a),
    )
    assert subscribed.status_code == 204, subscribed.text
    assert (await client.get("/notifications/config", headers=auth(token_a))).json()[
        "subscribed"
    ] is True

    patched = await client.patch(
        "/notifications/preferences",
        json={"treino_enabled": False, "resumo_horario": "19:30"},
        headers=auth(token_a),
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["treino_enabled"] is False
    assert patched.json()["resumo_horario"] == "19:30:00"

    claimed = await client.post(
        "/notifications/subscriptions",
        json={"endpoint": ENDPOINT, "keys": KEYS},
        headers=auth(token_b),
    )
    assert claimed.status_code == 204, claimed.text
    assert (await client.get("/notifications/config", headers=auth(token_a))).json()[
        "subscribed"
    ] is False
    assert (await client.get("/notifications/config", headers=auth(token_b))).json()[
        "subscribed"
    ] is True


async def test_resumo_semanal_e_derivado_dos_registros(client):
    _, token = await register(client)
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    account_id = str(uuid.uuid4())
    habit_id = str(uuid.uuid4())
    await push(
        client,
        token,
        op("account", "create", account_id, {
            "nome": "Carteira", "tipo": "carteira", "saldo_inicial_centavos": 0,
        }),
        op("session", "create", str(uuid.uuid4()), {
            "data": str(monday), "status": "concluida",
        }),
        op("meal_log", "create", str(uuid.uuid4()), {
            "data": str(monday), "horario": "12:30", "descricao": "Almoço",
            "aderencia": "dentro",
        }),
        op("meal_log", "create", str(uuid.uuid4()), {
            "data": str(monday), "horario": "20:00", "descricao": "Jantar",
            "aderencia": "parcial",
        }),
        op("transaction", "create", str(uuid.uuid4()), {
            "account_id": account_id, "valor_centavos": 4250, "tipo": "despesa",
            "data": str(monday),
        }),
        op("habit", "create", habit_id, {
            "nome": "Ler", "frequencia_rrule": "FREQ=DAILY", "meta_por_semana": 7,
        }),
        op("habit_checkin", "create", str(uuid.uuid4()), {
            "habit_id": habit_id, "data": str(monday), "concluido": True,
        }),
    )
    response = await client.get("/summary/weekly", headers=auth(token))
    assert response.status_code == 200, response.text
    summary = response.json()
    assert summary["treinos_concluidos"] == 1
    assert summary["refeicoes_registradas"] == 2
    assert summary["aderencia_percentual"] == 75
    assert summary["gasto_centavos"] == 4250
    assert summary["habitos_concluidos"] == 1
    assert summary["habitos_previstos"] == 7


def test_agendamento_compara_hora_e_minuto():
    from datetime import UTC, datetime, time

    now = datetime(2026, 8, 30, 18, 0, 42, tzinfo=UTC)
    assert schedule_matches(now, time(18, 0)) is True
    assert schedule_matches(now, time(18, 1)) is False


async def test_api_aplica_headers_de_seguranca(client):
    response = await client.get("/healthz")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "geolocation=()" in response.headers["permissions-policy"]


async def test_worker_envia_resumo_uma_unica_vez(
    client, owner_engine, monkeypatch
):
    email, token = await register(client)
    response = await client.post(
        "/notifications/subscriptions",
        json={"endpoint": ENDPOINT, "keys": KEYS},
        headers=auth(token),
    )
    assert response.status_code == 204, response.text
    calls = []

    def fake_webpush(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr("app.services.push.webpush", fake_webpush)
    monkeypatch.setattr(settings, "vapid_public_key", "public-test-key")
    monkeypatch.setattr(settings, "vapid_private_key", "private-test-key")
    owner_session = async_sessionmaker(owner_engine, expire_on_commit=False)
    now = datetime(2026, 8, 30, 21, 0, tzinfo=UTC)  # domingo, 18h em São Paulo
    async with owner_session() as session:
        user = await session.scalar(select(User).where(User.email == email))
        assert user is not None
        first = await dispatch_due_notifications(session, now)
        second = await dispatch_due_notifications(session, now)
        deliveries = await session.scalar(select(func.count(NotificationDelivery.id)))
    assert first == 1
    assert second == 0
    assert deliveries == 1
    assert len(calls) == 1
    assert "resumo da semana" in calls[0]["data"]
