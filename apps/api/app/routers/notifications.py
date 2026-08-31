from datetime import time

from fastapi import APIRouter, Request
from sqlalchemy import delete, func, select, text

from app.config import get_settings
from app.deps import CurrentUser, DbSession
from app.ids import uuid7
from app.models import NotificationPreference, PushSubscription
from app.routers.training import hoje_no_fuso
from app.schemas.notifications import (
    NotificationConfigOut,
    NotificationPreferenceOut,
    NotificationPreferencePatch,
    PushSubscriptionIn,
    PushUnsubscribeIn,
    WeeklySummaryOut,
)
from app.services.weekly_summary import build_weekly_summary

router = APIRouter(tags=["notifications"])
settings = get_settings()


def _preference_out(row: NotificationPreference | None) -> NotificationPreferenceOut:
    if row is None:
        return NotificationPreferenceOut()
    return NotificationPreferenceOut(
        treino_enabled=row.treino_enabled,
        treino_horario=row.treino_horario,
        refeicao_enabled=row.refeicao_enabled,
        resumo_semanal_enabled=row.resumo_semanal_enabled,
        resumo_dia_semana=row.resumo_dia_semana,
        resumo_horario=row.resumo_horario,
    )


@router.get("/notifications/config", response_model=NotificationConfigOut)
async def notification_config(user: CurrentUser, session: DbSession) -> NotificationConfigOut:
    preference = await session.get(NotificationPreference, user.id)
    count = await session.scalar(
        select(func.count(PushSubscription.id)).where(PushSubscription.active.is_(True))
    )
    configured = bool(settings.vapid_public_key and settings.vapid_private_key)
    return NotificationConfigOut(
        public_key=settings.vapid_public_key if configured else "",
        configured=configured,
        subscribed=bool(count),
        preferences=_preference_out(preference),
    )


@router.post("/notifications/subscriptions", status_code=204)
async def subscribe(
    body: PushSubscriptionIn, request: Request, user: CurrentUser, session: DbSession
) -> None:
    await session.execute(
        text(
            "SELECT claim_push_subscription(:user_id, :id, :endpoint, :p256dh, :auth, :user_agent)"
        ),
        {
            "user_id": user.id,
            "id": uuid7(),
            "endpoint": str(body.endpoint),
            "p256dh": body.keys.p256dh,
            "auth": body.keys.auth,
            "user_agent": request.headers.get("user-agent", "")[:500] or None,
        },
    )
    preference = await session.get(NotificationPreference, user.id)
    if preference is None:
        session.add(
            NotificationPreference(
                user_id=user.id,
                treino_enabled=True,
                treino_horario=time(18, 0),
                refeicao_enabled=True,
                resumo_semanal_enabled=True,
                resumo_dia_semana=6,
                resumo_horario=time(18, 0),
            )
        )
    await session.commit()


@router.post("/notifications/unsubscribe", status_code=204)
async def unsubscribe(body: PushUnsubscribeIn, user: CurrentUser, session: DbSession) -> None:
    await session.execute(
        delete(PushSubscription).where(PushSubscription.endpoint == str(body.endpoint))
    )
    await session.commit()


@router.patch("/notifications/preferences", response_model=NotificationPreferenceOut)
async def update_preferences(
    body: NotificationPreferencePatch, user: CurrentUser, session: DbSession
) -> NotificationPreferenceOut:
    row = await session.get(NotificationPreference, user.id)
    if row is None:
        row = NotificationPreference(user_id=user.id)
        session.add(row)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await session.commit()
    await session.refresh(row)
    return _preference_out(row)


@router.get("/summary/weekly", response_model=WeeklySummaryOut)
async def weekly_summary(user: CurrentUser, session: DbSession) -> WeeklySummaryOut:
    return await build_weekly_summary(session, user.id, hoje_no_fuso(user.timezone))
