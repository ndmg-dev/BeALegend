"""Endpoint de manutenção — substitui o worker na Vercel.

Um cron externo (cron-job.org) chama ``POST /internal/tick`` a cada minuto com
o header ``X-Cron-Secret``. Roda o disparo de Web Push e a geração de insights
semanais, tudo como a role OWNER (bypassa RLS, itera todos os usuários).

Fora da Vercel, o worker (``app/worker.py``) continua fazendo isso — este
endpoint só existe porque serverless não tem processo de fundo.
"""

import logging

from fastapi import APIRouter, Request
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings
from app.errors import ProblemException
from app.services.insights import build_provider, processar_insights_semanais
from app.services.push import dispatch_due_notifications

router = APIRouter(prefix="/internal", tags=["internal"])
log = logging.getLogger("bealegend.tick")
settings = get_settings()

_NAO_ENCONTRADO = ProblemException(
    404, "Nao encontrado", "Recurso inexistente.", "https://bealegend.app/problems/not-found"
)


@router.post("/tick")
async def tick(request: Request) -> dict:
    if not settings.cron_secret or request.headers.get("x-cron-secret") != settings.cron_secret:
        # 404, nao 401 — nao anuncia que a rota existe.
        raise _NAO_ENCONTRADO

    engine = create_async_engine(settings.database_owner_url, poolclass=NullPool)
    OwnerSession = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with OwnerSession() as session:
            entregues = await dispatch_due_notifications(session)
        async with OwnerSession() as session:
            insights = await processar_insights_semanais(session, build_provider())
    finally:
        await engine.dispose()

    if entregues or insights:
        log.info("tick", extra={"entregues": entregues, "insights": insights})
    return {"notificacoes": entregues, "insights_semanais": insights}
