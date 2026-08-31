FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

# Sem toolchain de compilação: todas as dependências (asyncpg, argon2-cffi,
# cryptography, pydantic-core) têm wheel para python:3.12-slim, e o asyncpg
# não linka libpq. Isso corta ~85s e ~340MB de cada build da imagem — o que
# fazia o builder do Coolify estourar memória com os três builds em paralelo.
COPY apps/api/pyproject.toml ./pyproject.toml
COPY apps/api/app ./app
RUN pip install --upgrade pip && pip install .

COPY apps/api/alembic ./alembic
COPY apps/api/alembic.ini ./alembic.ini
COPY apps/api/scripts ./scripts

RUN useradd --uid 10001 --no-create-home appuser && chown -R appuser /srv
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
