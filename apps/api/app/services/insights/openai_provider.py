"""Provider real: endpoint /chat/completions da OpenAI via httpx.

Sem o SDK da OpenAI de propósito — a superfície é uma request e um parse, e
assim o mock nos testes é um ``httpx.MockTransport``. Toda falha (sem chave,
status != 200, resposta estranha, timeout) vira ``ProviderIndisponivel``, que
o ``service`` traduz em "sem insight" (204) sem quebrar a tela.
"""

import json
import logging

import httpx

from app.config import Settings
from app.services.insights.provider import (
    InsightRequest,
    InsightResult,
    ProviderIndisponivel,
)

log = logging.getLogger("bealegend.insights.openai")

_SYSTEM_PROMPT = (
    "Você é um assistente de nutrição. Recebe um resumo estruturado (JSON) dos "
    "registros alimentares de uma pessoa — qualitativos, sem calorias. Responda "
    "em português, no máximo 3 frases curtas: uma observação de padrão, um ponto "
    "de atenção e uma sugestão acionável. Não invente dados que não estão no "
    "resumo. Não dê conselho médico. Não mencione que você é uma IA."
)

_MAX_TOKENS = {"semanal": 200, "diario": 120}


class OpenAIProvider:
    def __init__(self, settings: Settings, *, transport: httpx.BaseTransport | None = None) -> None:
        self._api_key = settings.openai_api_key
        self._model = settings.openai_model
        self._base_url = settings.openai_base_url.rstrip("/")
        self._timeout = settings.openai_timeout_seconds
        self._transport = transport

    async def gerar(self, req: InsightRequest) -> InsightResult:
        if not self._api_key:
            raise ProviderIndisponivel("openai_api_key ausente")

        payload = {
            "model": self._model,
            "temperature": 0.3,
            "max_tokens": _MAX_TOKENS[req.tipo],
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(req.dados, ensure_ascii=False)},
            ],
        }

        try:
            async with httpx.AsyncClient(
                timeout=self._timeout, transport=self._transport
            ) as client:
                resp = await client.post(
                    f"{self._base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise ProviderIndisponivel(f"erro de rede: {exc}") from exc

        if resp.status_code != 200:
            raise ProviderIndisponivel(f"openai respondeu {resp.status_code}")

        try:
            data = resp.json()
            texto = data["choices"][0]["message"]["content"].strip()
        except (json.JSONDecodeError, KeyError, IndexError, TypeError, AttributeError) as exc:
            raise ProviderIndisponivel("resposta inesperada da openai") from exc

        if not texto:
            raise ProviderIndisponivel("resposta vazia da openai")

        return InsightResult(texto=texto, modelo=str(data.get("model") or self._model))
