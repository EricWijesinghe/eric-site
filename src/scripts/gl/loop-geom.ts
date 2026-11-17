// Pure geometry of the skills loop: a unit ring in a horizontal plane, turned (yaw), tipped toward the
// viewer (tilt) and rolled a little, seen through a pinhole. Shared by the build-time SVG poster and the
// live canvas, so the still and the moving loop are the same drawing. No DOM here.
import { ALL_STARS, PHASE_ARC, PHASES, RING } from '../../data/spectrum';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
/** Resting view: tilt, roll and the camera distance in ring radii. */
export const TILT = 28 * DEG;
export const ROLL = -6 * DEG;
export const FOCAL = 3.6;
/** Ring angle that faces the viewer: the near point of the ring. */
export const FRONT = -Math.PI / 2;

export interface View {
  yaw: number;
  tilt: number;
  roll: number;
  /** Ring radius in px and the screen centre of the ring. */
  r: number;
  cx: number;
  cy: number;
}

export interface Projected {
  x: number;
  y: number;
  /** Perspective scale: above 1 on the near side, below 1 on the far side. */
  s: number;
  /** Depth -1 (nearest) .. 1 (farthest), for alpha and draw order. */
  z: number;
}

/** Projects a point given in ring units: (x, z) in the ring plane, h above it. */
export function project3(x: number, h: number, z: number, v: View, out: Projected = { x: 0, y: 0, s: 1, z: 0 }): Projected {
  const st = Math.sin(v.tilt);
  const ct = Math.cos(v.tilt);
  const sy = -z * st - h * ct;
  const depth = z * ct - h * st;
  const s = FOCAL / (FOCAL + depth);
  const px = x * s;
  const py = sy * s;
  const sr = Math.sin(v.roll);
  const cr = Math.cos(v.roll);
  out.x = v.cx + (px * cr - py * sr) * v.r;
  out.y = v.cy + (px * sr + py * cr) * v.r;
  out.s = s;
  out.z = z;
  return out;
}

/** A point on the ring at ring angle theta (before yaw), lifted by h ring units, radius scaled by k. */
export function projectRing(theta: number, h: number, v: View, k = 1, out?: Projected): Projected {
  const a = theta + v.yaw;
  return project3(Math.cos(a) * k, h, Math.sin(a) * k, v, out);
}

/** Wraps an angle to (-PI, PI]. */
export function wrap(a: number): number {
  const w = ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return w === -Math.PI ? Math.PI : w;
}

/** Yaw that brings ring angle theta to the front, nearest to the current yaw so turns take the short way. */
export function yawToFront(theta: number, current: number): number {
  return current + wrap(FRONT - theta - current);
}

export const phaseOf = (theta: number): number => Math.floor((((theta % TAU) + TAU) % TAU) / PHASE_ARC) % PHASES.length;
export const phaseCentre = (p: number): number => (p + 0.5) * PHASE_ARC;

/* ---------- pluck: an analytic damped wave on the ring, no simulation ---------- */

export interface Pluck {
  theta: number;
  amp: number;
  t0: number;
}
/** Decay time (ms), crest speed (rad/ms) and packet half-width (rad) of a pluck. */
export const PLUCK_TAU = 1300;
export const PLUCK_SPEED = 0.0026;
export const PLUCK_WIDTH = 0.24;
export const PLUCK_MAX = 3;
const PLUCK_LIFE = PLUCK_TAU * 4;

const bump = (d: number): number => Math.exp(-((d / PLUCK_WIDTH) ** 2));

/** Height of the ring at angle theta at time t: two packets per pluck travelling both ways round the ring. */
export function lift(theta: number, t: number, plucks: readonly Pluck[]): number {
  let h = 0;
  for (const p of plucks) {
    const age = t - p.t0;
    if (age < 0 || age > PLUCK_LIFE) continue;
    const travel = PLUCK_SPEED * age;
    h += p.amp * Math.exp(-age / PLUCK_TAU) * (bump(wrap(theta - p.theta - travel)) + bump(wrap(theta - p.theta + travel)));
  }
  return h;
}

/** Drops spent plucks and keeps at most PLUCK_MAX, newest last. */
export function prunePlucks(plucks: Pluck[], t: number): Pluck[] {
  return plucks.filter((p) => t - p.t0 < PLUCK_LIFE).slice(-PLUCK_MAX);
}

/* ---------- the build-time poster: the same loop as an SVG still ---------- */

export const POSTER_W = 800;
export const POSTER_H = 440;
/** The poster and the first canvas frame share this view: the WRITE phase at the front. */
export const POSTER_VIEW: View = { yaw: FRONT - phaseCentre(0), tilt: TILT, roll: ROLL, r: 330, cx: POSTER_W / 2, cy: POSTER_H / 2 };
const POSTER_STEPS = 96;

export function posterPath(v: View = POSTER_VIEW): string {
  const pts: string[] = [];
  for (let i = 0; i < POSTER_STEPS; i++) {
    const p = projectRing((i / POSTER_STEPS) * TAU, 0, v);
    pts.push(`${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
  }
  return `${pts.join('')}Z`;
}

export function posterDots(v: View = POSTER_VIEW): { x: number; y: number; r: number; group: number }[] {
  const DOT_R = 4.5;
  return RING.map((s) => {
    const p = projectRing(s.angle, 0, v);
    return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), r: +(DOT_R * p.s).toFixed(2), group: s.group };
  });
}

/* ---------- DEV self-check: the loop keeps its shape when the data changes ---------- */

if (import.meta.env.DEV) {
  const names = new Set(ALL_STARS.map((s) => s.name));
  const near = projectRing(FRONT, 0, { ...POSTER_VIEW, yaw: 0 });
  const far = projectRing(-FRONT, 0, { ...POSTER_VIEW, yaw: 0 });
  const checks: [boolean, string][] = [
    [ALL_STARS.length === 26 && names.size === 26, '26 unique skills'],
    [RING.every((s) => phaseOf(s.angle) === s.phase), 'every star inside its phase arc'],
    [near.s > 1 && far.s < 1 && near.y > far.y, 'near side larger and lower than the far side'],
    [Math.abs(wrap(yawToFront(1, 5) + 1 - FRONT)) < 1e-9, 'yawToFront brings the angle to the front'],
  ];
  for (const [ok, what] of checks) if (!ok) throw new Error(`loop-geom self-check failed: ${what}`);
}
