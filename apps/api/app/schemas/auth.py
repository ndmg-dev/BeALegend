from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    nome: str = Field(default="", max_length=120)
    timezone: str = Field(default="America/Sao_Paulo", max_length=64)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class AccessToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    nome: str
    timezone: str
    is_admin: bool
    criado_em: datetime


class UserUpdate(BaseModel):
    nome: str | None = Field(default=None, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
