// Pure geometry for the current (the river of glyphs, flow-river.ts): the spine through the waypoints, sampled into a
// y -> x table, and the smooth envelopes built on it. No DOM here, so it can be checked without a browser.

export interface Anchor {
  x: number;
  y: number;
}

/** Spine x sampled every `step` px of page y, from y0. */
export interface Spine {
  y0: number;
  step: number;
  xs: Float32Array;
}

export const SPINE_STEP_PX = 8;
const SAMPLES_PER_LEG = 48;

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** A soft bump: 1 at the centre, 0 at |d| >= 1, flat at both ends. (1 - d^2)^2 keeps a broad bright pool. */
export function bump(d: number): number {
  const a = Math.abs(d);
  if (a >= 1) return 0;
  const q = 1 - a * a;
  return q * q;
}

/**
 * A chain of cubics with vertical tangents at every waypoint (c1 = (Xa, Ya + dy/2), c2 = (Xb, Yb - dy/2)), so the
 * current leaves each pool straight down and weaves between them. y(t) = Ya + dy(1.5t - 1.5t^2 + t^3) has a
 * derivative >= .75 dy, so y is strictly increasing whenever the waypoints are, which the table relies on.
 */
export function sampleSpine(points: readonly Anchor[], step = SPINE_STEP_PX): Spine {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || last.y <= first.y) return { y0: first?.y ?? 0, step, xs: new Float32Array([first?.x ?? 0]) };
  const ys: number[] = [first.y];
  const xr: number[] = [first.x];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b || b.y <= a.y) continue;
    const dy = b.y - a.y;
    for (let k = 1; k <= SAMPLES_PER_LEG; k++) {
      const t = k / SAMPLES_PER_LEG;
      ys.push(a.y + dy * (1.5 * t - 1.5 * t * t + t * t * t));
      xr.push(a.x + (b.x - a.x) * (3 * t * t - 2 * t * t * t));
    }
  }
  const n = Math.floor((last.y - first.y) / step) + 1;
  const xs = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const y = first.y + i * step;
    while (j < ys.length - 2 && (ys[j + 1] ?? Infinity) < y) j++;
    const ya = ys[j] ?? y;
    const yb = ys[j + 1] ?? ya;
    const f = yb > ya ? clamp01((y - ya) / (yb - ya)) : 0;
    xs[i] = (xr[j] ?? 0) + ((xr[j + 1] ?? xr[j] ?? 0) - (xr[j] ?? 0)) * f;
  }
  if (import.meta.env.DEV) {
    for (let i = 1; i < ys.length; i++) {
      if (!((ys[i] ?? 0) > (ys[i - 1] ?? 0))) throw new Error('sampleSpine: y must be strictly increasing');
    }
  }
  return { y0: first.y, step, xs };
}

/** Spine x at page y, clamped to the table's ends. */
export function spineX(s: Spine, y: number): number {
  const f = (y - s.y0) / s.step;
  if (f <= 0) return s.xs[0] ?? 0;
  const i = Math.floor(f);
  if (i >= s.xs.length - 1) return s.xs[s.xs.length - 1] ?? 0;
  const a = s.xs[i] ?? 0;
  return a + ((s.xs[i + 1] ?? a) - a) * (f - i);
}
