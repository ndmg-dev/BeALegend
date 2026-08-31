"""Provider determinístico para testes e para rodar a feature sem OpenAI.

Não toca a rede. Produz um texto estável a partir do resumo — o suficiente
para exercitar upsert, gating e renderização ponta a ponta.
"""

from app.services.insights.provider import InsightRequest, InsightResult

MODELO = "fake-insight-1"


class FakeProvider:
    async def gerar(self, req: InsightRequest) -> InsightResult:
        d = req.dados
        if req.tipo == "diario":
            texto = (
                f"Você registrou {d.get('refeicoes_total', 0)} refeições em "
                f"{req.periodo_ref:%d/%m} e bebeu {d.get('agua_ml', 0)} ml de água. "
                "Mantenha o registro em dia para eu conseguir enxergar padrões."
            )
        else:
            texto = (
                f"Na semana de {req.periodo_ref:%d/%m} foram "
                f"{d.get('refeicoes_total', 0)} refeições registradas, "
                f"{d.get('aderencia_percentual', 0)}% dentro do plano. "
                "Água média diária e treinos parecem alinhados; siga assim."
            )
        return InsightResult(texto=texto, modelo=MODELO)
