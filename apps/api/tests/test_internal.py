"""POST /internal/tick — o cron externo que substitui o worker na Vercel."""

import pytest

from app.config import get_settings


@pytest.fixture
def cron_secret(monkeypatch):
    monkeypatch.setattr(get_settings(), "cron_secret", "s3gr3d0")
    return "s3gr3d0"


async def test_tick_sem_segredo_e_404(client, cron_secret):
    resp = await client.post("/internal/tick")
    assert resp.status_code == 404


async def test_tick_segredo_errado_e_404(client, cron_secret):
    resp = await client.post("/internal/tick", headers={"X-Cron-Secret": "errado"})
    assert resp.status_code == 404


async def test_tick_segredo_certo_roda(client, cron_secret):
    resp = await client.post("/internal/tick", headers={"X-Cron-Secret": cron_secret})
    assert resp.status_code == 200, resp.text
    # VAPID e insights desligados no ambiente de teste -> nada a fazer, mas roda.
    assert resp.json() == {"notificacoes": 0, "insights_semanais": 0}


async def test_tick_sem_segredo_configurado_e_404(client):
    # get_settings().cron_secret == "" por padrao: a rota nunca responde.
    resp = await client.post("/internal/tick", headers={"X-Cron-Secret": "qualquer"})
    assert resp.status_code == 404
