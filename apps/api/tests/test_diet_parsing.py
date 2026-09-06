"""Testes puros do parser da planilha de dieta — sem banco, sem I/O."""

from app.seed.diet_parsing import (
    parse_alimentos,
    parse_meta,
    parse_refeicoes,
    parse_suplementos,
)


class TestParseAlimentos:
    def test_le_os_macros_da_linha(self):
        alimentos = parse_alimentos(
            [
                {
                    "Alimento": "Peito de frango grelhado",
                    "kcal": 159,
                    "Proteína (g)": 32,
                    "Carboidrato (g)": 0,
                    "Gordura (g)": 2.5,
                    "Fibra (g)": 0,
                    "Referência prática": "100 g pronto",
                    "Fonte": "https://nepa.unicamp.br/",
                }
            ]
        )
        assert len(alimentos) == 1
        frango = alimentos[0]
        assert frango.nome == "Peito de frango grelhado"
        assert (frango.kcal, frango.proteina_g, frango.gordura_g) == (159.0, 32.0, 2.5)
        assert frango.conferir_rotulo is False

    def test_marca_industrializado_para_conferir_rotulo(self):
        alimentos = parse_alimentos(
            [
                {
                    "Alimento": "Whey protein (rótulo)",
                    "kcal": 400,
                    "Referência prática": "valores genéricos; EDITE pelo seu rótulo",
                },
                {
                    "Alimento": "Granola sem fruta",
                    "kcal": 430,
                    "Referência prática": "conferir rótulo",
                },
            ]
        )
        assert [a.conferir_rotulo for a in alimentos] == [True, True]

    def test_linha_de_nota_sem_kcal_nao_e_alimento(self):
        # A aba termina com um parágrafo de observação na coluna do alimento.
        alimentos = parse_alimentos(
            [
                {"Alimento": "Arroz branco cozido", "kcal": 128},
                {"Alimento": "Observação: a base é um ponto de partida.", "kcal": None},
            ]
        )
        assert [a.nome for a in alimentos] == ["Arroz branco cozido"]

    def test_macro_ausente_vira_zero_e_nao_none(self):
        alimentos = parse_alimentos([{"Alimento": "Tapioca", "kcal": 230}])
        assert alimentos[0].proteina_g == 0.0
        assert alimentos[0].fibra_g == 0.0


class TestParseRefeicoes:
    #: A coluna "Refeição" só é preenchida na primeira linha de cada bloco.
    LINHAS = [
        {"Refeição": "Café da manhã", "Alimento": "Ovo inteiro"},
        {"Refeição": None, "Alimento": "Pão integral"},
        {"Refeição": "CAFÉ DA MANHÃ — subtotal", "Alimento": None},
        {"Refeição": "Almoço", "Alimento": "Arroz branco cozido"},
        {"Refeição": None, "Alimento": "Peito de frango grelhado"},
        {"Refeição": "ALMOÇO — subtotal", "Alimento": None},
        {"Refeição": "TOTAL DO DIA", "Alimento": None},
        {"Refeição": "META DO PAINEL", "Alimento": None},
    ]

    def test_agrupa_alimentos_sob_a_refeicao_da_primeira_linha(self):
        refeicoes = parse_refeicoes(self.LINHAS)
        assert [r.nome for r in refeicoes] == ["Café da manhã", "Almoço"]
        assert refeicoes[0].alimentos == ("Ovo inteiro", "Pão integral")
        assert refeicoes[1].alimentos == ("Arroz branco cozido", "Peito de frango grelhado")

    def test_preserva_a_ordem_da_planilha(self):
        assert [r.ordem for r in parse_refeicoes(self.LINHAS)] == [0, 1]

    def test_subtotal_encerra_o_bloco_em_vez_de_virar_refeicao(self):
        # Sem isso, uma linha de alimento depois do subtotal seria atribuída à
        # refeição anterior — ou o próprio subtotal viraria uma "refeição".
        nomes = [r.nome for r in parse_refeicoes(self.LINHAS)]
        assert not any("subtotal" in nome.lower() for nome in nomes)
        assert "TOTAL DO DIA" not in nomes


class TestParseSuplementos:
    def test_le_as_colunas_do_suplemento(self):
        suplementos = parse_suplementos(
            [
                {
                    "Item": "Creatina monohidratada",
                    "Como usar na planilha": "Não entra nos macros.",
                    "Faixa / regra prática": "3–5 g/dia",
                    "Horário": "Qualquer horário",
                    "O que observar": "Use diariamente.",
                    "Status": "Em uso",
                }
            ]
        )
        assert len(suplementos) == 1
        assert suplementos[0].nome == "Creatina monohidratada"
        assert suplementos[0].faixa == "3–5 g/dia"
        assert suplementos[0].ordem == 0

    def test_bloco_de_texto_sem_como_usar_nao_e_suplemento(self):
        # A aba termina com um aviso em prosa sobre dieta sem frutas/verduras.
        suplementos = parse_suplementos(
            [
                {"Item": "Whey protein", "Como usar na planilha": "Cadastre os macros."},
                {"Item": "PONTO DE ATENÇÃO: DIETA SEM FRUTAS", "Como usar na planilha": None},
            ]
        )
        assert [s.nome for s in suplementos] == ["Whey protein"]


class TestParseMeta:
    def test_le_os_parametros_do_painel(self):
        meta = parse_meta(
            [
                ("Fator de atividade", 1.55, None, None, "Metabolismo basal estimado", None),
                ("Proteína alvo (g/kg)", 1.8, None, None, None, None),
                ("Gordura alvo (g/kg)", 0.8, None, None, None, None),
                ("Fibra alvo (g/1000 kcal)", 14, None, None, None, None),
                ("Ajuste calórico", 0.03, None, None, None, None),
            ]
        )
        assert meta.fator_atividade == 1.55
        assert meta.proteina_g_kg == 1.8
        assert meta.ajuste_calorico == 0.03

    def test_nao_le_o_rotulo_da_coluna_vizinha_como_valor(self):
        # O Painel são dois formulários lado a lado: "DADOS E CONTROLES" em
        # A/B e "METAS CALCULADAS" a partir da E. Varrer a linha inteira faria
        # "Metabolismo basal estimado" virar o valor de "Sexo".
        meta = parse_meta(
            [("Sexo (para estimar metabolismo)", None, None, None, "Metabolismo basal estimado")]
        )
        assert meta.sexo is None

    def test_campo_em_branco_cai_no_padrao_da_planilha(self):
        meta = parse_meta([("Idade (anos)", None, None, None, None)])
        assert meta.idade is None
        # Os parâmetros têm padrão declarado; os dados pessoais, não.
        assert meta.proteina_g_kg == 1.8
        assert meta.fator_atividade == 1.55

    def test_sexo_invalido_e_descartado_em_vez_de_virar_letra_solta(self):
        assert parse_meta([("Sexo (para estimar metabolismo)", "Prefiro não dizer")]).sexo is None
        assert parse_meta([("Sexo (para estimar metabolismo)", "Masculino")]).sexo == "M"

    def test_manutencao_manual_quando_preenchida(self):
        meta = parse_meta([("Manutenção manual (kcal, opcional)", 2500)])
        assert meta.manutencao_kcal_manual == 2500
