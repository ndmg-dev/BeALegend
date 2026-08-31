"""Monta o resumo estruturado que vai para o modelo — sem IA, só banco.

Regras:
- Sempre filtra por ``user_id`` explícito, para servir tanto o endpoint (com
  RLS) quanto o worker (OwnerSession, sem RLS).
- Nada de linha crua: descrições e tags entram agregadas e truncadas.
- Teto de tamanho: ``notas`` fica de fora (campo mais livre, mais sensível).
"""

from collections import Counter
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MealLog, Session, WaterLog

AGUA_META_ML = 2000
_MAX_DESCRICOES = 10
_MAX_TAGS = 10
_DESCRICAO_TRUNC = 80

_ADERENCIA_PONTOS = {"dentro": 100, "parcial": 50, "fora": 0}


def _aderencia_percentual(meals: list[MealLog]) -> int:
    if not meals:
        return 0
    pontos = sum(_ADERENCIA_PONTOS.get(m.aderencia, 0) for m in meals)
    return round(pontos / len(meals))


def _agrega_refeicoes(meals: list[MealLog]) -> dict:
    aderencia = Counter(m.aderencia for m in meals)
    tags: Counter[str] = Counter()
    descricoes: Counter[str] = Counter()
    for m in meals:
        for tag in m.tags or []:
            if isinstance(tag, str):
                tags[tag] += 1
        descricoes[m.descricao.strip()[:_DESCRICAO_TRUNC]] += 1
    return {
        "refeicoes_total": len(meals),
        "aderencia_percentual": _aderencia_percentual(meals),
        "aderencia_distribuicao": dict(aderencia),
        "tags_frequentes": [t for t, _ in tags.most_common(_MAX_TAGS)],
        "descricoes_recorrentes": [d for d, _ in descricoes.most_common(_MAX_DESCRICOES)],
    }


async def _meals(session: AsyncSession, user_id, inicio: date, fim: date) -> list[MealLog]:
    return list(
        await session.scalars(
            select(MealLog)
            .where(
                MealLog.user_id == user_id,
                MealLog.data.between(inicio, fim),
                MealLog.deleted_at.is_(None),
            )
            .order_by(MealLog.data, MealLog.horario)
        )
    )


async def _agua_ml(session: AsyncSession, user_id, inicio: date, fim: date) -> int:
    total = await session.scalar(
        select(func.coalesce(func.sum(WaterLog.ml), 0)).where(
            WaterLog.user_id == user_id,
            WaterLog.data.between(inicio, fim),
            WaterLog.deleted_at.is_(None),
        )
    )
    return int(total or 0)


async def _treinos_concluidos(session: AsyncSession, user_id, inicio: date, fim: date) -> int:
    rows = list(
        await session.scalars(
            select(Session.id).where(
                Session.user_id == user_id,
                Session.data.between(inicio, fim),
                Session.status == "concluida",
                Session.deleted_at.is_(None),
            )
        )
    )
    return len(rows)


async def montar_dados_diarios(session: AsyncSession, user_id, dia: date) -> dict:
    meals = await _meals(session, user_id, dia, dia)
    return {
        "periodo": "dia",
        "data": dia.isoformat(),
        "agua_ml": await _agua_ml(session, user_id, dia, dia),
        "agua_meta_ml": AGUA_META_ML,
        "treinou_no_dia": bool(await _treinos_concluidos(session, user_id, dia, dia)),
        **_agrega_refeicoes(meals),
    }


async def montar_dados_semanais(session: AsyncSession, user_id, semana_inicio: date) -> dict:
    fim = semana_inicio + timedelta(days=6)
    meals = await _meals(session, user_id, semana_inicio, fim)
    agua = await _agua_ml(session, user_id, semana_inicio, fim)
    por_dia_semana = Counter(m.data.strftime("%A") for m in meals)
    return {
        "periodo": "semana",
        "inicio": semana_inicio.isoformat(),
        "fim": fim.isoformat(),
        "agua_total_ml": agua,
        "agua_media_diaria_ml": round(agua / 7),
        "agua_meta_diaria_ml": AGUA_META_ML,
        "treinos_concluidos": await _treinos_concluidos(session, user_id, semana_inicio, fim),
        "refeicoes_por_dia_da_semana": dict(por_dia_semana),
        **_agrega_refeicoes(meals),
    }
