// The current's colours: one chord per section (two glyph inks and a wash), read from the CSS tokens on .flow-field
// (flow.css), the single source of truth per theme. Read once, and again when html[data-theme] changes; the canvas
// then cross-fades from the old chords to the new over 350 ms, like the page's CSS colours.

export type Rgb = readonly [number, number, number];

export interface Chord {
  a: Rgb;
  b: Rgb;
  w: Rgb;
}

export const CHORDS = 6;
const LERP_MS = 350;
const FALLBACK: Rgb = [56, 225, 255];

function parseHex(v: string): Rgb | null {
  const m = /^#([0-9a-f]{6})$/i.exec(v.trim());
  if (!m?.[1]) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function read(el: Element): Chord[] {
  const cs = getComputedStyle(el);
  const tok = (name: string): Rgb => parseHex(cs.getPropertyValue(name)) ?? FALLBACK;
  return Array.from({ length: CHORDS }, (_, i) => ({ a: tok(`--flow-a-${i}`), b: tok(`--flow-b-${i}`), w: tok(`--flow-w-${i}`) }));
}

const isLightTheme = (): boolean => document.documentElement.dataset.theme === 'light';

const mixRgb = (p: Rgb, q: Rgb, f: number): Rgb => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];
const mixChord = (p: Chord, q: Chord, f: number): Chord => ({ a: mixRgb(p.a, q.a, f), b: mixRgb(p.b, q.b, f), w: mixRgb(p.w, q.w, f) });

export interface Palette {
  /** Light theme draws deep inks with normal alpha; dark adds light. */
  light: boolean;
  /** Advances the theme cross-fade; returns true while it is still running. */
  step(now: number): boolean;
  /** Chord at a continuous section position (conduit.ts chordPos). */
  at(pos: number): Chord;
}

export function makePalette(el: Element, onChange: () => void): Palette {
  let from = read(el);
  let to = from;
  let t0 = -Infinity;
  let mix = to;
  const pal: Palette = {
    light: isLightTheme(),
    step(now: number): boolean {
      const f = Math.min(1, (now - t0) / LERP_MS);
      const e = f * f * (3 - 2 * f);
      mix = f >= 1 ? to : to.map((c, i) => mixChord(from[i] ?? c, c, e));
      return f < 1;
    },
    at(pos: number): Chord {
      const p = Math.min(CHORDS - 1, Math.max(0, pos));
      const i = Math.floor(p);
      const lo = mix[i] ?? mix[0];
      const hi = mix[Math.min(CHORDS - 1, i + 1)] ?? lo;
      if (!lo || !hi) return { a: FALLBACK, b: FALLBACK, w: FALLBACK };
      return p === i ? lo : mixChord(lo, hi, p - i);
    },
  };
  new MutationObserver(() => {
    from = mix;
    to = read(el);
    t0 = performance.now();
    pal.light = isLightTheme();
    onChange();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return pal;
}

// fillStyle strings are cached per quantised colour: the river sets one per glyph, and a fresh string each time
// would be a few hundred allocations a frame.
const styles = new Map<number, string>();
const MAX_STYLES = 4096;

export function rgbStyle(c: Rgb): string {
  const r = Math.round(c[0]) & 255;
  const g = Math.round(c[1]) & 255;
  const b = Math.round(c[2]) & 255;
  const key = (r << 16) | (g << 8) | b;
  let s = styles.get(key);
  if (!s) {
    if (styles.size >= MAX_STYLES) styles.clear();
    s = `rgb(${r},${g},${b})`;
    styles.set(key, s);
  }
  return s;
}

export function rgba(c: Rgb, a: number): string {
  return `rgba(${c[0].toFixed(0)},${c[1].toFixed(0)},${c[2].toFixed(0)},${a.toFixed(3)})`;
}

export const mixColour = mixRgb;
