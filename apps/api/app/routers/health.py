from fastapi import APIRouter
from sqlalchemy import text

from app.db import SessionLocal

router = APIRouter(tags=["infra"])


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> dict[str, str]:
    async with SessionLocal() as session:
        await session.execute(text("SELECT 1"))
    return {"status": "ready", "db": "ok"}
