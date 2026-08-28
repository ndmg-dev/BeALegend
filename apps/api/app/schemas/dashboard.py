from datetime import date

from pydantic import BaseModel


class DashboardTodayOut(BaseModel):
    data: date
    treino_tipo: str | None
    treino_foco: str | None
    refeicoes_feitas: int
    refeicoes_planejadas: int
    agua_ml: int
    gasto_centavos: int
    habitos_concluidos: int
    habitos_total: int
