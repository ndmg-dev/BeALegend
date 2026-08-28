# platform/

Toda API de plataforma (notificação, câmera, wake lock, vibração, rede) mora
atrás desta camada. O app é PWA puro na v1 — mas se um dia for empacotado com
Capacitor, só os arquivos daqui mudam.

Regra: nenhum componente em `features/` ou `ui/` chama `navigator.*` direto.

- `camera.ts`: valida imagem e produz o data URL usado offline, com limite de
  750 KB. A captura em si continua no `<input capture>` declarativo.
