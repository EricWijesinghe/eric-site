// Drawing for the page field (flow-field.ts): nebula clouds, depth motes, the pointer glow and the pool washes.
// Everything is drawn in CSS pixels; the caller sets the device transform once per frame. Colours come from the
// section chords (flow-palette.ts) at each element's page y, so the page changes colour where its sections do.
import { rgba, rgbStyle, type Chord, type Rgb } from './flow-palette';

export interface Mote {
  x: number;
  y: number;
  /** Depth: 0.2 far .. 1 near. Near motes move faster, parallax more and draw larger. */
  z: number;
  /** Which ink of the chord this mote takes (a or b). */
  ink: 'a' | 'b';
  vx: number;
  vy: number;
}

const WRAP_SPAN = 1.3;
const WRAP_LEAD = 0.15;
const SPRITE_PX = 32;
const MOTE_DRIFT = 0.04;
const MOTE_RISE = 0.02;
const MOTE_MIN_PX = 4;
const MOTE_SPAN_PX = 16;
const MOTE_PARALLAX_MIN = 0.1;
const MOTE_PARALLAX_SPAN = 0.4;
const MOTE_ALPHA = 0.7;
// Light: soft halos read as grey dirt on a clean page, so motes are small crisp dots of the chord inks, half as many.
const LIGHT_DOT_MIN_PX = 1.1;
const LIGHT_DOT_SPAN_PX = 0.8;
const LIGHT_DOT_ALPHA = 0.5;
const LIGHT_DOT_ALPHA_SPAN = 0.2;
const LIGHT_DOT_EVERY = 2;
// Nebula clouds: home position (fraction of the viewport), radius, drift phase; even clouds take ink a, odd b.
const NEBULA: readonly { x: number; y: number; r: number; phase: number }[] = [
  { x: 0.18, y: 0.28, r: 0.42, phase: 0 },
  { x: 0.82, y: 0.18, r: 0.36, phase: 1.7 },
  { x: 0.72, y: 0.72, r: 0.44, phase: 3.1 },
  { x: 0.12, y: 0.86, r: 0.4, phase: 4.6 },
];
const NEBULA_ALPHA = 0.16;
const NEBULA_ALPHA_LIGHT = 0.22;
const NEBULA_DRIFT_PX = 90;
const NEBULA_SCROLL = 0.04;
const WASH_ALPHA = 0.2;
const WASH_ALPHA_LIGHT = 0.5;
const WASH_FLASH = 0.35;
// Sprite colours are quantised to 4 bits per channel: 4096 possible sprites at most, a few dozen in practice.
const SPRITE_QUANT = 16;
const MAX_SPRITES = 256;
const mod = (a: number, b: number): number => ((a % b) + b) % b;

/** mulberry32: a tiny seeded PRNG, so the field composes the same way on every load. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeMotes(count: number, rnd: () => number): Mote[] {
  return Array.from({ length: count }, () => ({
    x: rnd(),
    y: rnd(),
    z: 0.2 + rnd() * 0.8,
    ink: rnd() < 0.5 ? 'a' : 'b',
    vx: (rnd() - 0.5) * MOTE_DRIFT,
    vy: -(0.3 + rnd() * 0.7) * MOTE_RISE,
  }));
}

/** Advances motes in place: a per-frame copy of ~90 objects would be wasted allocation. */
export function stepMotes(motes: Mote[], dt: number): void {
  for (const m of motes) {
    m.x = mod(m.x + m.vx * m.z * dt, 1);
    m.y = mod(m.y + m.vy * m.z * dt, 1);
  }
}

/** Soft nebula clouds that breathe and drift slowly; each takes the chord of the section under it. */
export function paintNebula(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  scroll: number,
  chordAt: (pageY: number) => Chord,
  light: boolean,
): void {
  const span = Math.max(w, h);
  ctx.globalAlpha = light ? NEBULA_ALPHA_LIGHT : NEBULA_ALPHA;
  NEBULA.forEach((n, i) => {
    const cx = n.x * w + Math.sin(t * 0.05 + n.phase) * NEBULA_DRIFT_PX;
    const cy = mod(n.y * h - scroll * NEBULA_SCROLL, h * WRAP_SPAN) - h * WRAP_LEAD;
    const r = n.r * span;
    const chord = chordAt(scroll + cy);
    // Light: the pastel wash, never a deep ink spread over the page.
    const c = light ? chord.w : i % 2 === 0 ? chord.a : chord.b;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(c, 1));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  });
}

const sprites = new Map<number, HTMLCanvasElement>();

/** One soft dot per quantised colour, drawn once and then stamped: far cheaper than a gradient per mote. */
function spriteFor(c: Rgb): HTMLCanvasElement {
  const q = (v: number): number => Math.min(SPRITE_QUANT - 1, Math.round((v / 255) * (SPRITE_QUANT - 1)));
  const key = (q(c[0]) << 8) | (q(c[1]) << 4) | q(c[2]);
  const hit = sprites.get(key);
  if (hit) return hit;
  if (sprites.size >= MAX_SPRITES) sprites.clear();
  const el = document.createElement('canvas');
  el.width = SPRITE_PX;
  el.height = SPRITE_PX;
  const g = el.getContext('2d');
  if (g) {
    const scale = 255 / (SPRITE_QUANT - 1);
    const rgb: Rgb = [q(c[0]) * scale, q(c[1]) * scale, q(c[2]) * scale];
    const mid = SPRITE_PX / 2;
    const grad = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
    grad.addColorStop(0, rgba(rgb, 1));
    grad.addColorStop(0.25, rgba(rgb, 0.55));
    grad.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  }
  sprites.set(key, el);
  return el;
}

/** Depth motes: far ones are small, slow and barely parallax; near ones are larger and sweep past on scroll. */
export function paintMotes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scroll: number,
  motes: readonly Mote[],
  chordAt: (pageY: number) => Chord,
  light: boolean,
): void {
  motes.forEach((m, i) => {
    const px = m.x * w;
    const py = mod(m.y * h - scroll * (MOTE_PARALLAX_MIN + MOTE_PARALLAX_SPAN * m.z), h);
    const c = chordAt(scroll + py)[m.ink];
    if (light) {
      if (i % LIGHT_DOT_EVERY) return;
      ctx.globalAlpha = LIGHT_DOT_ALPHA + LIGHT_DOT_ALPHA_SPAN * m.z;
      ctx.fillStyle = rgbStyle(c);
      ctx.beginPath();
      ctx.arc(px, py, LIGHT_DOT_MIN_PX + LIGHT_DOT_SPAN_PX * m.z, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const size = MOTE_MIN_PX + m.z * MOTE_SPAN_PX;
    ctx.globalAlpha = MOTE_ALPHA * (0.3 + 0.7 * m.z);
    ctx.drawImage(spriteFor(c), px - size / 2, py - size / 2, size, size);
  });
}

export function paintGlow(ctx: CanvasRenderingContext2D, x: number, y: number, c: Rgb, radius: number, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, rgba(c, alpha));
  g.addColorStop(1, rgba(c, 0));
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** The pool wash: a page-anchored radial light at a gap, mixing the two sections' washes; a flash brightens it. */
export function paintWash(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: Rgb, flash: number, light: boolean): void {
  const base = light ? WASH_ALPHA_LIGHT : WASH_ALPHA;
  paintGlow(ctx, x, y, c, r, Math.min(1, base + WASH_FLASH * flash));
}
