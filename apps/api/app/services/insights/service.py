"""Orquestra: builder -> provider -> upsert em nutrition_insight.

Gating (nesta ordem, barato antes de caro):
1. ``settings.nutrition_insights_enabled`` — kill switch global.
2. ``notification_preference.insights_ia_enabled`` — opt-in do usuário.
3. Já existe insight do período? Devolve o que tem, não chama o provider.
4. Dados suficientes? (diário exige ao menos 1 refeição.)
"""

import logging
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.ids import uuid7
from app.models import NotificationPreference, NutritionInsight, User
from app.services.insights.builder import montar_dados_diarios, montar_dados_semanais
from app.services.insights.fake_provider import FakeProvider
from app.services.insights.openai_provider import OpenAIProvider
from app.services.insights.provider import InsightProvider, InsightRequest

log = logging.getLogger("bealegend.insights")


def build_provider(settings: Settings | None = None) -> InsightProvider:
    """OpenAI quando há chave; senão o fake (dev/testes/feature meio ligada)."""
    settings = settings or get_settings()
    if settings.openai_api_key:
        return OpenAIProvider(settings)
    return FakeProvider()


def get_insight_provider() -> InsightProvider:
    """Dependência FastAPI — os testes sobrescrevem via ``dependency_overrides``."""
    return build_provider()


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


def _agora_local(now: datetime, timezone: str) -> datetime:
    try:
        return now.astimezone(ZoneInfo(timezone))
    except ZoneInfoNotFoundError:
        return now.astimezone(UTC)


async def processar_insights_semanais(
    session: AsyncSession,
    provider: InsightProvider,
    *,
    now: datetime | None = None,
    limite: int = 200,
) -> int:
    """Job do worker: gera o insight semanal de quem optou por ele.

    Roda com ``OwnerSession`` (sem RLS), então filtra tudo por ``user_id``
    explícito. Dispara no dia/horário do resumo semanal do usuário — a partir
    dele, não num minuto exato, para um cron de 15 em 15 não perder a janela.
    Idempotente pelo ``unique (user_id, tipo, periodo_ref)``.
    """
    settings = get_settings()
    if not settings.nutrition_insights_enabled:
        return 0

    now = (now or datetime.now(UTC)).astimezone(UTC)
    prefs = list(
        await session.scalars(
            select(NotificationPreference).where(
                NotificationPreference.insights_ia_enabled.is_(True)
            )
        )
    )

    gerados = 0
    for pref in prefs:
        if gerados >= limite:
            log.warning("teto de insights semanais atingido", extra={"limite": limite})
            break
        user = await session.get(User, pref.user_id)
        if user is None or not user.is_active:
            continue
        local_now = _agora_local(now, user.timezone)
        if local_now.weekday() != pref.resumo_dia_semana:
            continue
        if local_now.time() < pref.resumo_horario:
            continue
        semana_inicio = local_now.date() - timedelta(days=local_now.weekday())
        if await _existente(session, user.id, "semanal", semana_inicio) is not None:
            continue
        if await gerar_insight_semanal(
            session, user.id, semana_inicio, provider, settings=settings
        ):
            gerados += 1
    return gerados
