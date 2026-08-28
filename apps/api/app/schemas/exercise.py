from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID | None
    is_global: bool
    nome: str
    grupo_muscular: list[str]
    equipamento: str | None
    how_to: str | None
    common_mistakes: str | None


class ExerciseCreate(BaseModel):
    # UUIDv7 gerado no cliente — o servidor aceita o id de quem escreve.
    id: UUID | None = None
    nome: str = Field(min_length=1, max_length=160)
    grupo_muscular: list[str] = Field(default_factory=list)
    equipamento: str | None = Field(default=None, max_length=80)
    how_to: str | None = None
    common_mistakes: str | None = None
