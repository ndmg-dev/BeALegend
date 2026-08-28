from datetime import datetime
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
    row_version: int
    deleted_at: datetime | None


class ExercisePatch(BaseModel):
    """Patch parcial — só os campos que este dispositivo mudou.

    É o que torna o last-write-wins *por campo* possível: dois dispositivos que
    editam campos diferentes da mesma linha não se sobrescrevem, porque cada um
    só envia o que tocou. Quando tocam o mesmo campo, quem chega depois vence,
    e o `updated_at` do servidor registra a ordem.
    """

    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, min_length=1, max_length=160)
    grupo_muscular: list[str] | None = None
    equipamento: str | None = Field(default=None, max_length=80)
    how_to: str | None = None
    common_mistakes: str | None = None


class ExerciseCreate(BaseModel):
    # UUIDv7 gerado no cliente — o servidor aceita o id de quem escreve.
    id: UUID | None = None
    nome: str = Field(min_length=1, max_length=160)
    grupo_muscular: list[str] = Field(default_factory=list)
    equipamento: str | None = Field(default=None, max_length=80)
    how_to: str | None = None
    common_mistakes: str | None = None
