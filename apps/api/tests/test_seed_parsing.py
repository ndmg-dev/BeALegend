"""Testes puros do parser da planilha — sem banco, sem I/O."""

from app.seed.parsing import (
    PROTOCOLO_POR_DIA,
    ProtocoloCardio,
    mapa_protocolo_por_dia,
    parse_descanso_segundos,
    parse_faixa,
    slug_dia_semana,
    tipo_do_dia,
    unificar_exercicios,
)


class TestParseFaixa:
    def test_faixa_simples(self):
        assert parse_faixa("8–12") == parse_faixa("8-12")
        f = parse_faixa("8–12")
        assert (f.minimo, f.maximo) == (8, 12)
        assert f.unilateral is False
        assert f.unidade == "reps"

    def test_valor_unico_vira_min_igual_max(self):
        f = parse_faixa("4")
        assert (f.minimo, f.maximo) == (4, 4)

    def test_faixa_por_perna_marca_unilateral(self):
        f = parse_faixa("8–12 / perna")
        assert (f.minimo, f.maximo) == (8, 12)
        assert f.unilateral is True

    def test_faixa_por_lado_marca_unilateral(self):
        f = parse_faixa("8–15 / lado")
        assert f.unilateral is True

    def test_isometrico_em_segundos(self):
        f = parse_faixa("30–60 s")
        assert (f.minimo, f.maximo) == (30, 60)
        assert f.unidade == "segundos"

    def test_travessao_sozinho_e_ausencia_de_valor(self):
        f = parse_faixa("–")
        assert (f.minimo, f.maximo) == (None, None)

    def test_none_e_ausencia_de_valor(self):
        assert parse_faixa(None) == parse_faixa("–")

    def test_faixa_de_series_com_variacao(self):
        f = parse_faixa("2–3")
        assert (f.minimo, f.maximo) == (2, 3)


class TestParseDescanso:
    def test_valor_unico(self):
        assert parse_descanso_segundos("90 s") == 90

    def test_faixa_vira_ponto_medio(self):
        assert parse_descanso_segundos("60–90 s") == 75

    def test_faixa_impar_arredonda(self):
        assert parse_descanso_segundos("45–90 s") in (67, 68)  # round(67.5)

    def test_sem_descanso_aplicavel(self):
        assert parse_descanso_segundos("–") is None
        assert parse_descanso_segundos(None) is None


class TestDiaSemana:
    def test_todos_os_sete_dias(self):
        pares = [
            ("Segunda", "segunda"),
            ("Terça", "terca"),
            ("Quarta", "quarta"),
            ("Quinta", "quinta"),
            ("Sexta", "sexta"),
            ("Sábado", "sabado"),
            ("Domingo", "domingo"),
        ]
        for nome, slug in pares:
            assert slug_dia_semana(nome) == slug

    def test_dia_desconhecido_falha_alto(self):
        import pytest

        with pytest.raises(ValueError, match="desconhecido"):
            slug_dia_semana("Feriado")


class TestTipoDoDia:
    def test_forca(self):
        assert tipo_do_dia("Força A") == "forca"
        assert tipo_do_dia("Força B") == "forca"
        assert tipo_do_dia("Força C") == "forca"

    def test_cardio(self):
        assert tipo_do_dia("Cardio leve") == "cardio"
        assert tipo_do_dia("Cardio + antebraço") == "cardio"

    def test_cardio_reconhece_corrida_bike_pilates(self):
        assert tipo_do_dia("Pilates") == "cardio"
        assert tipo_do_dia("Pilates + corrida leve") == "cardio"
        assert tipo_do_dia("Corrida contínua") == "cardio"
        assert tipo_do_dia("Bike Z2") == "cardio"

    def test_hiit(self):
        assert tipo_do_dia("HIIT") == "hiit"

    def test_descanso(self):
        assert tipo_do_dia("Descanso") == "descanso"

    def test_desconhecido_falha_alto(self):
        import pytest

        with pytest.raises(ValueError, match="desconhecido"):
            tipo_do_dia("Ioga")


def _protocolo(nome: str) -> ProtocoloCardio:
    return ProtocoloCardio(
        nome=nome,
        aquecimento=None,
        parte_principal=None,
        recuperacao=None,
        desaquecimento=None,
        rpe_alvo=None,
        observacao=None,
    )


class TestMapaProtocoloPorDia:
    def test_deriva_do_dia_no_nome_da_sessao(self):
        protocolos = [
            _protocolo("Corrida leve + Pilates (terça)"),
            _protocolo("HIIT (quinta)"),
            _protocolo("Corrida contínua (sábado)"),
        ]
        assert mapa_protocolo_por_dia(protocolos) == {
            "terca": "Corrida leve + Pilates (terça)",
            "quinta": "HIIT (quinta)",
            "sabado": "Corrida contínua (sábado)",
        }

    def test_cai_no_mapa_fixo_quando_o_nome_nao_traz_dia(self):
        protocolos = [_protocolo("Cardio leve"), _protocolo("HIIT iniciante/intermediário")]
        assert mapa_protocolo_por_dia(protocolos) == PROTOCOLO_POR_DIA


class TestUnificarExercicios:
    def test_combina_series_reps_com_how_to_por_nome(self):
        linhas_forca = [
            {
                "Treino": "Força A",
                "Exercício": "Supino no chão com halteres/anilhas",
                "Séries": "4",
                "Reps": "8–12",
                "RIR alvo": "2",
                "Descanso": "90 s",
            }
        ]
        linhas_detalhadas = [
            {
                "Treino": "Força A",
                "Exercício": "Supino no chão com halteres/anilhas",
                "Foco principal": "Peito, tríceps, deltoide anterior",
                "Como executar": "Deite de costas...",
                "Erros a evitar": "Abrir os cotovelos a 90°.",
            }
        ]

        (resultado,) = unificar_exercicios(linhas_forca, linhas_detalhadas)
        assert resultado.nome == "Supino no chão com halteres/anilhas"
        assert (resultado.series.minimo, resultado.series.maximo) == (4, 4)
        assert (resultado.reps.minimo, resultado.reps.maximo) == (8, 12)
        assert resultado.descanso_seg == 90
        assert resultado.how_to == "Deite de costas..."
        assert resultado.common_mistakes == "Abrir os cotovelos a 90°."
        assert resultado.grupo_muscular == ("Peito", "tríceps", "deltoide anterior")

    def test_exercicio_sem_correspondencia_nos_detalhes_nao_quebra(self):
        linhas_forca = [
            {
                "Treino": "Força A",
                "Exercício": "Novo",
                "Séries": "3",
                "Reps": "10",
                "RIR alvo": "2",
                "Descanso": "60 s",
            }
        ]
        (resultado,) = unificar_exercicios(linhas_forca, [])
        assert resultado.how_to is None
        assert resultado.common_mistakes is None
        assert resultado.grupo_muscular == ()

    def test_preserva_a_ordem_da_planilha(self):
        linhas_forca = [
            {
                "Treino": "Força A",
                "Exercício": f"Ex {i}",
                "Séries": "3",
                "Reps": "10",
                "RIR alvo": "2",
                "Descanso": "60 s",
            }
            for i in range(5)
        ]
        resultado = unificar_exercicios(linhas_forca, [])
        assert [e.nome for e in resultado] == [f"Ex {i}" for i in range(5)]
