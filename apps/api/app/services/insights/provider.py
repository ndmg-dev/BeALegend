"""Contrato do provider de insights — a fronteira que isola a IA do resto.

``service.py`` recebe um ``InsightProvider`` por parâmetro. Em produção é o
``OpenAIProvider``; nos testes, o ``FakeProvider``. Trocar de provedor não
toca em router nem worker.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal, Protocol

InsightTipo = Literal["semanal", "diario"]


@dataclass(frozen=True)
class InsightRequest:
    tipo: InsightTipo
    periodo_ref: date
    #: Resumo estruturado montado por ``builder.py`` — nunca linha crua de
    #: tabela. O provider serializa isto como contexto do modelo.
    dados: dict


@dataclass(frozen=True)
class InsightResult:
    texto: str
    modelo: str


class ProviderIndisponivel(RuntimeError):
    """O provider não tem como atender agora (sem chave, sem rede, timeout)."""


class InsightProvider(Protocol):
    async def gerar(self, req: InsightRequest) -> InsightResult: ...
