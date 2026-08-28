export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

/** Converte entrada brasileira ("1.234,56") em centavos, sem usar float no domínio. */
export function parseMoney(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(/^R\$/i, '').replace(/\./g, '');
  if (!/^\d+(,\d{0,2})?$/.test(normalized)) return null;
  const [integers = '0', decimals = ''] = normalized.split(',');
  const cents = Number(integers) * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
