// Layered graphics behind the copy and beside him: colour aurora, a perspective lattice (the ML-DSA
// lattice), binary and code glyphs flowing into the singularity, HUD rings, and the quantum scene on his right.
// The canvas never draws text: a word inside the hero graphic would cross his face.
// Everything is low contrast so the name and the copy stay readable and he still dominates the right.
// The pointer (or keyboard focus on the figure) bends the lattice, deflects the streams and lights the field.
import { drawAurora } from './hero-aurora';
import { inkNow, onInkChange, type Ink } from './hero-theme';
import { onPointerChange, easePointer, heroPointer, type HeroPointer } from './hero-pointer';
import { drawQuantum } from './hero-quantum';
import {
  chargeLevel,
  clamp,
  createLoop,
  devicePixelRatioCapped,
  onResize,
  prefersReducedMotion,
  releaseStrength,
  type Loop,
} from './hero-loop';

const LATTICE_COLS = 20;
const LATTICE_ROWS = 11;
const LATTICE_YAW = 0.5;
const LATTICE_PITCH = 0.55;
const FOCAL = 2.2;
const CAMERA_DISTANCE = 3.2;
const RIPPLE_PX = 9;
const WAVE_SECONDS = 1.6;
const WAVE_BAND = 0.16; // fraction of the stage width
const CODE_ROWS = 16; // about 4x the first pass: the code has to read at the fold, not only at the edges
const CODE_PER_ROW = 12;
const CODE_SIZE = 12; // px: small mono glyphs read as texture, not as sentences
const CODE_TOKENS = [
  '0', '1', '01', '10', '0x7f', '0xa3', 'fn', 'let', '->', '::', '{}', '&&', 'impl', '1011', '0xff', ';',
  'pub', '0x1d', '=>', '[u8]', '0e', '<T>', '0x9c', '1100', 'Vec', '0b',
];
const CODE_FONT = `${CODE_SIZE}px "JetBrains Mono", ui-monospace, monospace`;
const CODE_SPAN = 0.96; // the rows run across the stage and thin out at its right edge
const CODE_MARGIN = 120;
const CODE_BASE = 0.46; // glyph alpha before the charge
// Vertical rain in depth, on both sides of his head: offsets from his body axis (--fig-x), never on it.
const RAIN_OFFSETS = [-0.3, -0.2, 0.2, 0.3];
const RAIN_ROWS = 18;
const RAIN_SPEED = 22; // px per second at rest
const RAIN_EDGE_END = 0.9; // share of the stage width where rain is fully gone...
const RAIN_EDGE_FEATHER = 0.12; // ...fading over this share of the width before it
const CODE_HAZE = 0.3; // glyphs behind the copy keep this share of their alpha, so the words stay AA readable
const CODE_EDGE = 1; // extra brightness at the stage edges
const CODE_SPEED = 2.2; // charge multiplies the flow speed by (1 + CODE_SPEED * level)
const HUD_INSET = 20; // px: the dark-theme tick ruler sits this far from the left edge
const POINTER_RADIUS = 0.2; // fraction of the stage width the pointer reaches
const POINTER_PUSH = 0.35; // how far the field bends away from the pointer, relative to distance
const POINTER_GLOW = 0.12;
const CHARGE_EASE = 4;
const DT_CAP = 0.05;
let ink: Ink = inkNow();

interface Rect { x: number; y: number; w: number; h: number }
interface Box { w: number; h: number; copy: Rect; name: Rect }
interface Wave { t0: number; amp: number }
interface Row { phase: number; speed: number; tok: number }
interface FieldState {
  figX: number; // his body axis, 0..1 of the stage width
  charge: number;
  target: number;
  wave: Wave | null;
  box: Box | null;
  dpr: number;
  rows: Row[];
  last: number;
}
/** The pointer in stage px, with its eased presence (0 when none). */
interface Probe { x: number; y: number; presence: number; radius: number }

const relRect = (el: Element, origin: DOMRect): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
};

/** Front position (stage px) and strength of the release wave; null once it has passed. */
function waveAt(st: FieldState, now: number, w: number): { front: number; flare: number } | null {
  if (!st.wave) return null;
  const t = (now - st.wave.t0) / 1000 / WAVE_SECONDS;
  if (t >= 1) {
    st.wave = null;
    return null;
  }
  return { front: w * (1.1 - 1.3 * t), flare: st.wave.amp * (1 - t * 0.5) };
}

type Wavefront = { front: number; flare: number } | null;

const flareAt = (wave: Wavefront, x: number, w: number): number =>
  wave ? wave.flare * Math.exp(-(((x - wave.front) / (w * WAVE_BAND)) ** 2)) : 0;

/** 0..1 closeness of a point to the pointer: a soft falloff that reaches zero at the radius. */
function near(probe: Probe, x: number, y: number): number {
  if (probe.presence <= 0) return 0;
  const dx = x - probe.x;
  const dy = y - probe.y;
  return probe.presence * Math.exp(-((dx * dx + dy * dy) / (probe.radius * probe.radius)));
}

/** Displacement of a point pushed away from the pointer: a lens, so the field bends rather than tears. */
function bend(probe: Probe, x: number, y: number): [number, number] {
  const k = POINTER_PUSH * near(probe, x, y);
  return [(x - probe.x) * k, (y - probe.y) * k];
}

/** Rotates a flat lattice point (z = 0) and projects it; returns offsets from the lattice centre. */
function project(wx: number, wy: number): [number, number] {
  const sy = Math.sin(LATTICE_YAW);
  const cy = Math.cos(LATTICE_YAW);
  const sp = Math.sin(LATTICE_PITCH);
  const cp = Math.cos(LATTICE_PITCH);
  const x1 = wx * cy;
  const z1 = -wx * sy;
  const y1 = wy * cp - z1 * sp;
  const z2 = wy * sp + z1 * cp;
  const d = CAMERA_DISTANCE + z2;
  return [(x1 * FOCAL) / d, (y1 * FOCAL) / d];
}

interface LatticePoint { x: number; y: number; a: number }

function drawLattice(ctx: CanvasRenderingContext2D, box: Box, t: number, c: number, wave: Wavefront, probe: Probe): void {
  const { copy } = box;
  const cx = copy.x + copy.w / 2;
  const cy = copy.y + copy.h / 2;
  const unit = copy.w * 0.55;
  const fade = (x: number, y: number): number => {
    const d = Math.hypot((x - cx) / (copy.w * 0.9), (y - cy) / (copy.h * 0.95));
    return clamp(1 - d * d, 0, 1);
  };
  const pts: LatticePoint[] = [];
  for (let j = 0; j < LATTICE_ROWS; j++) {
    for (let i = 0; i < LATTICE_COLS; i++) {
      const wx = ((i / (LATTICE_COLS - 1)) * 2 - 1) * 1.3;
      const wy = ((j / (LATTICE_ROWS - 1)) * 2 - 1) * 0.8;
      const [ox, oy] = project(wx, wy);
      let x = cx + ox * unit;
      let y = cy + oy * unit;
      const flare = flareAt(wave, x, box.w);
      y += Math.sin(t * 14 - (i + j) * 0.6) * flare * RIPPLE_PX;
      const [bx, by] = bend(probe, x, y);
      x += bx;
      y += by;
      pts.push({ x, y, a: fade(x, y) });
    }
  }
  ctx.lineWidth = 1;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    const col = k % LATTICE_COLS;
    const right = col < LATTICE_COLS - 1 ? pts[k + 1] : null;
    const down = k + LATTICE_COLS < pts.length ? pts[k + LATTICE_COLS] : null;
    for (const q of [right, down]) {
      if (!q) continue;
      ctx.strokeStyle = `rgba(${ink.line},${clamp((0.07 * Math.min(p.a, q.a) + 0.03 * c) * ink.gain, 0, 1).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
  }
  for (const p of pts) {
    ctx.fillStyle = `rgba(${ink.ice},${clamp(p.a * (0.3 + 0.2 * c), 0, 1).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 0 right behind the copy, 1 clear of it: glyphs dim where the words sit and never fade out entirely. */
function copyHaze(box: Box, x: number, y: number): number {
  const { copy } = box;
  const dx = Math.max(0, Math.abs(x - (copy.x + copy.w / 2)) - copy.w / 2) / (copy.w * 0.3);
  const dy = Math.max(0, Math.abs(y - (copy.y + copy.h / 2)) - copy.h / 2) / (copy.h * 0.3);
  return CODE_HAZE + (1 - CODE_HAZE) * (1 - Math.exp(-(dx * dx + dy * dy)));
}

/** Glyph alpha: brighter at the stage edges, dimmer behind the copy, flashing as the release wave passes. */
function codeAlpha(box: Box, x: number, y: number, fade: number, c: number, wave: Wavefront, probe: Probe): number {
  const xEdge = clamp(1 - x / (box.w * 0.22), 0, 1);
  const yEdge = clamp(1 - Math.min(y, box.h - y) / (box.h * 0.12), 0, 1);
  const edge = Math.max(xEdge, yEdge);
  const lit = 1 + 2 * near(probe, x, y);
  const body = (CODE_BASE + 0.14 * c) * fade * copyHaze(box, x, y) * (1 + CODE_EDGE * edge) * lit;
  return clamp(body * ink.gain + 0.9 * flareAt(wave, x, box.w), 0, 1);
}

/** One glyph at (x0, y0) bowed by the pointer; tokens are texture, never words about him. */
function glyphAt(ctx: CanvasRenderingContext2D, box: Box, x0: number, y0: number, token: string, c: number, wave: Wavefront, probe: Probe, fade: number, bright: boolean): void {
  const [bx, by] = bend(probe, x0, y0);
  const x = x0 + bx;
  const y = y0 + by;
  ctx.fillStyle = `rgba(${bright ? ink.ice : ink.line},${codeAlpha(box, x, y, fade, c, wave, probe).toFixed(3)})`;
  ctx.fillText(token, x, y);
}

/**
 * Binary and code glyphs stream right across the stage, a dense field of rows, bowed by the pointer.
 * Texture, not text: tokens are digits, hex bytes and short syntax marks, never words about him.
 */
function drawRows(ctx: CanvasRenderingContext2D, box: Box, t: number, c: number, wave: Wavefront, rows: Row[], probe: Probe): void {
  const span = box.w * CODE_SPAN;
  const period = span + CODE_MARGIN * 2;
  const step = (box.h * 0.84) / (CODE_ROWS - 1);
  rows.forEach((row, i) => {
    const y0 = box.h * 0.08 + i * step;
    for (let k = 0; k < CODE_PER_ROW; k++) {
      const x0 = ((row.phase + (k * period) / CODE_PER_ROW + t * row.speed * (1 + CODE_SPEED * c)) % period) - CODE_MARGIN;
      const fade = clamp((x0 + CODE_MARGIN) / CODE_MARGIN, 0, 1) * clamp((span - x0) / (span * 0.4), 0, 1);
      if (fade <= 0) continue;
      const token = CODE_TOKENS[(row.tok + k * 7) % CODE_TOKENS.length];
      glyphAt(ctx, box, x0, y0, token, c, wave, probe, fade, k % 4 === 0);
    }
  });
}

/**
 * Columns of code rain in depth, flanking his head (never on its axis): each column falls and its
 * tokens flicker, like a compute trace being read. The columns sit at fixed offsets from --fig-x.
 */
function drawRain(ctx: CanvasRenderingContext2D, box: Box, t: number, c: number, wave: Wavefront, figX: number, probe: Probe): void {
  const step = box.h / RAIN_ROWS;
  const flick = Math.floor(t * 3);
  RAIN_OFFSETS.forEach((off, col) => {
    const x0 = clamp(figX + off, 0.03, 0.97) * box.w;
    // A column that reaches the right edge would read as a separate panel: it dissolves before the edge.
    const edgeFade = clamp((RAIN_EDGE_END * box.w - x0) / (box.w * RAIN_EDGE_FEATHER), 0, 1);
    if (edgeFade <= 0) return;
    const phase = col * 137.5;
    for (let k = 0; k < RAIN_ROWS; k++) {
      const y0 = (((k * step + phase + t * RAIN_SPEED * (1 + CODE_SPEED * c)) % box.h) + box.h) % box.h;
      const token = CODE_TOKENS[(col * 5 + k * 3 + flick) % CODE_TOKENS.length];
      glyphAt(ctx, box, x0, y0, token, c, wave, probe, edgeFade, col % 2 === 0 && k % 5 === 0);
    }
  });
}

/**
 * HUD: soft measurement rings around the name, and a fine tick ruler at the left edge on dark only. In light
 * the ruler read as a column of divider dashes, which the no-dividing-lines rule forbids.
 */
function drawHud(ctx: CanvasRenderingContext2D, box: Box, t: number, c: number, flare: number): void {
  const { h: H, name } = box;
  const m = HUD_INSET;
  if (!ink.light) {
    ctx.strokeStyle = `rgba(${ink.line},0.1)`; // faint: the ticks must not read as a rule
    for (let y = m * 2, k = 0; y < H - m * 2; y += 12, k++) {
      const len = k % 5 === 0 ? 10 : 4;
      ctx.beginPath();
      ctx.moveTo(m, y);
      ctx.lineTo(m + len, y);
      ctx.stroke();
    }
  }
  const nx = name.x + name.w / 2;
  const ny = name.y + name.h / 2;
  for (let k = 0; k < 3; k++) {
    const r = name.w * (0.62 + k * 0.28);
    const start = t * (0.25 + 0.12 * k) * (k % 2 ? -1 : 1);
    ctx.strokeStyle = `rgba(${ink.line},${(0.12 + 0.1 * c).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(nx, ny, r, start, start + 0.9);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(nx, ny);
  ctx.scale(1, 0.34);
  ctx.rotate(t * 0.05);
  ctx.setLineDash([2, 10]);
  ctx.strokeStyle = `rgba(${ink.line},${(0.2 + 0.1 * c).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(0, 0, name.w * (0.72 + 0.05 * flare), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Soft light that follows the pointer across the field. */
function drawPointerGlow(ctx: CanvasRenderingContext2D, probe: Probe): void {
  if (probe.presence <= 0) return;
  const r = probe.radius;
  const grad = ctx.createRadialGradient(probe.x, probe.y, 0, probe.x, probe.y, r);
  grad.addColorStop(0, `rgba(${ink.ice},${(POINTER_GLOW * probe.presence).toFixed(3)})`);
  grad.addColorStop(1, `rgba(${ink.line},0)`);
  ctx.save();
  ctx.globalCompositeOperation = ink.blend;
  ctx.fillStyle = grad;
  ctx.fillRect(probe.x - r, probe.y - r, r * 2, r * 2);
  ctx.restore();
}

interface Frame { t: number; wave: Wavefront; probe: Probe; dpr: number }

function draw(ctx: CanvasRenderingContext2D, st: FieldState, f: Frame): void {
  const box = st.box;
  if (!box) return;
  ink = inkNow();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  drawAurora(ctx, box.w, box.h, f.t, st.charge);
  drawLattice(ctx, box, f.t, st.charge, f.wave, f.probe);
  drawQuantum(ctx, box.w, box.h, f.t, st.charge, f.wave ? f.wave.flare : 0);
  ctx.font = CODE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawRows(ctx, box, f.t, st.charge, f.wave, st.rows, f.probe);
  drawRain(ctx, box, f.t, st.charge, f.wave, st.figX, f.probe);
  drawHud(ctx, box, f.t, st.charge, f.wave ? f.wave.flare : 0);
  drawPointerGlow(ctx, f.probe);
}

function makeRows(): Row[] {
  return Array.from({ length: CODE_ROWS }, () => ({
    phase: Math.random() * 1e4,
    speed: 18 + Math.random() * 26,
    tok: Math.floor(Math.random() * CODE_TOKENS.length),
  }));
}

/**
 * Mounts the field behind `copy`. Its geometry follows the copy (lattice) and the name (rings), and
 * it reads the same charge and release events as the name, so the whole left side answers together.
 */
export function mountHeroField(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  copy: HTMLElement,
  name: HTMLElement,
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const reduce = prefersReducedMotion();
  const pointer: HeroPointer = heroPointer(stage);
  const st: FieldState = { figX: 0.5, charge: 0, target: 0, wave: null, box: null, dpr: 1, rows: makeRows(), last: performance.now() };

  const loop: Loop = createLoop(canvas, (now) => {
    const dt = reduce ? 0 : clamp((now - st.last) / 1000, 0, DT_CAP);
    st.last = now;
    st.charge += (st.target - st.charge) * Math.min(1, dt * CHARGE_EASE);
    easePointer(pointer, dt);
    const wave = st.box ? waveAt(st, now, st.box.w) : null;
    const probe = pointerProbe(stage, pointer, st);
    draw(ctx, st, { t: reduce ? 0 : now / 1000, wave, probe, dpr: st.dpr });
  });

  const measure = (): void => {
    const origin = stage.getBoundingClientRect();
    const w = origin.width;
    const h = origin.height;
    if (w < 2 || h < 2) return;
    st.box = { w, h, copy: relRect(copy, origin), name: relRect(name, origin) };
    // The engine's figure sets --fig-x per breakpoint; the rain columns follow it so they flank his head.
    const sing = stage.querySelector<HTMLElement>('.m2c-sing');
    const figX = sing ? parseFloat(getComputedStyle(sing).getPropertyValue('--fig-x')) : NaN;
    st.figX = Number.isFinite(figX) ? clamp(figX, 0, 1) : 0.5;
    st.dpr = devicePixelRatioCapped();
    canvas.width = Math.round(w * st.dpr);
    canvas.height = Math.round(h * st.dpr);
    loop.request();
  };

  const onCharge = (e: Event): void => {
    st.target = chargeLevel(e);
    loop.request();
  };
  const onRelease = (e: Event): void => {
    if (reduce) return;
    st.wave = { t0: performance.now(), amp: releaseStrength(e) };
    loop.request();
  };
  window.addEventListener('m2c:charge', onCharge);
  window.addEventListener('m2c:release', onRelease);
  const stopPointer = onPointerChange(stage, () => loop.request());
  const stopStage = onResize(stage, measure);
  const stopCopy = onResize(copy, measure);
  const stopInk = onInkChange(() => loop.request());
  if (document.fonts) void document.fonts.ready.then(measure);

  return () => {
    window.removeEventListener('m2c:charge', onCharge);
    window.removeEventListener('m2c:release', onRelease);
    stopPointer();
    stopStage();
    stopCopy();
    stopInk();
    loop.stop();
  };
}

/** The pointer in stage px for this frame. Its radius scales with the stage width. */
function pointerProbe(stage: HTMLElement, pointer: HeroPointer, st: FieldState): Probe {
  const radius = (st.box?.w ?? 0) * POINTER_RADIUS;
  if (pointer.presence <= 0) return { x: 0, y: 0, presence: 0, radius };
  const origin = stage.getBoundingClientRect();
  return { x: pointer.x - origin.left, y: pointer.y - origin.top, presence: pointer.presence, radius: Math.max(1, radius) };
}
