// Drawing for the page field (flow-field.ts): nebula clouds, depth motes, pointer glow and click
// ripples. Everything is drawn in CSS pixels; the caller sets the device transform once per frame.
// Colours walk the Signal spectrum, so scrolling moves the whole page through one colour wheel.

export type Rgb = readonly [number, number, number];

export interface Mote {
  x: number;
  y: number;
  /** Depth: 0.2 far .. 1 near. Near motes move faster, parallax more and draw larger. */
  z: number;
  /** Spectrum index. */
  hue: number;
  vx: number;
  vy: number;
}

export interface Ripple {
  x: number;
  y: number;
  t0: number;
  /** Spectrum position (0..1 wheel), taken from the scroll colour at the click. */
  hue: number;
}

export const SPECTRUM: readonly Rgb[] = [
  [56, 225, 255], // cyan
  [31, 111, 209], // azure
  [75, 60, 255], // indigo
  [139, 92, 246], // violet
  [224, 76, 255], // magenta
  [45, 245, 160], // emerald
  [25, 211, 197], // teal
];

export const RIPPLE_LIFE_MS = 1600;
const FALLBACK: Rgb = [56, 225, 255];
const TAU = Math.PI * 2;
const WRAP_SPAN = 1.3;
const WRAP_LEAD = 0.15;
const LIGHT_TONE: readonly [number, number, number] = [0.72, 0.82, 0.94];
const SPRITE_PX = 32;
const MOTE_DRIFT = 0.04;
const MOTE_RISE = 0.02;
const MOTE_MIN_PX = 4;
const MOTE_SPAN_PX = 16;
const MOTE_PARALLAX_MIN = 0.1;
const MOTE_PARALLAX_SPAN = 0.4;
const RIPPLE_MAX_PX = 420;
const RIPPLE_LAG = 0.18;
// Nebula clouds: home position (fraction of the viewport), radius, spectrum offset, drift phase.
const NEBULA: readonly { x: number; y: number; r: number; hue: number; phase: number }[] = [
  { x: 0.18, y: 0.28, r: 0.42, hue: 0.0, phase: 0 },
  { x: 0.82, y: 0.18, r: 0.36, hue: 0.45, phase: 1.7 },
  { x: 0.72, y: 0.72, r: 0.44, hue: 0.7, phase: 3.1 },
  { x: 0.12, y: 0.86, r: 0.4, hue: 0.3, phase: 4.6 },
];
const NEBULA_ALPHA = 0.16;
const NEBULA_ALPHA_LIGHT = 0.22;
const NEBULA_DRIFT_PX = 90;
const NEBULA_SCROLL = 0.04;
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

/** Colour at a position on the spectrum wheel; t wraps, so 1 is one full cycle. */
export function colorAt(t: number): Rgb {
  const n = SPECTRUM.length;
  const x = mod(t, 1) * n;
  const i = Math.floor(x);
  const f = x - i;
  const a = SPECTRUM[i % n] ?? FALLBACK;
  const b = SPECTRUM[(i + 1) % n] ?? FALLBACK;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Light theme: the same hues, deepened so they hold on a pale page. */
export function tone(c: Rgb, light: boolean): Rgb {
  return light ? [c[0] * LIGHT_TONE[0], c[1] * LIGHT_TONE[1], c[2] * LIGHT_TONE[2]] : c;
}

export function rgba(c: Rgb, a: number): string {
  return `rgba(${c[0].toFixed(0)},${c[1].toFixed(0)},${c[2].toFixed(0)},${a.toFixed(3)})`;
}

export function makeMotes(count: number, rnd: () => number): Mote[] {
  return Array.from({ length: count }, () => ({
    x: rnd(),
    y: rnd(),
    z: 0.2 + rnd() * 0.8,
    hue: Math.floor(rnd() * SPECTRUM.length),
    vx: (rnd() - 0.5) * MOTE_DRIFT,
    vy: -(0.3 + rnd() * 0.7) * MOTE_RISE,
  }));
}

/** Advances motes in place: a per-frame copy of ~150 objects would be wasted allocation. */
export function stepMotes(motes: Mote[], dt: number): void {
  for (const m of motes) {
    m.x = mod(m.x + m.vx * m.z * dt, 1);
    m.y = mod(m.y + m.vy * m.z * dt, 1);
  }
}

/** Soft nebula clouds that breathe and drift slowly; they carry the page colour as a wide, edgeless wash. */
export function paintNebula(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  scroll: number,
  shift: number,
  light: boolean,
): void {
  const span = Math.max(w, h);
  ctx.globalAlpha = light ? NEBULA_ALPHA_LIGHT : NEBULA_ALPHA;
  for (const n of NEBULA) {
    const cx = n.x * w + Math.sin(t * 0.05 + n.phase) * NEBULA_DRIFT_PX;
    const cy = mod(n.y * h - scroll * NEBULA_SCROLL, h * WRAP_SPAN) - h * WRAP_LEAD;
    const r = n.r * span;
    const c = tone(colorAt(n.hue + shift), light);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(c, 1));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
}

const sprites = new Map<string, HTMLCanvasElement>();

/** One soft dot per spectrum colour and theme, drawn once and then stamped: far cheaper than a gradient per mote. */
function spriteFor(hue: number, light: boolean): HTMLCanvasElement {
  const key = `${hue}-${light ? 1 : 0}`;
  const hit = sprites.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = SPRITE_PX;
  c.height = SPRITE_PX;
  const g = c.getContext('2d');
  if (g) {
    const rgb = tone(SPECTRUM[hue] ?? FALLBACK, light);
    const mid = SPRITE_PX / 2;
    const grad = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
    grad.addColorStop(0, rgba(rgb, 1));
    grad.addColorStop(0.25, rgba(rgb, 0.55));
    grad.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  }
  sprites.set(key, c);
  return c;
}

/** Depth motes: far ones are small, slow and barely parallax; near ones are larger and sweep past on scroll. */
export function paintMotes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scroll: number,
  motes: readonly Mote[],
  light: boolean,
): void {
  for (const m of motes) {
    const px = m.x * w;
    const py = mod(m.y * h - scroll * (MOTE_PARALLAX_MIN + MOTE_PARALLAX_SPAN * m.z), h);
    const size = MOTE_MIN_PX + m.z * MOTE_SPAN_PX;
    ctx.globalAlpha = (light ? 0.5 : 0.7) * (0.3 + 0.7 * m.z);
    ctx.drawImage(spriteFor(m.hue, light), px - size / 2, py - size / 2, size, size);
  }
}

export function paintGlow(ctx: CanvasRenderingContext2D, x: number, y: number, c: Rgb, radius: number, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, rgba(c, alpha));
  g.addColorStop(1, rgba(c, 0));
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** Click ripples: two rings, the second lagging, both spreading and fading over RIPPLE_LIFE_MS. */
export function paintRipples(ctx: CanvasRenderingContext2D, now: number, ripples: readonly Ripple[], light: boolean): void {
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  for (const rp of ripples) {
    const age = (now - rp.t0) / RIPPLE_LIFE_MS;
    if (age < 0 || age > 1) continue;
    const fade = (1 - age) * (1 - age);
    const c = tone(colorAt(rp.hue), light);
    for (const lag of [0, RIPPLE_LAG]) {
      const a = age - lag;
      if (a <= 0) continue;
      ctx.strokeStyle = rgba(c, fade * (1 - lag) * (light ? 0.9 : 0.6));
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, RIPPLE_MAX_PX * a, 0, TAU);
      ctx.stroke();
    }
  }
}
