# Caddy com a config embutida. Bind mount de arquivo do repo não sobrevive no
# Coolify (o diretório de runtime não é o checkout completo), então a config
# entra na imagem.
FROM caddy:2-alpine
COPY infra/Caddyfile.coolify /etc/caddy/Caddyfile
