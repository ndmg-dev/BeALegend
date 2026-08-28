/**
 * Fronteiras de dia no fuso do usuário.
 *
 * Todo cálculo que depende de "que dia é hoje" — streak, orçamento diário,
 * aderência — passa por aqui. Nunca use `new Date().toISOString().slice(0,10)`:
 * às 21h em São Paulo isso já é amanhã em UTC, e o streak quebra sozinho.
 */

/** Data local no formato `YYYY-MM-DD`. */
export type LocalDate = string;

const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = FORMATTER_CACHE.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    FORMATTER_CACHE.set(timeZone, f);
  }
  return f;
}

/** O dia civil ao qual `instant` pertence, no fuso do usuário. */
export function toLocalDate(instant: Date, timeZone: string): LocalDate {
  return formatter(timeZone).format(instant);
}

/** Quantos dias civis separam duas datas locais. Positivo se `b` vem depois. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Soma dias a uma data local, sem passar por fuso nenhum. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000);
  return next.toISOString().slice(0, 10);
}

/** `true` quando as duas datas locais são o mesmo dia civil. */
export function isSameLocalDay(a: LocalDate, b: LocalDate): boolean {
  return a === b;
}

/**
 * Streak em dias consecutivos, contando para trás a partir de `hoje`.
 *
 * Um registro feito hoje **ou** ontem mantém a sequência viva: quem registra
 * às 23h50 e de novo às 00h10 não deve perder a série por dez minutos.
 */
export function currentStreak(dates: readonly LocalDate[], hoje: LocalDate): number {
  const unique = [...new Set(dates)].sort().reverse();
  const first = unique[0];
  if (first === undefined) return 0;

  const gapInicial = daysBetween(first, hoje);
  if (gapInicial > 1) return 0;

  let streak = 1;
  let anterior = first;
  for (const d of unique.slice(1)) {
    if (daysBetween(d, anterior) !== 1) break;
    streak += 1;
    anterior = d;
  }
  return streak;
}
