// Sphere maths for the "Work together" globe: points, great-circle arcs, and the view transform in both
// directions. Kept apart from the drawing so the projection has one definition.

export type V3 = [number, number, number];

/** The view: yaw turns the world, pitch tilts it toward the viewer; cx, cy, r place it on the canvas. */
export interface View { cx: number; cy: number; r: number; yaw: number; pitch: number }

/** n points spread evenly over the unit sphere (Fibonacci lattice), so the dots have no seams or poles. */
export function fib(n: number): V3[] {
  const out: V3[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), t = ga * i;
    out.push([Math.cos(t) * r, y, Math.sin(t) * r]);
  }
  return out;
}

export const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const angle = (a: V3, b: V3): number => Math.acos(Math.max(-1, Math.min(1, dot3(a, b))));
export const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** A point on the great circle from a to b at t, lifted off the surface by `lift` at mid-flight. */
export function slerp(a: V3, b: V3, t: number, lift: number): V3 {
  const d = angle(a, b) || 1e-6;
  const s = Math.sin(d), wa = Math.sin((1 - t) * d) / s, wb = Math.sin(t * d) / s, h = 1 + lift * Math.sin(Math.PI * t);
  return [(a[0] * wa + b[0] * wb) * h, (a[1] * wa + b[1] * wb) * h, (a[2] * wa + b[2] * wb) * h];
}

/** World -> view space (unit radius): yaw about y, then pitch about x. z > 0 faces the viewer; a positive
    pitch tips the top toward the viewer, so we look down on the world and its orbits. */
export function toView(p: V3, v: View): V3 {
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
  const x = p[0] * c - p[2] * s, z0 = p[0] * s + p[2] * c;
  const ct = Math.cos(v.pitch), st = Math.sin(v.pitch);
  return [x, p[1] * ct + z0 * st, -p[1] * st + z0 * ct];
}

/** View space -> world: the exact inverse of toView. */
export function fromView(q: V3, v: View): V3 {
  const ct = Math.cos(v.pitch), st = Math.sin(v.pitch);
  const y = q[1] * ct - q[2] * st, z0 = q[1] * st + q[2] * ct;
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
  return [q[0] * c + z0 * s, y, -q[0] * s + z0 * c];
}

/** Canvas position and view depth of a world point. */
export function project(p: V3, v: View): V3 {
  const q = toView(p, v);
  return [v.cx + q[0] * v.r, v.cy + q[1] * v.r, q[2]];
}

/** The same for a point already in view space (satellites, the ring: they do not turn with the world). */
export const projectView = (q: V3, v: View): V3 => [v.cx + q[0] * v.r, v.cy + q[1] * v.r, q[2]];

/** True when a view-space point is hidden behind the sphere. */
export const occluded = (q: V3): boolean => q[2] < 0 && q[0] * q[0] + q[1] * q[1] < 1;

/** The world point under a canvas position, or null off the sphere. */
export function unproject(x: number, y: number, v: View): V3 | null {
  const qx = (x - v.cx) / v.r, qy = (y - v.cy) / v.r, d = qx * qx + qy * qy;
  if (d > 1) return null;
  return fromView([qx, qy, Math.sqrt(1 - d)], v);
}

/** A tilted circle in view space: the ring and the satellite orbits. a is the angle along it. */
export function orbitPoint(a: number, radius: number, height: number, tilt: number): V3 {
  const x = Math.cos(a) * radius, z0 = Math.sin(a) * radius;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  return [x, height * ct + z0 * st, -height * st + z0 * ct];
}

/** Self-check: fromView undoes toView (run once at mount; a wrong inverse would misplace every tap). */
export function checkInverse(): boolean {
  const v: View = { cx: 0, cy: 0, r: 1, yaw: 0.7, pitch: 0.38 };
  const p = norm([0.3, -0.5, 0.8]);
  const back = fromView(toView(p, v), v);
  return Math.hypot(back[0] - p[0], back[1] - p[1], back[2] - p[2]) < 1e-9;
}
