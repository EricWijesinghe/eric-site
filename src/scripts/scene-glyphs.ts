// Decorative code and binary for the Projects scenes: hex digests, bit rows, hexdump lines, code
// tokens and a falling code rain. Every string is derived from a seed, so a still frame is the same
// drawing every time. None of it is chain, scan or model data, and no scene presents it as such.
// Kept free of imports so scene-core can draw the rain without an import cycle.

const HEX = '0123456789abcdef';
const HASH_MUL = 0x45d9f3b; // integer mixing multiplier (Knuth-style avalanche)
const RAIN_STEP = 34; // px between rain columns
const RAIN_ROW = 22; // px between glyphs in one column
const RAIN_FONT = '11px "JetBrains Mono", ui-monospace, monospace';
const RAIN_SKIP = 3; // every third column is left empty, so the rain reads as streams, not a wall
const RAIN_SPEED = 16; // px per second for the slowest column

export const CODE_TOKENS: readonly string[] = [
  'fn', 'let', 'impl', '->', '::', '{}', '0x3f', 'pub', '&mut', '?;', 'match', 'Ok(', 'u256', 'if', '<T>', 'loop', '0xa7', 'trait',
];

/** Integer avalanche: one well-mixed 32-bit value per seed. */
export function mix(seed: number): number {
  let x = seed | 0;
  x = Math.imul(x ^ (x >>> 16), HASH_MUL);
  x = Math.imul(x ^ (x >>> 16), HASH_MUL);
  return (x ^ (x >>> 16)) >>> 0;
}

/** `n` hex digits drawn from `seed`. */
export function hex(seed: number, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += HEX[mix(Math.imul(seed, 31) + i) & 15];
  return out;
}

/** `n` binary digits drawn from `seed`. */
export function bits(seed: number, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += mix(Math.imul(seed, 17) + i) & 1 ? '1' : '0';
  return out;
}

const DUMP_BYTES = 8;
/** One hexdump row: a 16-bit offset and eight bytes. */
export function dumpLine(seed: number, offset: number): string {
  const bytes: string[] = [];
  for (let i = 0; i < DUMP_BYTES; i++) bytes.push(hex(seed + i * 7, 2));
  return `${(offset & 0xffff).toString(16).padStart(4, '0')}  ${bytes.join(' ')}`;
}

/**
 * Code rain behind a scene: short glyph streams falling in columns, each at its own speed. The
 * glyph under each cell re-rolls as it passes, so the stream keeps moving without a repeat pattern.
 * `ink` is the caller's theme text colour (channel triplet), drawn at low alpha.
 */
export function codeRain(g: CanvasRenderingContext2D, w: number, h: number, t: number, ink: string): void {
  g.font = RAIN_FONT;
  g.textBaseline = 'alphabetic';
  const rows = Math.ceil(h / RAIN_ROW) + 1;
  for (let c = 0; c * RAIN_STEP < w; c++) {
    if (c % RAIN_SKIP === 0) continue;
    const speed = RAIN_SPEED + ((c * 37) % 23);
    const span = rows * RAIN_ROW;
    const offset = (((c * 97) % 1000) / 1000) * span + t * speed;
    for (let r = 0; r < rows; r++) {
      const raw = r * RAIN_ROW + offset;
      const y = (raw % span) - RAIN_ROW;
      if (y < 0 || y > h) continue;
      const wrap = Math.floor(raw / span);
      const glyph = mix(c * 7919 + r * 104729 + wrap * 31) & 1 ? bits(c * 13 + wrap, 1) : hex(c * 17 + r + wrap, 1);
      g.fillStyle = `rgb(${ink} / ${0.035 + 0.035 * ((r + c) % 3 === 0 ? 1 : 0)})`;
      g.fillText(glyph, c * RAIN_STEP, y);
    }
  }
}
