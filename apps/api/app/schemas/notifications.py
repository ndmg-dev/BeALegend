from datetime import date, time

from pydantic import BaseModel, Field, HttpUrl


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=20, max_length=500)
    auth: str = Field(min_length=10, max_length=500)


class PushSubscriptionIn(BaseModel):
    endpoint: HttpUrl
    keys: PushKeys


class PushUnsubscribeIn(BaseModel):
    endpoint: HttpUrl


class NotificationPreferenceOut(BaseModel):
    treino_enabled: bool = True
    treino_horario: time = time(18, 0)
    refeicao_enabled: bool = True
    resumo_semanal_enabled: bool = True
    resumo_dia_semana: int = 6
    resumo_horario: time = time(18, 0)
    insights_ia_enabled: bool = False


class NotificationPreferencePatch(BaseModel):
    treino_enabled: bool | None = None
    treino_horario: time | None = None
    refeicao_enabled: bool | None = None
    resumo_semanal_enabled: bool | None = None
    resumo_dia_semana: int | None = Field(default=None, ge=0, le=6)
    resumo_horario: time | None = None
    insights_ia_enabled: bool | None = None


class NotificationConfigOut(BaseModel):
    public_key: str
    configured: bool
    subscribed: bool
    preferences: NotificationPreferenceOut


class WeeklySummaryOut(BaseModel):
    inicio: date
    fim: date
    treinos_concluidos: int
    refeicoes_registradas: int
    aderencia_percentual: int
    gasto_centavos: int
    habitos_concluidos: int
    habitos_previstos: int
