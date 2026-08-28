"""Registro das entidades que participam do sync.

Uma unica fonte de verdade para: quais tabelas entram no delta, qual schema
valida cada operacao e quais entidades sao append-only. As fases seguintes
registram as suas aqui e nao tocam no motor de sync.
"""

from dataclasses import dataclass

from pydantic import BaseModel

from app.models.base import Base
from app.models.exercise import Exercise
from app.schemas.exercise import ExerciseCreate, ExercisePatch


class OperacaoInvalida(Exception):
    """A operacao nao e permitida para esta entidade."""


@dataclass(frozen=True)
class SyncEntity:
    nome: str
    model: type[Base]
    schema_create: type[BaseModel]
    schema_patch: type[BaseModel] | None
    #: Log de treino e append-only por natureza: uma serie registrada nao e
    #: editada nem apagada. Sobrescrever um set_log perde dado que nao volta.
    append_only: bool = False


REGISTRY: dict[str, SyncEntity] = {
    "exercise": SyncEntity(
        nome="exercise",
        model=Exercise,
        schema_create=ExerciseCreate,
        schema_patch=ExercisePatch,
    ),
    # fase 2: session, set_log (append_only=True), cardio_log
    # fase 3: account, category, transaction, budget, recurring
}

OPERACOES = ("create", "update", "delete")


def get_entity(nome: str) -> SyncEntity:
    entidade = REGISTRY.get(nome)
    if entidade is None:
        raise OperacaoInvalida(f"Entidade desconhecida: {nome}")
    return entidade


def validar_operacao(nome: str, operacao: str) -> SyncEntity:
    """Funcao pura: decide se a operacao e legitima para a entidade.

    Testada isoladamente — e a regra que impede um bug de cliente de apagar
    um log de treino.
    """
    entidade = get_entity(nome)
    if operacao not in OPERACOES:
        raise OperacaoInvalida(f"Operacao desconhecida: {operacao}")
    if entidade.append_only and operacao != "create":
        raise OperacaoInvalida(
            f"'{nome}' e append-only: aceita apenas 'create', nunca '{operacao}'."
        )
    return entidade
