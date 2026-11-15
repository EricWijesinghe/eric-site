// The hero's colours. His hologram is cyan only; the world around him spans the wider spectrum (Signal F5).
// The GLSL in singularity-shaders.ts reads SPECTRUM through glsl(), so the two sides never drift apart.

export type Rgb = [number, number, number];

const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;

export const CYAN = hex('#38e1ff');
export const ICE = hex('#bff4ff');
export const TEAL = hex('#19d3c5');
export const AZURE = hex('#1f6fd1');
export const INDIGO = hex('#4b3cff');
export const VIOLET = hex('#8b5cf6');
export const MAGENTA = hex('#e04cff');
export const EMERALD = hex('#2df5a0');

/** The order the background cycles through the spectrum, cyan to emerald. */
export const SPECTRUM: readonly Rgb[] = [CYAN, TEAL, AZURE, INDIGO, VIOLET, MAGENTA, EMERALD];

/** A colour from the spectrum at position x (any real; the spectrum repeats every 7 units). */
export function spectrum(x: number): Rgb {
  const n = SPECTRUM.length, y = ((x % n) + n) % n, i = Math.floor(y), f = y - i;
  const s = f * f * (3 - 2 * f), a = SPECTRUM[i], b = SPECTRUM[(i + 1) % n];
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
}

/** A colour as a GLSL vec3 literal. */
export function glsl(c: Rgb): string {
  return `vec3(${c.map((v) => v.toFixed(3)).join(', ')})`;
}
