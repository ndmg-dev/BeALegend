"""Orquestra: builder -> provider -> upsert em nutrition_insight.

Gating (nesta ordem, barato antes de caro):
1. ``settings.nutrition_insights_enabled`` — kill switch global.
2. ``notification_preference.insights_ia_enabled`` — opt-in do usuário.
3. Já existe insight do período? Devolve o que tem, não chama o provider.
4. Dados suficientes? (diário exige ao menos 1 refeição.)
"""

import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.ids import uuid7
from app.models import NotificationPreference, NutritionInsight
from app.services.insights.builder import montar_dados_diarios, montar_dados_semanais
from app.services.insights.fake_provider import FakeProvider
from app.services.insights.provider import InsightProvider, InsightRequest

log = logging.getLogger("bealegend.insights")


def build_provider(settings: Settings | None = None) -> InsightProvider:
    """Escolhe o provider. Fase 1: sempre o fake.

    Fase 2 troca por ``OpenAIProvider(settings)`` quando houver
    ``openai_api_key``, mantendo o fake como fallback.
    """
    del settings
    return FakeProvider()


async def _opt_in(session: AsyncSession, user_id) -> bool:
    pref = await session.get(NotificationPreference, user_id)
    return bool(pref and pref.insights_ia_enabled)


async def _existente(
    session: AsyncSession, user_id, tipo: str, periodo_ref: date
) -> NutritionInsight | None:
    return await session.scalar(
        select(NutritionInsight).where(
            NutritionInsight.user_id == user_id,
            NutritionInsight.tipo == tipo,
            NutritionInsight.periodo_ref == periodo_ref,
            NutritionInsight.deleted_at.is_(None),
        )
    )


async def _upsert(
    session: AsyncSession, user_id, tipo: str, periodo_ref: date, texto: str, modelo: str
) -> NutritionInsight:
    stmt = (
        pg_insert(NutritionInsight)
        .values(
            id=uuid7(),
            user_id=user_id,
            tipo=tipo,
            periodo_ref=periodo_ref,
            texto=texto,
            modelo=modelo,
        )
        .on_conflict_do_update(
            constraint="uq_nutrition_insight_periodo",
            set_={"texto": texto, "modelo": modelo, "deleted_at": None},
        )
    )
    await session.execute(stmt)
    await session.commit()
    row = await _existente(session, user_id, tipo, periodo_ref)
    assert row is not None
    return row


async def gerar_insight_diario(
    session: AsyncSession,
    user_id,
    dia: date,
    provider: InsightProvider,
    *,
    settings: Settings | None = None,
) -> NutritionInsight | None:
    settings = settings or get_settings()
    if not settings.nutrition_insights_enabled:
        return None
    if not await _opt_in(session, user_id):
        return None

    ja_tem = await _existente(session, user_id, "diario", dia)
    if ja_tem is not None:
        return ja_tem

    dados = await montar_dados_diarios(session, user_id, dia)
    if dados["refeicoes_total"] < 1:
        return None

    try:
        result = await provider.gerar(InsightRequest("diario", dia, dados))
    except Exception as exc:
        log.warning("provider falhou no insight diário", extra={"erro": str(exc)[:200]})
        return None

    return await _upsert(session, user_id, "diario", dia, result.texto, result.modelo)


async def gerar_insight_semanal(
    session: AsyncSession,
    user_id,
    semana_inicio: date,
    provider: InsightProvider,
    *,
    settings: Settings | None = None,
    force: bool = False,
) -> NutritionInsight | None:
    settings = settings or get_settings()
    if not settings.nutrition_insights_enabled:
        return None
    if not await _opt_in(session, user_id):
        return None

    if not force:
        ja_tem = await _existente(session, user_id, "semanal", semana_inicio)
        if ja_tem is not None:
            return ja_tem

    dados = await montar_dados_semanais(session, user_id, semana_inicio)
    if dados["refeicoes_total"] < 1:
        return None

    try:
        result = await provider.gerar(InsightRequest("semanal", semana_inicio, dados))
    except Exception as exc:
        log.warning("provider falhou no insight semanal", extra={"erro": str(exc)[:200]})
        return None

    return await _upsert(session, user_id, "semanal", semana_inicio, result.texto, result.modelo)
