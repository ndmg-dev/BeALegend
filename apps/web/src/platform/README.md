# platform/

Toda API de plataforma (notificação, câmera, wake lock, vibração, rede) mora
atrás desta camada. O app é PWA puro na v1 — mas se um dia for empacotado com
Capacitor, só os arquivos daqui mudam.

Regra: nenhum componente em `features/` ou `ui/` chama `navigator.*` direto.
