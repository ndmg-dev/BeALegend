# Design system — implementação

Fonte visual: [`design/Design System.dc.html`](design/Design%20System.dc.html) e
[`design/Mockups.dc.html`](design/Mockups.dc.html). Este documento diz onde os
tokens de lá viraram código.

## Onde os tokens moram

| | arquivo |
|---|---|
| Variáveis CSS (fonte da verdade) | `apps/web/src/ui/tokens.css` |
| Ponte para o Tailwind | `apps/web/tailwind.config.js` |
| Base global + reduced-motion | `apps/web/src/styles/global.css` |

**Regra:** nenhum componente escreve cor literal. Sempre `bg-surface`,
`text-text-muted`, `text-treino-300` — nunca `#4a56c4`.

## Cor

Cinco rampas de 10 passos (50…900):

| domínio | prefixo CSS | classe Tailwind | intenção |
|---|---|---|---|
| Treino | `--tr-*` | `treino-*` | índigo profundo, frio e sólido |
| Nutrição | `--nu-*` | `nutricao-*` | verde terroso, não neon |
| Finanças | `--fi-*` | `financas-*` | âmbar / dourado |
| Rotina & metas | `--ro-*` | `rotina-*` | roxo suave, quase neutro |
| Neutro | `--ne-*` | `neutro-*` | cinza levemente frio |

Superfícies (`bg`, `surface`, `surface-raised`, `surface-sunken`, `border`,
`border-subtle`), texto (`text`, `text-secondary`, `text-muted`, `text-inverse`),
semânticas (`success`, `warning`, `danger`, `info`, cada uma com `-bg`) e o par
`budget-ok` / `budget-over` são redefinidos por tema.

Escuro é o padrão — o app é usado em academia e à noite. O tema claro existe em
`:root[data-theme='light']`.

## Tipografia

Inter, 7 passos: `display`, `title`, `heading`, `subhead`, `body`, `label`,
`caption`. Cada um carrega tamanho, altura de linha e peso.

`font-variant-numeric: tabular-nums` está no `html`, não em componente avulso.
O app é uma pilha de colunas de números — carga, reps, dinheiro — e sem isso as
colunas dançam a cada dígito.

## Espaço, raio, movimento

- Espaçamento base 4: `sp-1` … `sp-16` (4px a 64px).
- Raios: `sm` 6 · `md` 10 · `lg` 16 · `full`.
- Durações: `micro` 120ms (toque, toggle) · padrão 200ms (tela, card) ·
  `sheet` 320ms. Entrada `cubic-bezier(.2,0,0,1)`, saída `cubic-bezier(.4,0,1,1)`.
- `prefers-reduced-motion: reduce` zera animação e transição globalmente.

## Acessibilidade — o que é verificado, não aspirado

- **Alvo de toque ≥ 48px.** `min-h-tap` / `min-w-tap`. O `Button` já nasce assim,
  e um teste do Playwright mede a altura do botão de entrar.
- **Estado nunca só por cor.** Erro tem ícone + `role="alert"` + texto; item de
  navegação ativo muda peso além da cor; "orçamento estourado" (fase 3) precisa
  de ícone e texto, não só vermelho.
- **Foco visível** com `:focus-visible` em `--accent`, offset 2px.
- Contraste AA: as rampas foram escolhidas para isso; ao criar par novo de
  fundo/texto, confira antes de usar.

## Componentes

Prontos na fase 0: `Button`, `TextField`, `Card`, `OfflineBanner`.

Especificados no design system e pendentes por fase:
`StatCard`, `ProgressRing`, `StreakBadge` (fase 5) · `SetRow`, `RestTimer`,
`NumberStepper` (fase 2) · `QuickEntrySheet`, `CategoryPill`, `BudgetBar`
(fase 3) · `DayStrip`, `EmptyState`, `Skeleton`, `SyncIndicator` (fase 1/5).
