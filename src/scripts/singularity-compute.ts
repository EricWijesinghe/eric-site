// The world's computing, as it is drawn. Each compute node is one of four things: a chip (a 3x3 grid of cores),
// a tensor tile (4x4 cells that compute in a wave), a server tower (a column of LEDs), or a plain core. Every node
// runs its own clock, so the field computes even when nobody touches it; a release's wave lights them in the order
// it reaches them. Traces are routed with rounded bends: a quadratic curve whose control point sits on the corner of
// an elbow, so each trace turns once, smoothly, and never runs as a straight wire.
import { clamp, mix, type Pt } from './singularity-math';
import type { Ink } from './singularity-ink';
import { AZURE, CYAN, EMERALD, ICE, INDIGO, MAGENTA, TEAL, VIOLET, type Rgb } from './singularity-palette';

export const KIND = { plain: 0, chip: 1, tile: 2, tower: 3 } as const;
const CHIP_N = 3; // a chip is CHIP_N x CHIP_N cores
const TILE_N = 4; // a tensor tile is TILE_N x TILE_N cells
const TOWER_N = 6; // a server tower is TOWER_N LEDs
const PITCH_PX = 6; // grid pitch, CSS px before the device ratio and depth
const BEND_STEPS = 4; // segments in each rounded elbow
export const TRACE_PTS = BEND_STEPS + 3; // points per trace: A, the bend's two ends and its inner steps, B
export const TRACE_BEND = 9; // CSS px: the radius of each trace's rounded elbow
// Mostly cyan and teal for the computing, with the wider spectrum (F5) in the accents. His hologram stays cyan.
const PALETTE: Rgb[] = [CYAN, TEAL, CYAN, AZURE, INDIGO, VIOLET, MAGENTA, EMERALD];

export interface NodeStyle { kind: number; hue: Rgb; phase: number; rate: number }

/** A node's kind, colour and clock, drawn from the field's random stream. */
export function nodeStyle(rnd: () => number): NodeStyle {
  const r = rnd();
  const kind = r < 0.4 ? KIND.chip : r < 0.7 ? KIND.tile : r < 0.82 ? KIND.tower : KIND.plain;
  return { kind, hue: PALETTE[Math.floor(rnd() * PALETTE.length)], phase: rnd() * Math.PI * 2, rate: 1.2 + rnd() * 2.4 };
}

/** Sparse, sharp flashes: a clock that is dark most of the time, like a core between instructions. */
const beat = (t: number, rate: number, ph: number): number => {
  const b = 0.5 + 0.5 * Math.sin(t * rate + ph);
  return b * b * b;
};

export interface NodeDraw {
  x: number; y: number; near: number; lit: number; charge: number; t: number; dpr: number; alpha: number;
  style: NodeStyle;
}

/** Draws one node into the ink. `lit` is the release's wave at this node (0..1); `alpha` is its base brightness. */
export function drawNode(ink: Ink, d: NodeDraw): void {
  const { x, y, near, lit, t, dpr, style: st } = d;
  const depth = 0.55 + 0.45 * near; // nearer nodes are larger and brighter
  const hue = mixRgb(st.hue, ICE, lit);
  const pitch = PITCH_PX * dpr * depth;
  if (st.kind === KIND.chip) {
    ink.point(x, y, (10 + 18 * depth) * dpr, st.hue, 0.08 + 0.2 * lit + 0.12 * near); // the die's glow
    for (let i = 0; i < CHIP_N; i++) for (let j = 0; j < CHIP_N; j++) {
      const v = clamp(0.2 + 0.6 * beat(t, st.rate, st.phase + (i * CHIP_N + j) * 0.9) + 0.9 * lit + 0.25 * d.charge * near, 0, 1);
      ink.point(x + (j - 1) * pitch, y + (i - 1) * pitch, (1.9 + 1.8 * depth) * dpr * (0.7 + 0.5 * v), hue, clamp(d.alpha * v, 0, 1));
    }
  } else if (st.kind === KIND.tile) {
    for (let i = 0; i < TILE_N; i++) for (let j = 0; j < TILE_N; j++) {
      // a wave runs across the tile: each cell lights a little after its neighbour, so the matrix reads as computing
      const w = 0.5 + 0.5 * Math.sin(t * st.rate * 1.7 - (i + j) * 0.8 + st.phase);
      const v = clamp(0.15 + 0.7 * w * w + 0.9 * lit + 0.25 * d.charge * near, 0, 1);
      ink.point(x + (j - (TILE_N - 1) / 2) * pitch, y + (i - (TILE_N - 1) / 2) * pitch, (1.6 + 1.6 * depth) * dpr * (0.7 + 0.5 * v), hue, clamp(d.alpha * v, 0, 1));
    }
  } else if (st.kind === KIND.tower) {
    for (let k = 0; k < TOWER_N; k++) {
      const v = clamp(0.15 + 0.8 * beat(t, st.rate * 2, st.phase + k * 0.7) + 0.9 * lit, 0, 1);
      ink.point(x, y + (k - (TOWER_N - 1) / 2) * pitch * 0.9, (1.7 + 1.6 * depth) * dpr, hue, clamp(d.alpha * v, 0, 1));
    }
  } else {
    ink.point(x, y, (2.2 + 2.2 * near + 1.5 * lit) * dpr, hue, clamp(d.alpha + 0.9 * lit, 0, 1));
  }
}

/** Routes a trace from A to B: two straight legs meeting at an elbow, the corner rounded with radius r (device px). */
export function routeInto(out: Pt[], A: Pt, B: Pt, flip: number, r: number): void {
  const C: Pt = flip ? [B[0], A[1]] : [A[0], B[1]];
  const la = Math.hypot(C[0] - A[0], C[1] - A[1]) || 1, lb = Math.hypot(B[0] - C[0], B[1] - C[1]) || 1;
  const rr = Math.min(r, la / 2, lb / 2);
  const P1: Pt = [C[0] + ((A[0] - C[0]) / la) * rr, C[1] + ((A[1] - C[1]) / la) * rr];
  const P2: Pt = [C[0] + ((B[0] - C[0]) / lb) * rr, C[1] + ((B[1] - C[1]) / lb) * rr];
  put(out[0], A[0], A[1]);
  put(out[1], P1[0], P1[1]);
  for (let k = 1; k <= BEND_STEPS - 1; k++) {
    const e = k / BEND_STEPS, u = 1 - e;
    put(out[1 + k], u * u * P1[0] + 2 * u * e * C[0] + e * e * P2[0], u * u * P1[1] + 2 * u * e * C[1] + e * e * P2[1]);
  }
  put(out[BEND_STEPS + 1], P2[0], P2[1]);
  put(out[BEND_STEPS + 2], B[0], B[1]);
}

/** The point at fraction e (0..1) along a routed trace, by index: a packet's place on its trace. */
export function pointOn(route: Pt[], e: number): Pt {
  const f = clamp(e, 0, 1) * (route.length - 1), i = Math.min(route.length - 2, Math.floor(f)), u = f - i;
  return [mix(route[i][0], route[i + 1][0], u), mix(route[i][1], route[i + 1][1], u)];
}

function put(p: Pt, x: number, y: number): void {
  p[0] = x;
  p[1] = y;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}
