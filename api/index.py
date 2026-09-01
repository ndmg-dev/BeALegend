"""Ponto de entrada da API na Vercel (Python Serverless Function).

O `apps/api/app` foi escrito sem o prefixo `/api` nas rotas (o proxy tirava
antes). Na Vercel o rewrite manda `/api/*` inteiro para cá, então montamos o
app real sob `/api` e o Starlette tira o prefixo antes de rotear.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps" / "api"))

from fastapi import FastAPI  # noqa: E402

from app.main import app as _api  # noqa: E402

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api", _api)
