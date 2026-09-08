"""Endpoints de sincronizacao.

``POST /sync/batch`` drena a outbox do cliente; ``GET /sync`` devolve o delta
desde um cursor. Os dois sao a unica porta de escrita e leitura em massa —
os endpoints por recurso continuam existindo para leitura pontual.
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Query

from app.deps import CurrentUser, DbSession
from app.schemas.sync import SyncBatchRequest, SyncBatchResponse, SyncDelta
from app.services.push import notify_achievement_unlock
from app.sync.engine import aplicar_operacao, cursor_atual, montar_delta

router = APIRouter(prefix="/sync", tags=["sync"])
log = logging.getLogger("bealegend.sync")


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

    # Push de conquista desbloqueada: o `evaluate` que decide quem desbloqueou
    # e' 100% cliente (mesmo offline), mas o push so' pode sair daqui — e' o
    # unico jeito de uma conquista feita offline (ou com o app fechado)
    # avisar outro aparelho do mesmo usuario. Depois do commit, nunca antes:
    # um push nao pode anunciar algo que a transacao ainda pode reverter.
    for resultado in resultados:
        if resultado.entidade != "achievement_unlock" or resultado.status != "applied":
            continue
        entity = resultado.entity or {}
        achievement_key = entity.get("achievement_key")
        desbloqueado_em = entity.get("desbloqueado_em")
        if not achievement_key or not desbloqueado_em:
            continue
        # Recem-aplicada: `entity` guarda o objeto `datetime` original. Vinda
        # do registro de idempotencia (replay): ja passou por `mode="json"` e
        # chega como string ISO. `notify_achievement_unlock` precisa do tipo
        # datetime para casar com a coluna `scheduled_for`.
        if isinstance(desbloqueado_em, str):
            desbloqueado_em = datetime.fromisoformat(desbloqueado_em)
        try:
            await notify_achievement_unlock(session, user.id, achievement_key, desbloqueado_em)
        except Exception:
            # Push e' best-effort: uma falha de rede/VAPID aqui nao pode
            # derrubar a resposta do sync, que ja' aplicou e comitou os dados.
            log.warning("falha ao notificar conquista desbloqueada", exc_info=True)

    return SyncBatchResponse(results=resultados, cursor=await cursor_atual(session))


@router.get("", response_model=SyncDelta)
async def puxar_delta(
    user: CurrentUser,
    session: DbSession,
    since: int = Query(default=0, ge=0, description="Cursor devolvido no delta anterior."),
) -> SyncDelta:
    return await montar_delta(session, since=since)
