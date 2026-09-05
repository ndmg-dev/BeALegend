"""Semeia o plano de treino a partir da planilha, para um usuário existente.

    python scripts/seed_training_plan.py --email voce@exemplo.com

Roda como a role OWNER (bypassa RLS), porque cria o catálogo global de
exercícios e de protocolos de cardio (``is_global=true``, ``user_id NULL``),
o que a role de runtime não pode fazer.

Um plano de cada vez fica ativo: ao criar o novo, os planos ativos anteriores
do usuário passam a ``ativo=false`` (continuam no histórico, nada é apagado).

Idempotente: rodar de novo sem ``--force`` não duplica nada — atualiza o
catálogo global e pula a criação do plano se um plano ativo com o mesmo nome
já existir para o usuário. Com ``--force``, o plano antigo (e tudo embaixo
dele: dias, itens, sessões, séries) é apagado e recriado.

Parser preso ao formato desta família de planilhas (4 abas: Semana, Treinos
de força, Exercícios detalhados, Cardio). O vocabulário de sessão e o mapa
dia→protocolo são inferidos; ``--xlsx`` aponta para outra planilha do mesmo
formato (ex.: o plano da esposa).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from uuid import UUID

import openpyxl
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ids import uuid7  # noqa: E402
from app.models import CardioProtocol, Exercise, PlanDay, PlanItem, TrainingPlan, User  # noqa: E402
from app.seed.parsing import (  # noqa: E402
    TREINO_FORCA_DO_SABADO,
    ExercicioPlanilha,
    mapa_protocolo_por_dia,
    parse_protocolos_cardio,
    slug_dia_semana,
    tipo_do_dia,
    unificar_exercicios,
)

DEFAULT_XLSX = Path(__file__).resolve().parent.parent / "data" / (
    "planilha_treino_semanal_com_estacao_strengthflow.xlsx"
)
DEFAULT_PLAN_NAME = "Força + estação + corrida + HIIT + bike"


def _ler_linhas(ws, colunas_esperadas: list[str]) -> list[dict]:
    """Lê uma planilha em lista de dicts, usando a linha de cabeçalho real
    (a primeira linha não-vazia que bate com as colunas esperadas)."""
    linhas = list(ws.iter_rows(values_only=True))
    cabecalho_idx = next(
        i
        for i, linha in enumerate(linhas)
        if linha and all(col in (linha or ()) for col in colunas_esperadas)
    )
    cabecalho = linhas[cabecalho_idx]
    dados = []
    for linha in linhas[cabecalho_idx + 1 :]:
        if not linha or linha[0] is None:
            continue
        dados.append(dict(zip(cabecalho, linha, strict=False)))
    return dados


def carregar_planilha(caminho: Path) -> dict:
    wb = openpyxl.load_workbook(caminho, data_only=True)

    semana_bruta = _ler_linhas(wb["Semana"], ["Dia", "Sessão"])
    # A aba tem uma linha de nota ("Regra de progressão...") logo depois dos 7
    # dias, sem cabecalho novo — corta no primeiro dia que nao reconhecemos.
    from app.seed.parsing import DIAS_PT_PARA_SLUG

    semana = []
    for linha in semana_bruta:
        if str(linha.get("Dia", "")).strip().lower() not in DIAS_PT_PARA_SLUG:
            break
        semana.append(linha)
    forca = _ler_linhas(wb["Treinos de força"], ["Treino", "Exercício", "Séries"])
    detalhado = _ler_linhas(wb["Exercícios detalhados"], ["Treino", "Exercício", "Como executar"])
    cardio = _ler_linhas(wb["Cardio"], ["Sessão", "Aquecimento"])

    return {
        "semana": semana,
        "exercicios": unificar_exercicios(forca, detalhado),
        "cardio": parse_protocolos_cardio(cardio),
    }


async def _obter_usuario(session: AsyncSession, email: str) -> User:
    usuario = await session.scalar(select(User).where(User.email == email.lower()))
    if usuario is None:
        raise SystemExit(
            f"Nenhum usuário com o e-mail {email!r}. Cadastre-se no app antes de rodar o seed."
        )
    return usuario


async def _upsert_exercicios_globais(
    session: AsyncSession, exercicios: list[ExercicioPlanilha]
) -> dict[str, UUID]:
    """Catálogo global: is_global=true, user_id NULL. Visível a todos."""
    ids: dict[str, UUID] = {}
    for ex in exercicios:
        existente = await session.scalar(
            select(Exercise).where(Exercise.is_global.is_(True), Exercise.nome == ex.nome)
        )
        if existente:
            existente.grupo_muscular = list(ex.grupo_muscular)
            existente.how_to = ex.how_to
            existente.common_mistakes = ex.common_mistakes
            ids[ex.nome] = existente.id
            continue

        novo = Exercise(
            id=uuid7(),
            user_id=None,
            is_global=True,
            nome=ex.nome,
            grupo_muscular=list(ex.grupo_muscular),
            how_to=ex.how_to,
            common_mistakes=ex.common_mistakes,
        )
        session.add(novo)
        await session.flush()
        ids[ex.nome] = novo.id
    return ids


async def _upsert_protocolos_cardio(session: AsyncSession, protocolos: list) -> dict[str, UUID]:
    ids: dict[str, UUID] = {}
    for p in protocolos:
        existente = await session.scalar(
            select(CardioProtocol).where(
                CardioProtocol.is_global.is_(True), CardioProtocol.nome == p.nome
            )
        )
        if existente:
            existente.aquecimento = p.aquecimento
            existente.parte_principal = p.parte_principal
            existente.recuperacao = p.recuperacao
            existente.desaquecimento = p.desaquecimento
            existente.rpe_alvo = p.rpe_alvo
            existente.observacao = p.observacao
            ids[p.nome] = existente.id
            continue

        novo = CardioProtocol(
            id=uuid7(),
            user_id=None,
            is_global=True,
            nome=p.nome,
            aquecimento=p.aquecimento,
            parte_principal=p.parte_principal,
            recuperacao=p.recuperacao,
            desaquecimento=p.desaquecimento,
            rpe_alvo=p.rpe_alvo,
            observacao=p.observacao,
        )
        session.add(novo)
        await session.flush()
        ids[p.nome] = novo.id
    return ids


async def _criar_plano(
    session: AsyncSession,
    usuario: User,
    nome_plano: str,
    semana: list[dict],
    exercicios_por_nome: dict[str, UUID],
    exercicios_parseados: list[ExercicioPlanilha],
    cardio_por_nome: dict[str, UUID],
    protocolo_por_dia: dict[str, str],
    force: bool,
) -> None:
    existente = await session.scalar(
        select(TrainingPlan).where(
            TrainingPlan.user_id == usuario.id,
            TrainingPlan.nome == nome_plano,
            TrainingPlan.deleted_at.is_(None),
        )
    )
    if existente is not None:
        if not force:
            print(f"Plano {nome_plano!r} já existe para {usuario.email}. Use --force para recriar.")
            return
        await session.execute(delete(TrainingPlan).where(TrainingPlan.id == existente.id))
        await session.flush()

    # Um plano de cada vez fica ativo: a rotina nova substitui a anterior no app,
    # mas os planos antigos continuam no histórico (só deixam de ser o ativo).
    anteriores = (
        await session.scalars(
            select(TrainingPlan).where(
                TrainingPlan.user_id == usuario.id,
                TrainingPlan.ativo.is_(True),
                TrainingPlan.deleted_at.is_(None),
            )
        )
    ).all()
    for anterior in anteriores:
        anterior.ativo = False
        print(f"Plano {anterior.nome!r} desativado (continua no histórico).")

    plano = TrainingPlan(id=uuid7(), user_id=usuario.id, nome=nome_plano, ativo=True)
    session.add(plano)
    await session.flush()

    exercicios_por_treino: dict[str, list[ExercicioPlanilha]] = {}
    for ex in exercicios_parseados:
        exercicios_por_treino.setdefault(ex.treino, []).append(ex)

    for linha in semana:
        dia_semana = slug_dia_semana(linha["Dia"])
        sessao = linha["Sessão"].strip()
        tipo = tipo_do_dia(sessao)

        dia = PlanDay(
            id=uuid7(),
            user_id=usuario.id,
            plan_id=plano.id,
            dia_semana=dia_semana,
            tipo=tipo,
            foco=(linha.get("Foco") or "").strip() or None,
            duracao_min=(str(linha.get("Duração") or "").strip() or None),
            intensidade=(linha.get("Intensidade") or "").strip() or None,
            observacoes=(linha.get("Observações") or "").strip() or None,
        )
        session.add(dia)
        await session.flush()

        ordem = 1

        protocolo_nome = protocolo_por_dia.get(dia_semana)
        if protocolo_nome and tipo in ("cardio", "hiit"):
            protocolo_id = cardio_por_nome.get(protocolo_nome)
            if protocolo_id is None:
                raise SystemExit(f"Protocolo de cardio não encontrado: {protocolo_nome!r}")
            session.add(
                PlanItem(
                    id=uuid7(),
                    user_id=usuario.id,
                    plan_day_id=dia.id,
                    cardio_protocol_id=protocolo_id,
                    ordem=ordem,
                    unidade="reps",
                )
            )
            ordem += 1

        treino_forca = TREINO_FORCA_DO_SABADO if sessao == "Cardio + antebraço" else sessao
        for ex in exercicios_por_treino.get(treino_forca, []):
            exercise_id = exercicios_por_nome.get(ex.nome)
            if exercise_id is None:
                raise SystemExit(f"Exercício não encontrado no catálogo: {ex.nome!r}")

            session.add(
                PlanItem(
                    id=uuid7(),
                    user_id=usuario.id,
                    plan_day_id=dia.id,
                    exercise_id=exercise_id,
                    ordem=ordem,
                    series_min=ex.series.minimo,
                    series_max=ex.series.maximo,
                    reps_min=ex.reps.minimo,
                    reps_max=ex.reps.maximo,
                    unidade=ex.reps.unidade,
                    unilateral=ex.reps.unilateral,
                    rir_min=ex.rir.minimo,
                    rir_max=ex.rir.maximo,
                    descanso_seg=ex.descanso_seg,
                )
            )
            ordem += 1

    print(f"Plano {nome_plano!r} criado para {usuario.email}: {len(semana)} dias.")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="E-mail do usuário dono do plano.")
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    parser.add_argument("--plan-name", default=DEFAULT_PLAN_NAME)
    parser.add_argument(
        "--database-url",
        default=None,
        help="Postgres OWNER url. Por padrão, lê DATABASE_OWNER_URL do ambiente.",
    )
    parser.add_argument(
        "--force", action="store_true", help="Recria o plano se já existir um com este nome."
    )
    args = parser.parse_args()

    import os

    database_url = args.database_url or os.environ.get("DATABASE_OWNER_URL")
    if not database_url:
        raise SystemExit("Defina --database-url ou a variável DATABASE_OWNER_URL.")

    if not args.xlsx.exists():
        raise SystemExit(f"Planilha não encontrada: {args.xlsx}")

    dados = carregar_planilha(args.xlsx)

    # O pgbouncer do Neon (endpoint "-pooler") não gosta de prepared statement
    # do asyncpg — mesmo ajuste que a API usa para falar com o pooler.
    engine = create_async_engine(database_url, connect_args={"statement_cache_size": 0})
    async with AsyncSession(engine) as session:
        usuario = await _obter_usuario(session, args.email)
        exercicios_por_nome = await _upsert_exercicios_globais(session, dados["exercicios"])
        cardio_por_nome = await _upsert_protocolos_cardio(session, dados["cardio"])
        await session.flush()

        await _criar_plano(
            session,
            usuario,
            args.plan_name,
            dados["semana"],
            exercicios_por_nome,
            dados["exercicios"],
            cardio_por_nome,
            mapa_protocolo_por_dia(dados["cardio"]),
            args.force,
        )
        await session.commit()

    await engine.dispose()
    print("Seed concluído.")


if __name__ == "__main__":
    asyncio.run(main())
