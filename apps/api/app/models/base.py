from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, FetchedValue, MetaData, func, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class SyncMixin(TimestampMixin):
    """Tudo que o cliente sincroniza carrega estes dois campos.

    ``row_version`` vem de uma sequencia global e e o cursor do delta — um
    trigger a incrementa em todo UPDATE. ``deleted_at`` faz o delete ser
    logico: um DELETE de verdade sumiria do delta e a linha ressuscitaria no
    proximo push do outro dispositivo.
    """

    # server_onupdate=FetchedValue(): quem escreve estes dois campos no UPDATE
    # e o trigger `bump_row_version`, no banco. Sem declarar isso, o SQLAlchemy
    # devolveria o valor velho que tem em memoria — e o cursor de sync do
    # cliente pararia de avancar, em silencio.
    row_version: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        server_default=text("nextval('sync_version_seq')"),
        server_onupdate=FetchedValue(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


__all__ = ["Base", "SyncMixin", "TimestampMixin", "UUID"]
