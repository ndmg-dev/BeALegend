"""Agendador de lembretes e resumo semanal.

O iOS nao tem background sync, entao o agendamento mora no servidor: este
processo dispara Web Push nos horarios e o service worker so exibe.
"""

import asyncio
import logging
import time
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import get_settings
from app.services.push import dispatch_due_notifications

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("bealegend.worker")
settings = get_settings()
owner_engine = create_async_engine(settings.database_owner_url, pool_pre_ping=True)
OwnerSession = async_sessionmaker(owner_engine, expire_on_commit=False)

# O container roda com filesystem somente leitura; /tmp e o tmpfs montado
# para isto. O worker nao expoe porta nenhuma, entao um healthcheck HTTP nao
# da pra fazer — a idade deste arquivo e o sinal de vida que o healthcheck do
# docker-compose confere (infra/docker-compose.yml, servico "worker": os
# numeros la precisam concordar com as constantes abaixo).
HEARTBEAT_FILE = Path("/tmp/worker-heartbeat")
HEARTBEAT_INTERVAL_SECONDS = 30
#: Generoso o bastante para nao piscar unhealthy num ciclo de coleta de lixo
#: do runtime, mas curto o bastante para pegar um scheduler travado de verdade.
HEARTBEAT_MAX_AGE_SECONDS = HEARTBEAT_INTERVAL_SECONDS * 4


def write_heartbeat() -> None:
    HEARTBEAT_FILE.write_text(str(time.time()))


async def heartbeat() -> None:
    log.info("worker vivo")


async def deliver_notifications() -> None:
    async with OwnerSession() as session:
        delivered = await dispatch_due_notifications(session)
    if delivered:
        log.info("notificacoes processadas", extra={"quantidade": delivered})


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(heartbeat, "interval", minutes=15, id="heartbeat-log")
    scheduler.add_job(
        write_heartbeat,
        "interval",
        seconds=HEARTBEAT_INTERVAL_SECONDS,
        id="heartbeat-file",
    )
    scheduler.add_job(
        deliver_notifications,
        "cron",
        minute="*",
        id="notifications",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=50,
    )
    return scheduler


async def main() -> None:
    # Escrito antes do scheduler.start() para o healthcheck ja achar o
    # arquivo fresco no start_period, sem esperar o primeiro ciclo do job.
    write_heartbeat()
    scheduler = build_scheduler()
    scheduler.start()
    log.info("scheduler iniciado")
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
