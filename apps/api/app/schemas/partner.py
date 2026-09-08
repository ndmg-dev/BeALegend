from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr


class PartnerInviteIn(BaseModel):
    email: EmailStr


class PartnerLinkOut(BaseModel):
    id: UUID
    status: Literal["pendente", "aceito", "recusado"]
    #: "enviado": eu convidei. "recebido": me convidaram.
    direcao: Literal["enviado", "recebido"]
    partner_email: str
    criado_em: datetime
    respondido_em: datetime | None


class PartnerSummaryOut(BaseModel):
    """Igual a `WeeklySummaryOut`, sem `gasto_centavos` — o resumo do
    parceiro nunca inclui finanças."""

    inicio: date
    fim: date
    treinos_concluidos: int
    refeicoes_registradas: int
    aderencia_percentual: int
    habitos_concluidos: int
    habitos_previstos: int
