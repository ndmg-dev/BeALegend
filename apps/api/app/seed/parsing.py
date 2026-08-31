"""Parser específico da planilha de treino — funções puras, sem I/O.

Rodado uma vez por `scripts/seed_training_plan.py`. Não é um importador
genérico de planilha: os nomes de coluna e a forma das faixas ("2–3 séries",
"8–12 reps", "8–12 / perna") são desta planilha, não de um formato aberto.

Faixas são numéricas, não texto — texto perde a capacidade de calcular
progressão e volume.
"""

import re
from dataclasses import dataclass, field

# A planilha usa en-dash (–) e por vezes hífen comum; aceita os dois.
_FAIXA_RE = re.compile(r"^\s*(\d+)\s*[-–]\s*(\d+)\s*$")
_UNICO_RE = re.compile(r"^\s*(\d+)\s*$")
_SEM_VALOR = {"-", "–", "—", "", "n/a", "na"}


@dataclass(frozen=True)
class Faixa:
    minimo: int | None
    maximo: int | None
    unilateral: bool = False
    #: 'reps' para a maioria; 'segundos' para isométricos (prancha, farmer hold).
    unidade: str = "reps"


def parse_faixa(texto: str | None) -> Faixa:
    """ "2–3", "8–12 / perna", "30–60 s", "–" (sem RIR/descanso aplicável)."""
    if texto is None:
        return Faixa(None, None)

    bruto = texto.strip().lower()
    if bruto in _SEM_VALOR:
        return Faixa(None, None)

    unilateral = "/" in bruto and any(p in bruto for p in ("perna", "lado", "braço", "brac"))
    unidade = "segundos" if re.search(r"\bs\b", bruto) else "reps"

    numeros_parte = bruto.split("/")[0].strip()
    numeros_parte = re.sub(r"\bs\b", "", numeros_parte).strip()

    faixa = _FAIXA_RE.match(numeros_parte)
    if faixa:
        return Faixa(int(faixa.group(1)), int(faixa.group(2)), unilateral, unidade)

    unico = _UNICO_RE.match(numeros_parte)
    if unico:
        valor = int(unico.group(1))
        return Faixa(valor, valor, unilateral, unidade)

    return Faixa(None, None, unilateral, unidade)


def parse_descanso_segundos(texto: str | None) -> int | None:
    """ "90 s" -> 90; "60–90 s" -> ponto médio, 75. Um alvo único para o timer."""
    if texto is None:
        return None
    bruto = texto.strip().lower()
    if bruto in _SEM_VALOR:
        return None

    numeros = re.sub(r"\bs\b", "", bruto).strip()
    faixa = _FAIXA_RE.match(numeros)
    if faixa:
        a, b = int(faixa.group(1)), int(faixa.group(2))
        return round((a + b) / 2)

    unico = _UNICO_RE.match(numeros)
    return int(unico.group(1)) if unico else None


DIAS_PT_PARA_SLUG = {
    "segunda": "segunda",
    "terça": "terca",
    "quarta": "quarta",
    "quinta": "quinta",
    "sexta": "sexta",
    "sábado": "sabado",
    "domingo": "domingo",
}


def slug_dia_semana(nome_pt: str) -> str:
    chave = nome_pt.strip().lower()
    if chave not in DIAS_PT_PARA_SLUG:
        raise ValueError(f"Dia da semana desconhecido na planilha: {nome_pt!r}")
    return DIAS_PT_PARA_SLUG[chave]


def tipo_do_dia(sessao: str) -> str:
    """'Força A' -> forca; 'Cardio leve' / 'Cardio + antebraço' -> cardio; etc."""
    nome = sessao.strip().lower()
    if nome.startswith("força"):
        return "forca"
    if nome == "hiit":
        return "hiit"
    if nome == "descanso":
        return "descanso"
    if nome.startswith("cardio"):
        return "cardio"
    raise ValueError(f"Tipo de sessão desconhecido na planilha: {sessao!r}")


@dataclass(frozen=True)
class ExercicioPlanilha:
    treino: str
    nome: str
    series: Faixa
    reps: Faixa
    rir: Faixa
    descanso_seg: int | None
    how_to: str | None = None
    common_mistakes: str | None = None
    grupo_muscular: tuple[str, ...] = field(default_factory=tuple)


def unificar_exercicios(
    linhas_forca: list[dict], linhas_detalhadas: list[dict]
) -> list[ExercicioPlanilha]:
    """As abas 'Treinos de força' e 'Exercícios detalhados' são a mesma
    entidade em granularidades diferentes: uma tem séries/reps/RIR/descanso
    por treino, a outra tem execução e erros por exercício. Unifica por nome —
    não há dois exercícios com o mesmo nome em treinos diferentes nesta
    planilha, então o nome sozinho já identifica.
    """
    detalhes_por_nome = {linha["Exercício"].strip(): linha for linha in linhas_detalhadas}

    exercicios: list[ExercicioPlanilha] = []
    for linha in linhas_forca:
        nome = linha["Exercício"].strip()
        detalhe = detalhes_por_nome.get(nome, {})

        grupo_texto = detalhe.get("Foco principal") or ""
        grupo = tuple(g.strip() for g in grupo_texto.split(",") if g.strip())

        exercicios.append(
            ExercicioPlanilha(
                treino=linha["Treino"].strip(),
                nome=nome,
                series=parse_faixa(linha.get("Séries")),
                reps=parse_faixa(linha.get("Reps")),
                rir=parse_faixa(linha.get("RIR alvo")),
                descanso_seg=parse_descanso_segundos(linha.get("Descanso")),
                how_to=(detalhe.get("Como executar") or "").strip() or None,
                common_mistakes=(detalhe.get("Erros a evitar") or "").strip() or None,
                grupo_muscular=grupo,
            )
        )
    return exercicios


@dataclass(frozen=True)
class ProtocoloCardio:
    nome: str
    aquecimento: str | None
    parte_principal: str | None
    recuperacao: str | None
    desaquecimento: str | None
    rpe_alvo: str | None
    observacao: str | None


def parse_protocolos_cardio(linhas: list[dict]) -> list[ProtocoloCardio]:
    def limpo(valor: object) -> str | None:
        texto = str(valor).strip() if valor is not None else ""
        return texto if texto and texto not in _SEM_VALOR else None

    return [
        ProtocoloCardio(
            nome=str(linha["Sessão"]).strip(),
            aquecimento=limpo(linha.get("Aquecimento")),
            parte_principal=limpo(linha.get("Parte principal")),
            recuperacao=limpo(linha.get("Recuperação")),
            desaquecimento=limpo(linha.get("Desaquecimento")),
            rpe_alvo=limpo(linha.get("Esforço percebido")),
            observacao=limpo(linha.get("Observação")),
        )
        for linha in linhas
    ]


#: Mapa fixo desta planilha: qual protocolo de cardio cai em qual dia.
#: "não construa importador genérico" — isto é conhecimento específico do
#: plano, não uma regra geral.
PROTOCOLO_POR_DIA = {
    "terca": "Cardio leve",
    "quinta": "HIIT iniciante/intermediário",
    "sabado": "Cardio contínuo longo",
}

#: O sábado também tem um bloco de força (antebraço/braquial) após o cardio,
#: registrado na planilha sob o "treino" chamado "Sábado".
TREINO_FORCA_DO_SABADO = "Sábado"
