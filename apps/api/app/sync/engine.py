"""Aplicacao das operacoes da outbox e montagem do delta.

Duas garantias moram aqui:

1. **Idempotencia.** Cada operacao carrega uma chave. A primeira aplicacao
   guarda o resultado; qualquer reenvio da mesma chave devolve o resultado
   guardado sem tocar no dado. Um retry apos timeout nao duplica nada.
2. **Last-write-wins por campo.** ``update`` carrega apenas os campos que
   aquele dispositivo mudou. Dois dispositivos que editam campos diferentes
   convivem; quando colidem no mesmo campo, quem chega depois vence e o
   ``updated_at`` do servidor registra a ordem.
"""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.idempotency import IdempotencyRecord
from app.schemas.sync import Problem, SyncDelta, SyncOperation, SyncResult
from app.sync.registry import REGISTRY, OperacaoInvalida, SyncEntity, validar_operacao

#: Teto por resposta de delta. Sem ele, o primeiro sync de uma conta antiga
#: tenta carregar a base inteira num payload so.
DELTA_LIMIT = 500


def _serializar(entidade: SyncEntity, linha: Any) -> dict[str, Any]:
    colunas = entidade.model.__table__.columns.keys()
    saida: dict[str, Any] = {}
    for coluna in colunas:
        valor = getattr(linha, coluna)
        saida[coluna] = str(valor) if isinstance(valor, UUID) else valor
    return saida


async def _resultado_guardado(
    session: AsyncSession, user_id: UUID, chave: str
) -> dict[str, Any] | None:
    registro = await session.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.user_id == user_id, IdempotencyRecord.chave == chave
        )
    )
    return registro.resultado if registro else None


async def _guardar_resultado(
    session: AsyncSession, user_id: UUID, op: SyncOperation, resultado: dict[str, Any]
) -> None:
    # ON CONFLICT DO NOTHING: duas requisicoes concorrentes com a mesma chave
    # podem chegar juntas; a segunda nao pode explodir.
    await session.execute(
        pg_insert(IdempotencyRecord)
        .values(
            user_id=user_id,
            chave=op.idempotency_key,
            entidade=op.entidade,
            operacao=op.operacao,
            resultado=resultado,
        )
        .on_conflict_do_nothing(index_elements=["user_id", "chave"])
    )


async def _validar_referencia(
    session: AsyncSession, entidade: SyncEntity, validado: Any
) -> str | None:
    """Confere que a linha referenciada existe e pertence ao usuario atual.

    A conexao ja esta com o contexto de RLS do usuario ligado (ver
    ``app/db.py``), entao um SELECT simples e suficiente: a policy filtra por
    si so. Sem isto, um set_log poderia apontar para o session_id de outro
    usuario adivinhado — nao vazaria dado (RLS ainda protege a leitura), mas
    criaria uma referencia orfa e inconsistente.
    """
    for campo, modelo_pai in entidade.referencias:
        valor = getattr(validado, campo, None)
        if valor is None:
            continue
        existe = await session.scalar(
            select(modelo_pai.id).where(modelo_pai.id == valor, modelo_pai.deleted_at.is_(None))
        )
        if existe is None:
            return f"'{campo}' nao aponta para um registro existente e visivel para voce."
    return None


def _rejeitar(op: SyncOperation, title: str, detail: str) -> SyncResult:
    return SyncResult(
        idempotency_key=op.idempotency_key,
        status="rejected",
        entidade=op.entidade,
        id=op.id,
        problem=Problem(title=title, detail=detail),
    )


async def aplicar_operacao(
    session: AsyncSession, user_id: UUID, op: SyncOperation
) -> SyncResult:
    guardado = await _resultado_guardado(session, user_id, op.idempotency_key)
    if guardado is not None:
        return SyncResult(**{**guardado, "status": "duplicate"})

    try:
        entidade = validar_operacao(op.entidade, op.operacao)
    except OperacaoInvalida as e:
        return _rejeitar(op, "Operacao nao permitida", str(e))

    model = entidade.model
    existente = await session.scalar(select(model).where(model.id == op.id))

    if op.operacao == "create":
        if existente is not None:
            # Mesmo id, chave de idempotencia diferente: o cliente reenviou
            # uma criacao ja aplicada (outbox reconstruida, por exemplo).
            # Tratar como sucesso e mais seguro do que criar um duplicado.
            resultado = SyncResult(
                idempotency_key=op.idempotency_key,
                status="applied",
                entidade=op.entidade,
                id=op.id,
                entity=_serializar(entidade, existente),
            )
        else:
            try:
                validado = entidade.schema_create.model_validate({**op.payload, "id": op.id})
            except ValidationError as e:
                return _rejeitar(op, "Payload invalido", e.errors()[0]["msg"])

            if entidade.referencias:
                erro = await _validar_referencia(session, entidade, validado)
                if erro is not None:
                    return _rejeitar(op, "Referencia invalida", erro)

            campos = validado.model_dump(exclude_none=True)
            campos.pop("id", None)
            linha = model(id=op.id, user_id=user_id, **campos)
            session.add(linha)
            await session.flush()
            await session.refresh(linha)
            resultado = SyncResult(
                idempotency_key=op.idempotency_key,
                status="applied",
                entidade=op.entidade,
                id=op.id,
                entity=_serializar(entidade, linha),
            )

    elif op.operacao == "update":
        if existente is None or existente.deleted_at is not None:
            return _rejeitar(
                op, "Registro inexistente", "A linha nao existe ou ja foi apagada."
            )
        if entidade.schema_patch is None:
            return _rejeitar(op, "Operacao nao permitida", "Entidade nao aceita update.")
        try:
            patch = entidade.schema_patch.model_validate(op.payload)
        except ValidationError as e:
            return _rejeitar(op, "Payload invalido", e.errors()[0]["msg"])

        if entidade.referencias:
            erro = await _validar_referencia(session, entidade, patch)
            if erro is not None:
                return _rejeitar(op, "Referencia invalida", erro)

        # exclude_unset: so os campos que o dispositivo realmente mexeu. E o
        # que faz o LWW ser por campo, e nao pela linha inteira.
        for campo, valor in patch.model_dump(exclude_unset=True).items():
            setattr(existente, campo, valor)
        await session.flush()
        # row_version e updated_at sao escritos pelo trigger; sem o refresh o
        # ORM devolveria os valores velhos que ainda tem em memoria.
        await session.refresh(existente)
        resultado = SyncResult(
            idempotency_key=op.idempotency_key,
            status="applied",
            entidade=op.entidade,
            id=op.id,
            entity=_serializar(entidade, existente),
        )

    else:  # delete
        if existente is None:
            return _rejeitar(op, "Registro inexistente", "A linha nao existe.")
        # Delete logico: some da UI mas continua no delta, senao o outro
        # dispositivo nunca fica sabendo e reenvia a linha de volta.
        existente.deleted_at = datetime.now(UTC)
        await session.flush()
        await session.refresh(existente)
        resultado = SyncResult(
            idempotency_key=op.idempotency_key,
            status="applied",
            entidade=op.entidade,
            id=op.id,
            entity=_serializar(entidade, existente),
        )

    await _guardar_resultado(session, user_id, op, resultado.model_dump(mode="json"))
    return resultado


async def cursor_atual(session: AsyncSession) -> int:
    """Maior ``row_version`` visivel para este usuario.

    Deliberadamente nao le ``last_value`` da sequencia: aquele numero e global
    e contaria a todo mundo o volume de escrita da instancia inteira. Aqui a
    RLS continua valendo.
    """
    maior = 0
    for entidade in REGISTRY.values():
        valor = await session.scalar(select(func.max(entidade.model.row_version)))
        maior = max(maior, valor or 0)
    return maior


async def montar_delta(session: AsyncSession, since: int) -> SyncDelta:
    changes: dict[str, list[dict[str, Any]]] = {}
    cursor = since
    has_more = False

    for nome, entidade in REGISTRY.items():
        model = entidade.model
        linhas = list(
            await session.scalars(
                select(model)
                .where(model.row_version > since)
                .order_by(model.row_version)
                .limit(DELTA_LIMIT + 1)
            )
        )
        if len(linhas) > DELTA_LIMIT:
            has_more = True
            linhas = linhas[:DELTA_LIMIT]

        if linhas:
            changes[nome] = [_serializar(entidade, linha) for linha in linhas]
            cursor = max(cursor, max(linha.row_version for linha in linhas))

    return SyncDelta(
        cursor=cursor,
        changes=changes,
        has_more=has_more,
        server_time=datetime.now(UTC),
    )


__all__ = ["DELTA_LIMIT", "aplicar_operacao", "cursor_atual", "montar_delta"]
