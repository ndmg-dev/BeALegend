"""Catalogo de exercicios — a primeira tabela protegida por RLS.

Nao ha filtro por ``user_id`` nas queries deste modulo de proposito: quem
filtra e a policy do Postgres. Se a policy sumir, o teste de isolamento quebra.
"""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.errors import ProblemException
from app.ids import uuid7
from app.models import Exercise
from app.schemas.exercise import ExerciseCreate, ExerciseOut

router = APIRouter(prefix="/training/exercises", tags=["training"])


@router.get("", response_model=list[ExerciseOut])
async def list_exercises(user: CurrentUser, session: DbSession) -> list[Exercise]:
    result = await session.scalars(
        select(Exercise).where(Exercise.deleted_at.is_(None)).order_by(Exercise.nome)
    )
    return list(result)


@router.post("", response_model=ExerciseOut, status_code=201)
async def create_exercise(
    body: ExerciseCreate, user: CurrentUser, session: DbSession
) -> Exercise:
    exercise = Exercise(
        id=body.id or uuid7(),
        user_id=user.id,
        is_global=False,
        nome=body.nome,
        grupo_muscular=body.grupo_muscular,
        equipamento=body.equipamento,
        how_to=body.how_to,
        common_mistakes=body.common_mistakes,
    )
    session.add(exercise)
    await session.commit()
    await session.refresh(exercise)
    return exercise


@router.get("/{exercise_id}", response_model=ExerciseOut)
async def get_exercise(exercise_id: UUID, user: CurrentUser, session: DbSession) -> Exercise:
    exercise = await session.scalar(
        select(Exercise).where(Exercise.id == exercise_id, Exercise.deleted_at.is_(None))
    )
    if exercise is None:
        raise ProblemException(
            404,
            "Exercicio nao encontrado",
            "Nenhum exercicio com este id e visivel para voce.",
            "https://bealegend.app/problems/not-found",
        )
    return exercise
