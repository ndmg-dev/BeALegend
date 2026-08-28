"""Agendador de lembretes.

O iOS nao tem background sync, entao o agendamento mora no servidor: este
processo dispara Web Push nos horarios e o service worker so exibe.
Fase 0 sobe o processo e o loop; os jobs entram na fase 6.
"""

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("bealegend.worker")


async def heartbeat() -> None:
    log.info("worker vivo")


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(heartbeat, "interval", minutes=15, id="heartbeat")
    # fase 6: lembrete de treino, lembrete de refeicao, resumo semanal
    return scheduler


async def main() -> None:
    scheduler = build_scheduler()
    scheduler.start()
    log.info("scheduler iniciado")
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
