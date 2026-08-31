from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AchievementUnlockCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID | None = None
    achievement_key: str = Field(min_length=1, max_length=80)
    desbloqueado_em: datetime
