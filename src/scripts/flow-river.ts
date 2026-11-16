// The current itself: lanes of discrete code and binary glyphs running down the page along the spine (conduit.ts).
// Glyphs are stateless conveyor slots: slot n of a lane sits at y = n * rowH + phase, and its token is a hash of
// (lane, n), so nothing is stored per glyph. No stroke, glow tube or ribbon: only sparse glyphs, a wide sparse fall
// under his figure that gathers into the current, bright in the pools between sections and a faint ghost inside them.
import { smoothstep, spineX } from './conduit-geometry';
import { chordPos, poolAt, poolIndexAt, rampAt, widthAt, type Layout } from './conduit';
import { glyphHalf, keepAlpha, type Keep } from './flow-keep';
import { mixColour, rgbStyle, type Palette } from './flow-palette';
import type { Hit, Stir } from './flow-stir';
import { TOKENS, hash } from './flow-streams';

export interface Lane {
  /** Offset across the river, -.5...5, denser at the centre. */
  u: number;
  /** Depth .4 far .. 1 near: near glyphs are larger, brighter and faster. */
  z: number;
  lambda: number;
  phi: number;
  size: number;
  rowH: number;
  speed: number;
  /** Prism: each lane changes chord at a slightly different y inside a gap. */
  shift: number;
  seed: number;
  far: number;
  near: number;
}

export interface RiverFrame {
  l: Layout;
  lanes: readonly Lane[];
  t: number;
  now: number;
  scroll: number;
  vh: number;
  pal: Palette;
  stir: Stir;
  ghosts: boolean;
  keep: Keep;
}

const TAU = Math.PI * 2;
const Z_MIN = 0.4;
const FONT_MIN_PX = 9;
// 9-13 px: at 14 the pool glyphs out-shouted the section labels next to them.
const FONT_SPAN_PX = 4;
const ROW_LEAD = 3.6;
const SPEED_MIN = 30;
const SPEED_SPAN = 50;
const LAMBDA_MIN = 380;
const LAMBDA_SPAN = 520;
const SWAY = 0.16;
const SWAY_RATE = 0.15;
const PRISM_PX = 70;
const U_CURVE = 1.2;
// Charge: within 1.2 viewports of the source the current slows, then runs back toward him.
const NEAR_VH = 1.2;
const CHARGE_BRAKE = 2.2;
const NEAR_MAX_VH = 0.5;
const NEAR_RELAX = 2;
const WARP = 0.35;
const MARGIN_PX = 60;
const MIN_ALPHA = 0.02;
const EDGE_PX = 40;
const INK = { dark: [0.8, 0.2], light: [0.9, 0] } as const;
const SURGE_WIDTH = 0.8;
const SURGE_ALPHA = 0.5;
const SURGE_SIZE = 0.25;
const LENS_SCALE = 0.55;
const LENS_ALPHA = 0.5;
const FLASH_ALPHA = 0.6;
const GHOST_V = 900;
const GHOST_STEP_S = 0.016;
const GHOST_ALPHA = [0.35, 0.15] as const;
const BRIGHT = 0.5;
// Peak ink: a pool is a beat between sections, never the strongest ink on the page (light ink is denser per alpha).
const PEAK = { dark: 0.8, light: 0.7 } as const;
// Occupancy grid: a glyph brighter than OCCUPY_ALPHA never overlaps another one (overprints read as misprinted type).
const CELL_W_PX = 28;
const CELL_H_PX = 16;
const OCCUPY_ALPHA = 0.25;
// Full-alpha glyphs per pool: fewer, better-placed (round 10, O6).
const POOL_CAP = { wide: 40, phone: 18 } as const;
const PHONE_MAX_PX = 640;
const LIGHT_WEIGHT = 600;
const DARK_WEIGHT = 400;
const FONT_FAMILY = '"JetBrains Mono", ui-monospace, monospace';

/** Lanes nearest first, so a near glyph wins its cell in the occupancy grid over a far one. */
export function makeLanes(n: number, rnd: () => number): Lane[] {
  const lanes = Array.from({ length: n }, (_, i) => {
    const s = n > 1 ? -1 + (2 * i) / (n - 1) : 0;
    const z = Z_MIN + rnd() * (1 - Z_MIN);
    const zn = (z - Z_MIN) / (1 - Z_MIN);
    const size = FONT_MIN_PX + FONT_SPAN_PX * zn;
    return {
      u: 0.5 * Math.sign(s) * Math.abs(s) ** U_CURVE,
      z,
      lambda: LAMBDA_MIN + rnd() * LAMBDA_SPAN,
      phi: rnd() * TAU,
      size,
      rowH: size * ROW_LEAD,
      speed: SPEED_MIN + SPEED_SPAN * zn,
      shift: s * PRISM_PX,
      seed: Math.floor(rnd() * 2147483647),
      far: rnd() * size * ROW_LEAD,
      near: 0,
    };
  });
  return lanes.sort((a, b) => b.z - a.z);
}

/** Moves every lane's conveyor. Near the source the charge brakes and reverses it; the offset relaxes back after. */
export function stepLanes(lanes: Lane[], dt: number, charge: number, scrollV: number, vh: number): void {
  for (const ln of lanes) {
    const warp = WARP * scrollV;
    const before = ln.near;
    ln.far += (ln.speed + warp) * dt;
    if (charge > 0) {
      ln.near -= CHARGE_BRAKE * charge * ln.speed * dt;
      ln.near = Math.max(-NEAR_MAX_VH * vh, Math.min(NEAR_MAX_VH * vh, ln.near));
    } else if (before !== 0) {
      // Settle on a whole row, so no glyph is left between slots.
      const target = Math.round(before / ln.rowH) * ln.rowH;
      ln.near += (target - before) * Math.min(1, dt * NEAR_RELAX);
    }
  }
}

const hit: Hit = { dx: 0, dy: 0, flash: 0, lens: 0 };
let grid = new Uint8Array(0);

/** Claims the grid cells under a glyph box (viewport px); false when one of them is already taken. */
function claim(cols: number, rows: number, x: number, y: number, hx: number, hy: number): boolean {
  const c0 = Math.max(0, Math.floor((x - hx) / CELL_W_PX));
  const c1 = Math.min(cols - 1, Math.floor((x + hx) / CELL_W_PX));
  const r0 = Math.max(0, Math.floor((y - hy + MARGIN_PX) / CELL_H_PX));
  const r1 = Math.min(rows - 1, Math.floor((y + hy + MARGIN_PX) / CELL_H_PX));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (grid[r * cols + c]) return false;
  for (let r = r0; r <= r1; r++) grid.fill(1, r * cols + c0, r * cols + c1 + 1);
  return true;
}

function glyph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number): void {
  if (scale < 1.01) {
    ctx.fillText(text, x, y);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function paintRiver(ctx: CanvasRenderingContext2D, f: RiverFrame): void {
  const { l, scroll, vh, now, pal, stir } = f;
  const top = Math.max(l.source.y, scroll - MARGIN_PX);
  const bottom = Math.min(l.endTop, scroll + vh + MARGIN_PX);
  if (bottom <= top) return;
  const ink = pal.light ? INK.light : INK.dark;
  const ghosts = f.ghosts && Math.abs(stir.scrollV) > GHOST_V;
  const nearSpan = NEAR_VH * vh;
  // Light: ink on pale paper needs a heavier stroke to hold contrast at 9-13 px; dark stays as approved (K0).
  const weight = pal.light ? LIGHT_WEIGHT : DARK_WEIGHT;
  const peak = pal.light ? PEAK.light : PEAK.dark;
  const cap = l.w <= PHONE_MAX_PX ? POOL_CAP.phone : POOL_CAP.wide;
  const full = new Uint16Array(l.gaps.length);
  const cols = Math.ceil(l.w / CELL_W_PX);
  const rows = Math.ceil((vh + 2 * MARGIN_PX) / CELL_H_PX);
  if (grid.length < cols * rows) grid = new Uint8Array(cols * rows);
  grid.fill(0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const ln of f.lanes) {
    ctx.font = `${weight} ${ln.size.toFixed(1)}px ${FONT_FAMILY}`;
    const zn = (ln.z - Z_MIN) / (1 - Z_MIN);
    const inkAlpha = ink[0] + ink[1] * zn;
    const n0 = Math.floor((top - ln.far - Math.max(0, ln.near)) / ln.rowH) - 1;
    const n1 = Math.ceil((bottom - ln.far - Math.min(0, ln.near)) / ln.rowH) + 1;
    for (let n = n0; n <= n1; n++) {
      const y0 = n * ln.rowH + ln.far;
      const y = y0 + (1 - smoothstep(0, nearSpan, y0 - l.source.y)) * ln.near;
      if (y < top || y > bottom) continue;
      const ramp = rampAt(y, l);
      if (ramp < MIN_ALPHA) continue;
      const g = poolAt(y, l);
      const surge = stir.surgeAt(y, now, l.source.y);
      const width = widthAt(y, g, l) * (1 + SURGE_WIDTH * surge);
      const sway = SWAY * Math.sin((TAU * y) / ln.lambda + ln.phi + SWAY_RATE * f.t);
      const x = spineX(l.spine, y) + width * (ln.u + sway);
      stir.at(x, y, now, scroll, hit);
      // Nothing at the screen edge, at any width: glyphs dissolve over the outer EDGE_PX.
      const edge = smoothstep(0, EDGE_PX, x + hit.dx) * smoothstep(0, EDGE_PX, l.w - x - hit.dx);
      const env = l.ghost + (1 - l.ghost) * g;
      const raw = edge * Math.min(peak, env * ramp * inkAlpha + SURGE_ALPHA * surge + LENS_ALPHA * hit.lens + FLASH_ALPHA * hit.flash * ramp);
      if (raw < MIN_ALPHA) continue;
      const pick = hash(ln.seed, n, 0);
      const text = TOKENS[Math.floor(pick * TOKENS.length)] ?? '0';
      const scale = (1 + SURGE_SIZE * surge) * (1 + LENS_SCALE * hit.lens);
      const [hx, hy] = glyphHalf(text, ln.size * scale);
      const gx = x + hit.dx;
      const gy = y + hit.dy - scroll;
      const alpha = keepAlpha(f.keep, raw, gx, gy + scroll, hx, hy);
      if (alpha < MIN_ALPHA) continue;
      if (alpha > OCCUPY_ALPHA) {
        const pool = alpha > BRIGHT ? poolIndexAt(y, l) : -1;
        if (pool >= 0 && (full[pool] ?? 0) >= cap) continue;
        if (!claim(cols, rows, gx, gy, hx, hy)) continue;
        if (pool >= 0) full[pool] = (full[pool] ?? 0) + 1;
      }
      const chord = pal.at(chordPos(y, ln.shift, l));
      const base = hash(ln.seed, n, 1) < 0.5 ? chord.a : chord.b;
      ctx.fillStyle = rgbStyle(hit.lens > 0 ? mixColour(base, chord.b, hit.lens) : base);
      ctx.globalAlpha = alpha;
      glyph(ctx, text, gx, gy, scale);
      if (ghosts && alpha > BRIGHT) {
        GHOST_ALPHA.forEach((a, k) => {
          ctx.globalAlpha = alpha * a;
          glyph(ctx, text, gx, gy + stir.scrollV * GHOST_STEP_S * (k + 1), scale);
        });
      }
    }
  }
  ctx.globalAlpha = 1;
}
