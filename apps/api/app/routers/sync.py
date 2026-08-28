"""Endpoints de sincronizacao.

``POST /sync/batch`` drena a outbox do cliente; ``GET /sync`` devolve o delta
desde um cursor. Os dois sao a unica porta de escrita e leitura em massa —
os endpoints por recurso continuam existindo para leitura pontual.
"""

from fastapi import APIRouter, Query

from app.deps import CurrentUser, DbSession
from app.schemas.sync import SyncBatchRequest, SyncBatchResponse, SyncDelta
from app.sync.engine import aplicar_operacao, cursor_atual, montar_delta

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/batch", response_model=SyncBatchResponse)
async def drenar_outbox(
    body: SyncBatchRequest, user: CurrentUser, session: DbSession
) -> SyncBatchResponse:
    """Aplica as operacoes na ordem em que o cliente as enfileirou.

    Uma operacao rejeitada nao derruba o lote: o cliente precisa do veredito
    de cada item para saber o que descartar e o que retentar. Por isso o
    commit e unico, no fim — ou o lote inteiro entra, ou nada entra, e o
    cliente retenta o lote com as mesmas chaves de idempotencia.
    """
    resultados = [await aplicar_operacao(session, user.id, op) for op in body.operations]
    await session.commit()

    return SyncBatchResponse(results=resultados, cursor=await cursor_atual(session))


@router.get("", response_model=SyncDelta)
async def puxar_delta(
    user: CurrentUser,
    session: DbSession,
    since: int = Query(default=0, ge=0, description="Cursor devolvido no delta anterior."),
) -> SyncDelta:
    return await montar_delta(session, since=since)
