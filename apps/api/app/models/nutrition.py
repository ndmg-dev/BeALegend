from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SyncMixin


class MealPlan(Base, SyncMixin):
    __tablename__ = "meal_plan"
    __table_args__ = (Index("ix_meal_plan_user_id_ativo", "user_id", "ativo"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class MealSlot(Base, SyncMixin):
    __tablename__ = "meal_slot"
    __table_args__ = (Index("ix_meal_slot_user_id_plan", "user_id", "meal_plan_id"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    meal_plan_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("meal_plan.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    horario_alvo: Mapped[str | None] = mapped_column(String(5), nullable=True)
    descricao: Mapped[str | None] = mapped_column(String(240), nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class MealLog(Base, SyncMixin):
    __tablename__ = "meal_log"
    __table_args__ = (
        CheckConstraint("aderencia IN ('dentro','parcial','fora')", name="ck_meal_log_aderencia"),
        Index("ix_meal_log_user_id_data", "user_id", "data"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    data: Mapped[date] = mapped_column(Date, nullable=False)
    slot_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("meal_slot.id", ondelete="SET NULL"), nullable=True
    )
    horario: Mapped[str] = mapped_column(String(5), nullable=False)
    descricao: Mapped[str] = mapped_column(String(240), nullable=False)
    foto_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    aderencia: Mapped[str] = mapped_column(String(8), nullable=False)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


class WaterLog(Base, SyncMixin):
    __tablename__ = "water_log"
    __table_args__ = (
        CheckConstraint("ml > 0 AND ml <= 5000", name="ck_water_log_ml_valido"),
        Index("ix_water_log_user_id_data", "user_id", "data"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    data: Mapped[date] = mapped_column(Date, nullable=False)
    ml: Mapped[int] = mapped_column(Integer, nullable=False)
    registrado_em: Mapped[str] = mapped_column(String(30), nullable=False)


class FoodItem(Base, SyncMixin):
    """Catálogo de alimentos — macros por 100 g/ml.

    Mesma forma do ``Exercise``: ``is_global=true`` com ``user_id NULL`` é o
    catálogo que o seed escreve e todo mundo enxerga; uma linha com dono é um
    alimento que o próprio usuário cadastrou.

    Os valores são por 100 g (ou 100 ml, para líquidos) porque é assim que a
    tabela TACO e os rótulos publicam — converter na origem faria a porção
    virar a unidade e perderia a base de comparação.
    """

    __tablename__ = "food_item"
    __table_args__ = (
        CheckConstraint(
            "(is_global AND user_id IS NULL) OR (NOT is_global AND user_id IS NOT NULL)",
            name="ck_food_item_global_xor_owned",
        ),
        Index("ix_food_item_user_id_nome", "user_id", "nome"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=True
    )
    is_global: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    kcal: Mapped[float] = mapped_column(Numeric(7, 2), nullable=False)
    proteina_g: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    carboidrato_g: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    gordura_g: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    fibra_g: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    #: "~50 g por ovo grande" — ajuda a estimar a porção sem balança.
    referencia_pratica: Mapped[str | None] = mapped_column(String(120), nullable=True)
    fonte: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Industrializado: o rótulo da marca real ganha do valor genérico daqui.
    conferir_rotulo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class MealSlotItem(Base, SyncMixin):
    """Alimento planejado dentro de uma refeição — o ``PlanItem`` da dieta.

    ``quantidade_g`` é opcional de propósito: a planilha de origem sugere os
    alimentos de cada refeição sem fixar as porções, que ficam para o usuário
    fechar contra a meta do dia. Sem quantidade, o item vale como sugestão.
    """

    __tablename__ = "meal_slot_item"
    __table_args__ = (Index("ix_meal_slot_item_user_id_slot", "user_id", "meal_slot_id"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    meal_slot_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("meal_slot.id", ondelete="CASCADE"), nullable=False
    )
    food_item_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("food_item.id", ondelete="CASCADE"), nullable=False
    )
    quantidade_g: Mapped[float | None] = mapped_column(Numeric(7, 2), nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    observacao: Mapped[str | None] = mapped_column(String(240), nullable=True)


class NutritionTarget(Base, SyncMixin):
    """Parâmetros de meta do plano — a régua contra a qual o dia é lido.

    Guarda os *parâmetros* (g/kg, fator de atividade, ajuste calórico), não os
    valores absolutos: proteína e gordura derivam do peso atual, que muda. O
    peso vem do ``body_metric`` mais recente, então a meta acompanha sozinha.

    Sexo, idade e altura ficam aqui, opcionais, porque a estimativa de
    metabolismo basal precisa deles e o cadastro do app não os coleta. Sem
    eles, proteína/gordura ainda saem do peso; a meta calórica fica em aberto,
    e é melhor não mostrar número do que mostrar um número inventado.
    """

    __tablename__ = "nutrition_target"
    __table_args__ = (
        CheckConstraint("sexo IS NULL OR sexo IN ('M','F')", name="ck_nutrition_target_sexo"),
        Index("ix_nutrition_target_user_id_plan", "user_id", "meal_plan_id"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    meal_plan_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("meal_plan.id", ondelete="CASCADE"), nullable=False
    )
    proteina_g_kg: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False)
    gordura_g_kg: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False)
    fibra_g_por_1000kcal: Mapped[float] = mapped_column(Numeric(4, 1), nullable=False)
    fator_atividade: Mapped[float] = mapped_column(Numeric(3, 2), nullable=False)
    #: 0.03 = superávit de 3% sobre a manutenção estimada.
    ajuste_calorico: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False)
    #: Preenchida quando o usuário já conhece a própria manutenção real;
    #: quando existe, dispensa a estimativa por fórmula.
    manutencao_kcal_manual: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sexo: Mapped[str | None] = mapped_column(String(1), nullable=True)
    idade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    altura_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Supplement(Base, SyncMixin):
    """Suplemento do plano. Global (do seed) ou do próprio usuário.

    Fora dos macros de propósito: creatina não é caloria nem proteína, e whey
    já entra como alimento na ``food_item``. O que se acompanha aqui é uso e
    constância, não contagem.
    """

    __tablename__ = "supplement"
    __table_args__ = (
        CheckConstraint(
            "(is_global AND user_id IS NULL) OR (NOT is_global AND user_id IS NOT NULL)",
            name="ck_supplement_global_xor_owned",
        ),
        Index("ix_supplement_user_id_nome", "user_id", "nome"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=True
    )
    is_global: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    como_usar: Mapped[str | None] = mapped_column(Text, nullable=True)
    faixa: Mapped[str | None] = mapped_column(Text, nullable=True)
    horario: Mapped[str | None] = mapped_column(String(120), nullable=True)
    observar: Mapped[str | None] = mapped_column(Text, nullable=True)
    fonte: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class NutritionInsight(Base, SyncMixin):
    """Observação gerada por IA sobre a alimentação do usuário.

    Escrita só pelo servidor (endpoint dedicado ou worker), nunca pelo
    ``/sync/batch``. O ``unique (user_id, tipo, periodo_ref)`` garante um
    insight por período — reprocessar faz ``ON CONFLICT DO UPDATE``.
    """

    __tablename__ = "nutrition_insight"
    __table_args__ = (
        CheckConstraint("tipo IN ('semanal','diario')", name="ck_nutrition_insight_tipo"),
        UniqueConstraint(
            "user_id", "tipo", "periodo_ref", name="uq_nutrition_insight_periodo"
        ),
        Index("ix_nutrition_insight_user_id_tipo", "user_id", "tipo"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(8), nullable=False)
    periodo_ref: Mapped[date] = mapped_column(Date, nullable=False)
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    modelo: Mapped[str] = mapped_column(String(80), nullable=False)
    gerado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
