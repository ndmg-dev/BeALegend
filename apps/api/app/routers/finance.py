from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import case, func, select

from app.deps import CurrentUser, DbSession
from app.models import Budget, Category, FinanceTransaction
from app.schemas.finance import BudgetStatusOut, FinanceSummaryOut, TransactionOut

router = APIRouter(prefix="/finance", tags=["finance"])


@router.get("/transactions", response_model=list[TransactionOut])
async def transactions(
    user: CurrentUser,
    session: DbSession,
    de: Annotated[date | None, Query(alias="from")] = None,
    ate: Annotated[date | None, Query(alias="to")] = None,
    category: UUID | None = None,
) -> list[FinanceTransaction]:
    query = select(FinanceTransaction).where(FinanceTransaction.deleted_at.is_(None))
    if de:
        query = query.where(FinanceTransaction.data >= de)
    if ate:
        query = query.where(FinanceTransaction.data <= ate)
    if category:
        query = query.where(FinanceTransaction.category_id == category)
    result = await session.scalars(query.order_by(FinanceTransaction.data.desc()).limit(500))
    return list(result)


@router.get("/budgets/{mes_ano}", response_model=list[BudgetStatusOut])
async def budgets(mes_ano: str, user: CurrentUser, session: DbSession) -> list[BudgetStatusOut]:
    inicio = date.fromisoformat(f"{mes_ano}-01")
    fim = date(inicio.year + (inicio.month == 12), 1 if inicio.month == 12 else inicio.month + 1, 1)
    gasto = func.coalesce(
        func.sum(
            case(
                (FinanceTransaction.tipo == "despesa", FinanceTransaction.valor_centavos),
                else_=0,
            )
        ),
        0,
    )
    rows = (
        await session.execute(
            select(Budget, Category.nome, gasto)
            .join(Category, Category.id == Budget.category_id)
            .outerjoin(
                FinanceTransaction,
                (FinanceTransaction.category_id == Budget.category_id)
                & (FinanceTransaction.data >= inicio)
                & (FinanceTransaction.data < fim)
                & (FinanceTransaction.deleted_at.is_(None)),
            )
            .where(Budget.mes_ano == mes_ano, Budget.deleted_at.is_(None))
            .group_by(Budget.id, Category.nome)
            .order_by(Category.nome)
        )
    ).all()
    return [
        BudgetStatusOut(
            id=budget.id,
            category_id=budget.category_id,
            categoria_nome=nome,
            mes_ano=budget.mes_ano,
            limite_centavos=budget.limite_centavos,
            gasto_centavos=int(total),
        )
        for budget, nome, total in rows
    ]


@router.get("/summary", response_model=FinanceSummaryOut)
async def summary(
    user: CurrentUser,
    session: DbSession,
    de: Annotated[date, Query(alias="from")],
    ate: Annotated[date, Query(alias="to")],
) -> FinanceSummaryOut:
    rows = await session.execute(
        select(FinanceTransaction.tipo, func.sum(FinanceTransaction.valor_centavos))
        .where(
            FinanceTransaction.data >= de,
            FinanceTransaction.data <= ate,
            FinanceTransaction.deleted_at.is_(None),
        )
        .group_by(FinanceTransaction.tipo)
    )
    totais = {tipo: int(total) for tipo, total in rows}
    receitas = totais.get("receita", 0)
    despesas = totais.get("despesa", 0)
    return FinanceSummaryOut(
        receitas_centavos=receitas,
        despesas_centavos=despesas,
        saldo_centavos=receitas - despesas,
    )
