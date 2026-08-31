"""Heartbeat do worker — o sinal que o healthcheck do docker-compose confere.

O worker nao expoe porta nenhuma, entao "esta vivo" so pode ser medido por um
efeito colateral que ele mesmo produz. Sem este teste, um refactor poderia
trocar o caminho do arquivo ou o nome do job e o healthcheck ficaria cego em
silencio ate o primeiro incidente em producao.
"""

import time

from app import worker


def test_write_heartbeat_grava_um_timestamp_recente(tmp_path):
    arquivo = tmp_path / "heartbeat"
    original = worker.HEARTBEAT_FILE
    worker.HEARTBEAT_FILE = arquivo
    try:
        antes = time.time()
        worker.write_heartbeat()
        assert arquivo.exists()
        assert float(arquivo.read_text()) >= antes
    finally:
        worker.HEARTBEAT_FILE = original


def test_scheduler_agenda_a_escrita_do_heartbeat_no_intervalo_do_healthcheck():
    # build_scheduler() so monta os jobs, nao inicia o loop — nada para
    # desligar depois.
    scheduler = worker.build_scheduler()
    job = scheduler.get_job("heartbeat-file")
    assert job is not None
    assert job.trigger.interval.total_seconds() == worker.HEARTBEAT_INTERVAL_SECONDS


def test_janela_do_healthcheck_e_maior_que_o_intervalo_de_escrita():
    # Se nao for, o container pisca unhealthy entre duas escritas normais.
    assert worker.HEARTBEAT_MAX_AGE_SECONDS > worker.HEARTBEAT_INTERVAL_SECONDS
