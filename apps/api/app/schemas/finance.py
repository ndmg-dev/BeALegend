from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AccountCreate(StrictModel):
    id: UUID | None = None
    nome: str = Field(min_length=1, max_length=120)
    tipo: str = Field(pattern="^(conta|cartao|carteira)$")
    saldo_inicial_centavos: int = Field(default=0, ge=0, le=10**15)


class AccountPatch(StrictModel):
    nome: str | None = Field(default=None, min_length=1, max_length=120)
    tipo: str | None = Field(default=None, pattern="^(conta|cartao|carteira)$")
    saldo_inicial_centavos: int | None = Field(default=None, ge=0, le=10**15)


class CategoryCreate(StrictModel):
    id: UUID | None = None
    nome: str = Field(min_length=1, max_length=80)
    tipo: str = Field(pattern="^(receita|despesa)$")
    cor: str | None = Field(default=None, max_length=30)
    icone: str | None = Field(default=None, max_length=30)
    pai_id: UUID | None = None


class CategoryPatch(StrictModel):
    nome: str | None = Field(default=None, min_length=1, max_length=80)
    cor: str | None = Field(default=None, max_length=30)
    icone: str | None = Field(default=None, max_length=30)
    pai_id: UUID | None = None


class TransactionCreate(StrictModel):
    id: UUID | None = None
    account_id: UUID
    category_id: UUID | None = None
    valor_centavos: int = Field(gt=0, le=10**15)
    tipo: str = Field(pattern="^(receita|despesa|transferencia)$")
    data: date
    descricao: str | None = Field(default=None, max_length=200)
    recorrente_id: UUID | None = None
    tags: list[str] = Field(default_factory=list, max_length=30)


class TransactionPatch(StrictModel):
    account_id: UUID | None = None
    category_id: UUID | None = None
    valor_centavos: int | None = Field(default=None, gt=0, le=10**15)
    tipo: str | None = Field(default=None, pattern="^(receita|despesa|transferencia)$")
    data: date | None = None
    descricao: str | None = Field(default=None, max_length=200)
    recorrente_id: UUID | None = None
    tags: list[str] | None = Field(default=None, max_length=30)


class BudgetCreate(StrictModel):
    id: UUID | None = None
    category_id: UUID
    mes_ano: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    limite_centavos: int = Field(gt=0, le=10**15)


class BudgetPatch(StrictModel):
    limite_centavos: int | None = Field(default=None, gt=0, le=10**15)


class RecurringCreate(StrictModel):
    id: UUID | None = None
    template_json: dict
    regra_rrule: str = Field(min_length=1, max_length=300)
    proxima_ocorrencia: date | None = None


class RecurringPatch(StrictModel):
    template_json: dict | None = None
    regra_rrule: str | None = Field(default=None, min_length=1, max_length=300)
    proxima_ocorrencia: date | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_id: UUID
    category_id: UUID | None
    valor_centavos: int
    tipo: str
    data: date
    descricao: str | None
    tags: list[str]


class BudgetStatusOut(BaseModel):
    id: UUID
    category_id: UUID
    categoria_nome: str
    mes_ano: str
    limite_centavos: int
    gasto_centavos: int


class FinanceSummaryOut(BaseModel):
    receitas_centavos: int
    despesas_centavos: int
    saldo_centavos: int
