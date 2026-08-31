/** @type {import('tailwindcss').Config} */
const ramp = (prefix) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((s) => [s, `var(--${prefix}-${s})`]),
  );

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        treino: ramp('tr'),
        nutricao: ramp('nu'),
        financas: ramp('fi'),
        rotina: ramp('ro'),
        neutro: ramp('ne'),

        bg: 'var(--bg)',
        surface: { DEFAULT: 'var(--surface)', raised: 'var(--surface-raised)', sunken: 'var(--surface-sunken)' },
        border: { DEFAULT: 'var(--border)', subtle: 'var(--border-subtle)' },
        text: { DEFAULT: 'var(--text)', secondary: 'var(--text-secondary)', muted: 'var(--text-muted)', inverse: 'var(--text-inverse)' },

        success: { DEFAULT: 'var(--success)', bg: 'var(--success-bg)' },
        warning: { DEFAULT: 'var(--warning)', bg: 'var(--warning-bg)' },
        danger: { DEFAULT: 'var(--danger)', bg: 'var(--danger-bg)' },
        info: { DEFAULT: 'var(--info)', bg: 'var(--info-bg)' },
        budget: { ok: 'var(--budget-ok)', over: 'var(--budget-over)' },
        accent: { DEFAULT: 'var(--accent)', contrast: 'var(--accent-contrast)' },
        tier: {
          bronze: 'var(--tier-bronze)',
          prata: 'var(--tier-prata)',
          ouro: 'var(--tier-ouro)',
          platina: 'var(--tier-platina)',
        },
      },
      fontFamily: { sans: 'var(--font-sans)'.split(',') },
      fontSize: {
        display: ['var(--fs-display)', { lineHeight: 'var(--lh-display)', fontWeight: 'var(--fw-display)' }],
        title: ['var(--fs-title)', { lineHeight: 'var(--lh-title)', fontWeight: 'var(--fw-title)' }],
        heading: ['var(--fs-heading)', { lineHeight: 'var(--lh-heading)', fontWeight: 'var(--fw-heading)' }],
        subhead: ['var(--fs-subhead)', { lineHeight: 'var(--lh-subhead)', fontWeight: 'var(--fw-subhead)' }],
        body: ['var(--fs-body)', { lineHeight: 'var(--lh-body)', fontWeight: 'var(--fw-body)' }],
        label: ['var(--fs-label)', { lineHeight: 'var(--lh-label)', fontWeight: 'var(--fw-label)' }],
        caption: ['var(--fs-caption)', { lineHeight: 'var(--lh-caption)', fontWeight: 'var(--fw-caption)' }],
      },
      // base 4 — sp-1 .. sp-16
      spacing: Object.fromEntries([1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => [`sp-${n}`, `${n * 4}px`])),
      borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', full: 'var(--radius-full)' },
      boxShadow: { sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)' },
      transitionDuration: { micro: 'var(--dur-micro)', DEFAULT: 'var(--dur-transition)', sheet: 'var(--dur-sheet)' },
      transitionTimingFunction: { in: 'var(--ease-in)', out: 'var(--ease-out)' },
      minHeight: { tap: 'var(--tap-min)' },
      minWidth: { tap: 'var(--tap-min)' },
    },
  },
  plugins: [],
};
