"""Parser da planilha de dieta — funções puras, sem I/O.

Mesma natureza do ``parsing.py`` do treino: preso ao formato desta planilha
(abas Painel, Base alimentos, Plano diário, Suplementação, Guia), não é um
importador genérico.

Uma diferença importante em relação à planilha de treino: **esta vem em
branco**. Peso, altura, idade e as quantidades de cada refeição são campos que
o usuário preenche, e as metas do Painel são fórmulas que só existem depois
disso. O que tem conteúdo real e estável é a base de alimentos, quais
alimentos compõem cada refeição, os suplementos e os *parâmetros* da meta
(g/kg, fator de atividade, ajuste calórico). É isso que este parser extrai —
os números que dependem do usuário ficam de fora em vez de virar chute.
"""

from dataclasses import dataclass

#: Alimentos cujo valor genérico vale menos que o rótulo da marca real. A
#: planilha diz isso em prosa na coluna "Referência prática"; aqui vira flag.
_MARCADORES_ROTULO = ("rótulo", "rotulo", "marca")


@dataclass(frozen=True)
class AlimentoPlanilha:
    nome: str
    kcal: float
    proteina_g: float
    carboidrato_g: float
    gordura_g: float
    fibra_g: float
    referencia_pratica: str | None
    fonte: str | None
    conferir_rotulo: bool


@dataclass(frozen=True)
class RefeicaoPlanilha:
    nome: str
    ordem: int
    #: Nomes de alimento, na ordem em que aparecem na planilha. A quantidade
    #: fica de fora porque a planilha não a fixa — é o que o usuário ajusta
    #: para fechar o dia contra a meta.
    alimentos: tuple[str, ...]


@dataclass(frozen=True)
class SuplementoPlanilha:
    nome: str
    como_usar: str | None
    faixa: str | None
    horario: str | None
    observar: str | None
    fonte: str | None
    status: str | None
    ordem: int


@dataclass(frozen=True)
class MetaPlanilha:
    proteina_g_kg: float
    gordura_g_kg: float
    fibra_g_por_1000kcal: float
    fator_atividade: float
    ajuste_calorico: float
    manutencao_kcal_manual: int | None
    sexo: str | None
    idade: int | None
    altura_cm: int | None


def _texto(valor: object) -> str | None:
    if valor is None:
        return None
    limpo = str(valor).strip()
    return limpo or None


def _numero(valor: object) -> float | None:
    if valor is None or isinstance(valor, bool):
        return None
    if isinstance(valor, int | float):
        return float(valor)
    bruto = str(valor).strip().replace(",", ".")
    try:
        return float(bruto)
    except ValueError:
        return None


def parse_alimentos(linhas: list[dict]) -> list[AlimentoPlanilha]:
    """Cada linha da aba 'Base alimentos'. Linhas sem kcal são nota de rodapé,
    não alimento — a aba termina com um parágrafo de observação."""
    alimentos: list[AlimentoPlanilha] = []
    for linha in linhas:
        nome = _texto(linha.get("Alimento"))
        kcal = _numero(linha.get("kcal"))
        if not nome or kcal is None:
            continue

        referencia = _texto(linha.get("Referência prática"))
        alvo = f"{nome} {referencia or ''}".lower()
        alimentos.append(
            AlimentoPlanilha(
                nome=nome,
                kcal=kcal,
                proteina_g=_numero(linha.get("Proteína (g)")) or 0.0,
                carboidrato_g=_numero(linha.get("Carboidrato (g)")) or 0.0,
                gordura_g=_numero(linha.get("Gordura (g)")) or 0.0,
                fibra_g=_numero(linha.get("Fibra (g)")) or 0.0,
                referencia_pratica=referencia,
                fonte=_texto(linha.get("Fonte")),
                conferir_rotulo=any(m in alvo for m in _MARCADORES_ROTULO),
            )
        )
    return alimentos


#: Linhas de fechamento da aba 'Plano diário' — não são refeição nem alimento.
_NAO_E_REFEICAO = ("subtotal", "total do dia", "meta do painel", "diferença", "estratégia")


def parse_refeicoes(linhas: list[dict]) -> list[RefeicaoPlanilha]:
    """A aba 'Plano diário' usa a coluna 'Refeição' só na primeira linha de
    cada bloco; as seguintes vêm vazias e pertencem à refeição anterior.
    Subtotais e o rodapé de metas são descartados."""
    refeicoes: list[RefeicaoPlanilha] = []
    atual: str | None = None
    itens: dict[str, list[str]] = {}

    for linha in linhas:
        rotulo = _texto(linha.get("Refeição"))
        alimento = _texto(linha.get("Alimento"))

        if rotulo and any(marca in rotulo.lower() for marca in _NAO_E_REFEICAO):
            atual = None
            continue
        if rotulo:
            atual = rotulo
            itens.setdefault(atual, [])
        if atual and alimento:
            itens[atual].append(alimento)

    for ordem, (nome, alimentos) in enumerate(itens.items()):
        refeicoes.append(RefeicaoPlanilha(nome=nome, ordem=ordem, alimentos=tuple(alimentos)))
    return refeicoes


def parse_suplementos(linhas: list[dict]) -> list[SuplementoPlanilha]:
    """Aba 'Suplementação'. A aba termina com um bloco de texto corrido sobre
    dieta sem frutas/verduras — sem 'Como usar', então não é suplemento."""
    suplementos: list[SuplementoPlanilha] = []
    for linha in linhas:
        nome = _texto(linha.get("Item"))
        como_usar = _texto(linha.get("Como usar na planilha"))
        if not nome or not como_usar:
            continue
        suplementos.append(
            SuplementoPlanilha(
                nome=nome,
                como_usar=como_usar,
                faixa=_texto(linha.get("Faixa / regra prática")),
                horario=_texto(linha.get("Horário")),
                observar=_texto(linha.get("O que observar")),
                fonte=_texto(linha.get("Fonte")),
                status=_texto(linha.get("Status")),
                ordem=len(suplementos),
            )
        )
    return suplementos


#: Rótulo na coluna A do Painel -> campo da meta. O Painel é um formulário em
#: duas colunas, não uma tabela: procura-se pelo rótulo, lê-se o vizinho.
_CAMPOS_PAINEL = {
    "proteína alvo (g/kg)": "proteina_g_kg",
    "gordura alvo (g/kg)": "gordura_g_kg",
    "fibra alvo (g/1000 kcal)": "fibra_g_por_1000kcal",
    "fator de atividade": "fator_atividade",
    "ajuste calórico": "ajuste_calorico",
    "manutenção manual (kcal, opcional)": "manutencao_kcal_manual",
    "idade (anos)": "idade",
    "altura (cm)": "altura_cm",
    "sexo (para estimar metabolismo)": "sexo",
}

#: Se a planilha vier sem o parâmetro, estes são os valores que ela própria
#: traz como padrão. Só entram quando a célula está vazia.
_PADRAO_META = {
    "proteina_g_kg": 1.8,
    "gordura_g_kg": 0.8,
    "fibra_g_por_1000kcal": 14.0,
    "fator_atividade": 1.55,
    "ajuste_calorico": 0.03,
}


def parse_meta(linhas_painel: list[tuple]) -> MetaPlanilha:
    """Lê o Painel como pares rótulo→valor. As linhas chegam como tuplas
    cruas porque o Painel não tem cabeçalho de tabela."""
    valores: dict[str, object] = {}
    for linha in linhas_painel:
        rotulo = _texto(linha[0] if linha else None)
        if not rotulo:
            continue
        campo = _CAMPOS_PAINEL.get(rotulo.lower())
        if campo is None:
            continue
        # O Painel são dois formulários lado a lado: "DADOS E CONTROLES" nas
        # colunas A/B e "METAS CALCULADAS" a partir da E. O valor de um rótulo
        # da esquerda é o vizinho imediato — varrer a linha inteira acabaria
        # lendo o rótulo do bloco da direita como se fosse o valor.
        valores[campo] = next((c for c in linha[1:4] if c is not None), None)

    sexo = _texto(valores.get("sexo"))
    if sexo:
        sexo = sexo.strip().upper()[:1]
        if sexo not in ("M", "F"):
            sexo = None

    def num(campo: str) -> float:
        valor = _numero(valores.get(campo))
        return valor if valor is not None else _PADRAO_META[campo]

    def inteiro(campo: str) -> int | None:
        valor = _numero(valores.get(campo))
        return int(valor) if valor is not None else None

    return MetaPlanilha(
        proteina_g_kg=num("proteina_g_kg"),
        gordura_g_kg=num("gordura_g_kg"),
        fibra_g_por_1000kcal=num("fibra_g_por_1000kcal"),
        fator_atividade=num("fator_atividade"),
        ajuste_calorico=num("ajuste_calorico"),
        manutencao_kcal_manual=inteiro("manutencao_kcal_manual"),
        sexo=sexo,
        idade=inteiro("idade"),
        altura_cm=inteiro("altura_cm"),
    )
