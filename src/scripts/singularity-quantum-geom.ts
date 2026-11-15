// Shared 3D for the quantum scene behind him. Points are placed in their own space, turned by a yaw and a
// pitch, then projected with perspective onto his figure's plane (figure px). The depth comes back with each
// point, so the far side of an object can be drawn dimmer than the near side.
import type { Ink } from './singularity-ink';
import type { Pt } from './singularity-math';
import type { Rgb } from './singularity-palette';

export type V3 = [number, number, number];

/** A view: a yaw about the vertical axis, a pitch about the horizontal, the perspective distance, and the origin in figure px. */
export interface View { yaw: number; pitch: number; f: number; cx: number; cy: number }
export interface Projected { at: Pt; z: number }

/** What a quantum element draws with: the clock, the ink, the device ratio, the charge, and the figure-to-screen map. */
export interface QCtx {
  t: number; ink: Ink; dpr: number; charge: number;
  map: (a: Pt) => Pt;
}

export function project(v: View, p: V3): Projected {
  const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
  const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy; // yaw
  const y2 = p[1] * cp - z1 * sp, z2 = p[1] * sp + z1 * cp; // pitch
  const k = v.f / (v.f + z2);
  return { at: [v.cx + x1 * k, v.cy + y2 * k], z: z2 };
}

/** Brightness factor for a depth z in a volume of radius R: the near side at full strength, the far side at 40%. */
export function depthI(z: number, R: number): number {
  return 0.4 + 0.6 * Math.min(1, Math.max(0, (z / R + 1) / 2));
}

/** A circle of radius r in the plane spanned by unit vectors u and v, from angle a0 to a1, in n segments. */
export function ring3(r: number, n: number, u: V3, v: V3, a0 = 0, a1 = Math.PI * 2): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, c = Math.cos(a) * r, s = Math.sin(a) * r;
    pts.push([u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s]);
  }
  return pts;
}

/** Projects a run of 3D points to device px, and returns the mean depth for shading. */
export function screenRun(c: QCtx, view: View, pts: V3[]): { s: Pt[]; z: number } {
  let z = 0;
  const s = pts.map((p) => {
    const q = project(view, p);
    z += q.z;
    return c.map(q.at);
  });
  return { s, z: pts.length ? z / pts.length : 0 };
}

/** Pulls a colour toward white by k, for a hot core. */
export function hot(rgb: Rgb, k: number): Rgb {
  return [rgb[0] + (1 - rgb[0]) * k, rgb[1] + (1 - rgb[1]) * k, rgb[2] + (1 - rgb[2]) * k];
}
