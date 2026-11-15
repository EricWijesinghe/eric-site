// Smooth, organic paths for the hero's energy: a cubic Bezier bowed to one side, with a slow sway along
// its length. It replaces the old midpoint-displaced lightning, which read as jagged straight segments.
import type { Pt } from './singularity-math';

export interface CurveOpts {
  n: number; // segments; the curve has n + 1 points
  bow: number; // how far the control points lean off the chord, as a fraction of its length
  sway: number; // sideways swing along the curve, as a fraction of its length
  phase: number; // where the sway sits in its cycle; advance it with time so the thread flows
}

/** A flowing curve from a to b. Its ends are fixed; everything between them moves smoothly. */
export function filament(a: Pt, b: Pt, o: CurveOpts): Pt[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len; // unit normal to the chord
  const bow = o.bow * len;
  const c1: Pt = [a[0] + dx / 3 + nx * bow, a[1] + dy / 3 + ny * bow];
  const c2: Pt = [a[0] + (2 * dx) / 3 - nx * bow * 0.6, a[1] + (2 * dy) / 3 - ny * bow * 0.6];
  const swayPx = o.sway * len;
  const pts: Pt[] = [];
  for (let i = 0; i <= o.n; i++) {
    const u = i / o.n, v = 1 - u;
    const w0 = v * v * v, w1 = 3 * v * v * u, w2 = 3 * v * u * u, w3 = u * u * u;
    // the sway is zero at both ends, so the curve stays pinned to a and b
    const off = swayPx * Math.sin(Math.PI * u) * Math.sin(u * Math.PI * 2.2 + o.phase);
    pts.push([
      w0 * a[0] + w1 * c1[0] + w2 * c2[0] + w3 * b[0] + nx * off,
      w0 * a[1] + w1 * c1[1] + w2 * c2[1] + w3 * b[1] + ny * off,
    ]);
  }
  return pts;
}

/** A closed rounded rectangle centred on c (half sizes hw, hh; corner radius r), for gate shapes. */
export function roundedRect(c: Pt, hw: number, hh: number, r: number, perCorner = 6): Pt[] {
  const corners: [number, number, number][] = [[hw - r, -hh + r, -Math.PI / 2], [hw - r, hh - r, 0], [-hw + r, hh - r, Math.PI / 2], [-hw + r, -hh + r, Math.PI]];
  const pts: Pt[] = [];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const a = a0 + (i / perCorner) * (Math.PI / 2);
      pts.push([c[0] + cx + Math.cos(a) * r, c[1] + cy + Math.sin(a) * r]);
    }
  }
  pts.push(pts[0]);
  return pts;
}
