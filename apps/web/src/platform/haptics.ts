/** Vibração. iOS ignora silenciosamente — nunca é o único sinal de nada. */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  navigator.vibrate(pattern);
}

export const PATTERN_REST_DONE = [200, 80, 200];
