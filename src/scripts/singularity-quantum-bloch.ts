// Bloch spheres: a qubit's state drawn as a vector on a sphere. The vector precesses about the vertical axis
// and its tilt breathes, and a faint cone traces where its tip can go. Each sphere is a wireframe of three
// great circles. The tips are returned so the entanglement threads can join them.
import { CYAN, ICE, INDIGO, VIOLET } from './singularity-palette';
import type { Pt } from './singularity-math';
import { depthI, project, ring3, screenRun, type QCtx, type V3, type View } from './singularity-quantum-geom';

export interface BlochSpec { x: number; y: number; R: number; yaw: number; w: number; ph: number }

const GREAT_SEGS = 64, CONE_SEGS = 40;
const TILT_BASE = 0.9, TILT_SWING = 0.5; // radians from the vertical pole, and how far the tilt breathes
const TRAIL_SEGS = 48, TRAIL_ARC = 2.4; // the precession trail: its segments, and how far back in phase it reaches (radians)

export class Blochs {
  constructor(private readonly specs: BlochSpec[]) {}

  /** Draws the first n spheres and returns each state tip in figure px. */
  draw(c: QCtx, n: number): Pt[] {
    const tips: Pt[] = [];
    for (let i = 0; i < n && i < this.specs.length; i++) tips.push(this.sphere(c, this.specs[i], i));
    return tips;
  }

  private sphere(c: QCtx, s: BlochSpec, i: number): Pt {
    const view: View = { yaw: s.yaw + c.t * 0.12, pitch: -0.42, f: 900, cx: s.x, cy: s.y };
    const R = s.R;
    // three great circles: the equator, and two meridians at right angles
    const greats: V3[][] = [ring3(R, GREAT_SEGS, [1, 0, 0], [0, 0, 1]), ring3(R, GREAT_SEGS, [1, 0, 0], [0, 1, 0]), ring3(R, GREAT_SEGS, [0, 0, 1], [0, 1, 0])];
    for (const g of greats) {
      const run = screenRun(c, view, g);
      c.ink.path(run.s, 1.3 * c.dpr, 0.6 * depthI(run.z, R), CYAN);
    }
    // the state: a tilt that breathes and a phase that precesses
    const theta = TILT_BASE + TILT_SWING * Math.sin(c.t * 0.6 + s.ph), phi = s.w * c.t + s.ph;
    const tipAt = (p: number): V3 => [R * Math.sin(theta) * Math.cos(p), R * Math.cos(theta), R * Math.sin(theta) * Math.sin(p)];
    // the cone the tip sweeps as it precesses
    const cone: V3[] = [];
    for (let k = 0; k <= CONE_SEGS; k++) {
      const a = (k / CONE_SEGS) * Math.PI * 2;
      cone.push([R * Math.sin(theta) * Math.cos(a), R * Math.cos(theta), R * Math.sin(theta) * Math.sin(a)]);
    }
    const coneRun = screenRun(c, view, cone);
    c.ink.path(coneRun.s, 1.2 * c.dpr, 0.7 * depthI(coneRun.z, R), VIOLET);
    // the state is a curved precession trail, not a straight stick: its tail fades as the tip swings round
    const trail: V3[] = [];
    for (let k = 0; k <= TRAIL_SEGS; k++) trail.push(tipAt(phi - (1 - k / TRAIL_SEGS) * TRAIL_ARC));
    const tr = screenRun(c, view, trail).s;
    const mid = Math.floor(TRAIL_SEGS / 2);
    c.ink.path(tr.slice(0, mid + 1), 1.6 * c.dpr, 0.25, ICE);
    c.ink.path(tr.slice(mid), 2.4 * c.dpr, 0.95, ICE);
    const at = tr[tr.length - 1];
    c.ink.point(at[0], at[1], 7 * c.dpr, ICE, 0.9);
    c.ink.point(at[0], at[1], 22 * c.dpr, INDIGO, 0.18 + 0.1 * Math.sin(c.t * 2 + i));
    return project(view, tipAt(phi)).at;
  }
}
