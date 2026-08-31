# Postgres com o script de init embutido, pelo mesmo motivo do caddy.Dockerfile:
# bind mount de ./infra/db-init não sobrevive no runtime do Coolify. O script
# só roda no primeiro boot de um volume pgdata vazio.
FROM postgres:16-alpine
COPY infra/db-init/ /docker-entrypoint-initdb.d/
