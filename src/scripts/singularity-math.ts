// Small maths shared by the hero's modules.

export type Pt = [number, number];

export const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
/** The fractional part, always in [0, 1): a phase that runs backward still indexes correctly. */
export const frac = (x: number): number => x - Math.floor(x);

/** Deterministic park-miller stream, so a frozen frame (?still, reduced motion) is the same every time. */
export function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
