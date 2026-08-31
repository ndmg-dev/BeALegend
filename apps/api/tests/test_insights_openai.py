"""Fase 2 — OpenAIProvider. Rede mockada com httpx.MockTransport (sem respx)."""

import json
from datetime import date
from types import SimpleNamespace

import httpx
import pytest

from app.config import get_settings
from app.services.insights import (
    FakeProvider,
    InsightRequest,
    OpenAIProvider,
    ProviderIndisponivel,
    build_provider,
    get_insight_provider,
)
from tests.conftest import auth, register
from tests.test_nutrition_insights import opt_in, registrar_refeicao


def _settings(**over):
    base = {
        "openai_api_key": "test-key",
        "openai_model": "gpt-4o-mini",
        "openai_base_url": "https://api.openai.com/v1",
        "openai_timeout_seconds": 5,
    }
    base.update(over)
    return SimpleNamespace(**base)


def _resposta_ok(content: str, *, model: str = "gpt-4o-mini-2024") -> httpx.Response:
    return httpx.Response(
        200, json={"model": model, "choices": [{"message": {"content": content}}]}
    )


REQ = InsightRequest("diario", date(2026, 8, 31), {"refeicoes_total": 2, "agua_ml": 900})


async def test_monta_request_e_parseia_resposta():
    capturado = {}

    def handler(request: httpx.Request) -> httpx.Response:
        capturado["url"] = str(request.url)
        capturado["auth"] = request.headers.get("authorization")
        capturado["body"] = json.loads(request.content)
        return _resposta_ok("  Coma mais verduras no jantar.  ")

    provider = OpenAIProvider(_settings(), transport=httpx.MockTransport(handler))
    res = await provider.gerar(REQ)

    assert res.texto == "Coma mais verduras no jantar."
    assert res.modelo == "gpt-4o-mini-2024"
    assert capturado["url"] == "https://api.openai.com/v1/chat/completions"
    assert capturado["auth"] == "Bearer test-key"
    body = capturado["body"]
    assert body["model"] == "gpt-4o-mini"
    assert body["max_tokens"] == 120  # diário
    assert body["messages"][0]["role"] == "system"
    assert json.loads(body["messages"][1]["content"]) == REQ.dados


async def test_max_tokens_maior_no_semanal():
    capturado = {}

    def handler(request: httpx.Request) -> httpx.Response:
        capturado["body"] = json.loads(request.content)
        return _resposta_ok("ok")

    provider = OpenAIProvider(_settings(), transport=httpx.MockTransport(handler))
    await provider.gerar(InsightRequest("semanal", date(2026, 8, 25), {"refeicoes_total": 10}))
    assert capturado["body"]["max_tokens"] == 200


async def test_sem_chave_indisponivel():
    provider = OpenAIProvider(_settings(openai_api_key=""))
    with pytest.raises(ProviderIndisponivel):
        await provider.gerar(REQ)


async def test_status_nao_200_indisponivel():
    provider = OpenAIProvider(
        _settings(), transport=httpx.MockTransport(lambda _: httpx.Response(500, text="boom"))
    )
    with pytest.raises(ProviderIndisponivel):
        await provider.gerar(REQ)


async def test_erro_de_rede_indisponivel():
    def handler(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("sem rota")

    provider = OpenAIProvider(_settings(), transport=httpx.MockTransport(handler))
    with pytest.raises(ProviderIndisponivel):
        await provider.gerar(REQ)


async def test_resposta_estranha_indisponivel():
    provider = OpenAIProvider(
        _settings(), transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"x": 1}))
    )
    with pytest.raises(ProviderIndisponivel):
        await provider.gerar(REQ)


async def test_resposta_vazia_indisponivel():
    provider = OpenAIProvider(
        _settings(), transport=httpx.MockTransport(lambda _: _resposta_ok("   "))
    )
    with pytest.raises(ProviderIndisponivel):
        await provider.gerar(REQ)


def test_build_provider_escolhe_pelo_api_key(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "openai_api_key", "k")
    assert isinstance(build_provider(), OpenAIProvider)
    monkeypatch.setattr(s, "openai_api_key", "")
    assert isinstance(build_provider(), FakeProvider)


async def test_endpoint_usa_o_provider_injetado(client, monkeypatch):
    from app.main import app

    monkeypatch.setattr(get_settings(), "nutrition_insights_enabled", True)

    def handler(_: httpx.Request) -> httpx.Response:
        return _resposta_ok("Padrão bom, hidrate mais, mantenha o registro.")

    provider = OpenAIProvider(_settings(), transport=httpx.MockTransport(handler))
    app.dependency_overrides[get_insight_provider] = lambda: provider
    try:
        _, token = await register(client)
        await opt_in(client, token)
        await registrar_refeicao(client, token, str(date.today()))

        resp = await client.get("/nutrition/insight/today", headers=auth(token))
        assert resp.status_code == 200, resp.text
        assert resp.json()["texto"] == "Padrão bom, hidrate mais, mantenha o registro."
    finally:
        app.dependency_overrides.pop(get_insight_provider, None)
