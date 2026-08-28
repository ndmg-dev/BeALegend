from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Operacao = Literal["create", "update", "delete"]
StatusResultado = Literal["applied", "duplicate", "rejected"]


class SyncOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    #: Chave gerada pelo cliente, estavel entre retentativas da MESMA operacao.
    #: E o que faz um retry apos timeout nao duplicar o registro.
    idempotency_key: str = Field(min_length=8, max_length=120)
    entidade: str = Field(min_length=1, max_length=60)
    operacao: Operacao
    #: UUIDv7 gerado no cliente. O servidor aceita — isso elimina a classe de
    #: bug de "id temporario virou real e as referencias quebraram".
    id: UUID
    payload: dict[str, Any] = Field(default_factory=dict)


class SyncBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operations: list[SyncOperation] = Field(max_length=200)


class Problem(BaseModel):
    title: str
    detail: str | None = None


class SyncResult(BaseModel):
    idempotency_key: str
    status: StatusResultado
    entidade: str
    id: UUID
    #: A linha como o servidor a enxerga depois da operacao. O cliente
    #: reconcilia por cima disto — o servidor e o arbitro.
    entity: dict[str, Any] | None = None
    problem: Problem | None = None


class SyncBatchResponse(BaseModel):
    results: list[SyncResult]
    cursor: int


class SyncDelta(BaseModel):
    """Mudancas por entidade desde o cursor.

    Linhas apagadas vem com ``deleted_at`` preenchido, e nao ausentes: o
    cliente precisa saber que a linha morreu para remove-la do Dexie.
    """

    cursor: int
    changes: dict[str, list[dict[str, Any]]]
    #: `true` quando o delta foi truncado pelo limite — o cliente deve chamar
    #: de novo com o cursor devolvido ate vir `false`.
    has_more: bool
    server_time: datetime
