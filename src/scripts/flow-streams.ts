// Binary and code streams for the page field (flow-field.ts): columns of 0/1, hex bytes and short code
// tokens falling through the page at depth. Decoration only: no words, and the columns dim behind the
// copy column so they never compete with the text. Drawing helpers live in flow-paint.ts (colour, tone).
import { colorAt, rgba, tone } from './flow-paint';

export interface Stream {
  /** Horizontal position as a fraction of the viewport. */
  x: number;
  /** Depth: 0.3 far .. 1 near. Near columns are larger, brighter and move faster. */
  z: number;
  /** Spectrum position (0..1 wheel), so each column carries its own colour. */
  hue: number;
  /** Integer seed that fixes the glyph choice down the column. */
  seed: number;
}

// Binary weighted higher than code, so the field reads as bits first and code second.
const TOKENS: readonly string[] = [
  '0', '1', '0', '1', '01', '10', '1010', '1101', '0110', '0x3F', '0xA7', '0x9C', '0xFF', '0x00',
  'fn', 'let', '->', '::', '{}', '<>', 'impl', '&mut', '#[', '];', '0b1', 'u256',
];
const FONT_MIN_PX = 9;
const FONT_SPAN_PX = 5;
const ROW_LEAD = 1.7;
const FALL_PX_PER_S = 26;
const SCROLL_PARALLAX_MIN = 0.1;
const SCROLL_PARALLAX_SPAN = 0.4;
const EPOCH_RATE = 0.6;
const EPOCH_JITTER = 4;
const SHIMMER_RATE = 1.7;
const SHIMMER_DEPTH = 0.25;
const SHIMMER_PHASE = 0.9;
const FADE_FRAC = 0.14;
const GLYPH_ALPHA = 0.22;
const GLYPH_ALPHA_LIGHT = 0.28;
const DEPTH_FLOOR = 0.35;
// Columns left of RAIL_X sit under the copy column at low strength. Past it they are at half strength,
// and both viewport sides dissolve over SIDE_FADE, so no column reads as a panel or strip at the edge.
const RAIL_X = 0.55;
const MID_FACTOR = 0.5;
const COPY_FACTOR = 0.2;
const SIDE_FADE = 0.12;
const TAU = Math.PI * 2;
const FONT_FAMILY = '"JetBrains Mono", ui-monospace, monospace';

const mod = (a: number, b: number): number => ((a % b) + b) % b;

/** Smooth 0..1 ramp at both viewport sides: columns dissolve into the page instead of standing as a strip. */
function sideFade(x: number): number {
  const edge = Math.min(x, 1 - x) / SIDE_FADE;
  const c = Math.min(1, Math.max(0, edge));
  return c * c * (3 - 2 * c);
}

/** Integer hash to [0, 1): one glyph choice per (column, row, time epoch). */
function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x27d4eb2d, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

export function makeStreams(count: number, rnd: () => number): Stream[] {
  return Array.from({ length: count }, (_, i) => ({
    x: (i + 0.5 + (rnd() - 0.5) * 0.6) / count,
    z: 0.3 + rnd() * 0.7,
    hue: rnd(),
    seed: Math.floor(rnd() * 2147483647),
  }));
}

/** Paints every column: rows wrap within the column, glyphs flip now and then, and the ends fade out. */
export function paintStreams(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  scroll: number,
  streams: readonly Stream[],
  shift: number,
  light: boolean,
): void {
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  for (const s of streams) {
    const size = FONT_MIN_PX + FONT_SPAN_PX * s.z;
    const rowH = size * ROW_LEAD;
    const rows = Math.ceil(h / rowH) + 1;
    const span = rows * rowH;
    const offset = t * FALL_PX_PER_S * s.z - scroll * (SCROLL_PARALLAX_MIN + SCROLL_PARALLAX_SPAN * s.z);
    const rail = (s.x > RAIL_X ? MID_FACTOR : COPY_FACTOR) * sideFade(s.x);
    const base = (light ? GLYPH_ALPHA_LIGHT : GLYPH_ALPHA) * (DEPTH_FLOOR + (1 - DEPTH_FLOOR) * s.z) * rail;
    const epoch = Math.floor(t * EPOCH_RATE);
    ctx.font = `${size.toFixed(1)}px ${FONT_FAMILY}`;
    ctx.fillStyle = rgba(tone(colorAt(s.hue + shift), light), 1);
    const px = s.x * w;
    for (let r = 0; r < rows; r++) {
      const y = mod(r * rowH + offset, span);
      const edge = Math.min(y, h - y) / (FADE_FRAC * h);
      if (edge <= 0.01) continue;
      const pick = hash(s.seed, r, epoch + Math.floor(hash(s.seed, r, 99) * EPOCH_JITTER));
      const text = TOKENS[Math.floor(pick * TOKENS.length)] ?? '0';
      const shimmer = 1 - SHIMMER_DEPTH + SHIMMER_DEPTH * Math.sin(t * SHIMMER_RATE + r * SHIMMER_PHASE + s.seed * TAU);
      ctx.globalAlpha = base * Math.min(1, edge) * shimmer;
      ctx.fillText(text, px, y);
    }
  }
  ctx.globalAlpha = 1;
}
