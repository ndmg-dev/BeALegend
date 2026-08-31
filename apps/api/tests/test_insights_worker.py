"""Fase 3 — job do worker que gera o insight semanal de quem optou por ele."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app import worker
from app.config import get_settings
from app.models import NutritionInsight
from app.services.insights import FakeProvider, processar_insights_semanais
from tests.conftest import auth, register
from tests.test_nutrition_insights import opt_in, registrar_refeicao

TZ = ZoneInfo("America/Sao_Paulo")


@pytest.fixture
def insights_on(monkeypatch):
    monkeypatch.setattr(get_settings(), "nutrition_insights_enabled", True)


async def _preparar_usuario(client, *, dia_semana: int, com_refeicao: bool):
    _, token = await register(client)
    await opt_in(client, token)
    resp = await client.patch(
        "/notifications/preferences",
        json={"resumo_dia_semana": dia_semana, "resumo_horario": "00:00:00"},
        headers=auth(token),
    )
    assert resp.status_code == 200, resp.text
    if com_refeicao:
        local_hoje = datetime.now(UTC).astimezone(TZ).date()
        await registrar_refeicao(client, token, str(local_hoje))
    return token


async def _rodar(owner_engine, now: datetime) -> int:
    Session = async_sessionmaker(owner_engine)
    async with Session() as session:
        return await processar_insights_semanais(session, FakeProvider(), now=now)


async def test_gera_no_dia_do_resumo_e_e_idempotente(client, insights_on, owner_engine):
    now = datetime.now(UTC)
    hoje_local = now.astimezone(TZ)
    await _preparar_usuario(client, dia_semana=hoje_local.weekday(), com_refeicao=True)

    assert await _rodar(owner_engine, now) == 1
    assert await _rodar(owner_engine, now) == 0  # unique constraint segura

    Session = async_sessionmaker(owner_engine)
    async with Session() as session:
        total = await session.scalar(
            select(func.count(NutritionInsight.id)).where(NutritionInsight.tipo == "semanal")
        )
    assert total == 1


async def test_pula_quem_nao_e_o_dia(client, insights_on, owner_engine):
    now = datetime.now(UTC)
    outro_dia = (now.astimezone(TZ).weekday() + 1) % 7
    await _preparar_usuario(client, dia_semana=outro_dia, com_refeicao=True)
    assert await _rodar(owner_engine, now) == 0


async def test_pula_sem_refeicao_na_semana(client, insights_on, owner_engine):
    now = datetime.now(UTC)
    await _preparar_usuario(
        client, dia_semana=now.astimezone(TZ).weekday(), com_refeicao=False
    )
    assert await _rodar(owner_engine, now) == 0


async def test_nao_roda_com_feature_desligada(client, owner_engine):
    now = datetime.now(UTC)
    await _preparar_usuario(client, dia_semana=now.astimezone(TZ).weekday(), com_refeicao=True)
    assert await _rodar(owner_engine, now) == 0


def test_scheduler_agenda_o_job_de_insights():
    scheduler = worker.build_scheduler()
    job = scheduler.get_job("nutrition-insights")
    assert job is not None
