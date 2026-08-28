# Scripts

- `seed_training_plan.py` (fase 2) — parser especifico da
  `data/planilha_treino_semanal_atualizada_sabado.xlsx`. Roda como a role
  **owner**, porque insere o catalogo global (`is_global = true`,
  `user_id NULL`), o que a role de runtime nao pode fazer por RLS.
