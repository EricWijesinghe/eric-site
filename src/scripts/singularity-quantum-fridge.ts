// The holographic dilution refrigerator: a stack of circular plates, coaxial spiral lines and light pulses
// that climb them. It hangs behind him and to his right, in its own space, so no wire crosses his head.
import { frac } from './singularity-math';
import { CYAN, VIOLET, ICE, INDIGO } from './singularity-palette';
import { depthI, project, ring3, screenRun, type QCtx, type V3, type View } from './singularity-quantum-geom';

const CX = 1215, CY = 560; // figure px: the chandelier's axis, right of his head
const R = 230, H = 860; // plate radius at the top, and the stack's height
const TAPER = 0.28; // the bottom plate is this much smaller than the top one
const F = 1100; // perspective distance
const PLATE_SEGS = 72, SPIRAL_SEGS = 90, TURNS = 1.4;
const PULSE_RATE = 0.12; // light pulses per second, per spiral

const radiusAt = (u: number): number => R * (1 - TAPER * u);

export class Fridge {
  /** plates: how many plates (3 at the lowest tier, 7 at the top); spirals: coaxial lines. */
  constructor(private readonly plates: number, private readonly spirals: number) {}

  draw(c: QCtx): void {
    const view: View = { yaw: 0.35 + c.t * 0.05, pitch: -0.26 + 0.05 * Math.sin(c.t * 0.23), f: F, cx: CX, cy: CY };
    const plates = this.plates;
    // plates: circles stacked along the axis, each shaded by its depth
    for (let i = 0; i < plates; i++) {
      const u = i / (plates - 1), y = H * (u - 0.5), r = radiusAt(u);
      const ring = ring3(r, PLATE_SEGS, [1, 0, 0], [0, 0, 1]).map((p): V3 => [p[0], y, p[2]]);
      const run = screenRun(c, view, ring);
      const I = 1.0 * depthI(run.z, R) * (0.75 + 0.25 * Math.sin(c.t * 0.9 + i));
      c.ink.path(run.s, 1.7 * c.dpr, I, CYAN);
    }
    // four support rods on the top plate's rim, running down to the mixing chamber
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const rod: V3[] = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8, r = radiusAt(u) * 0.96;
        rod.push([Math.cos(a) * r, H * (u - 0.5), Math.sin(a) * r]);
      }
      const run = screenRun(c, view, rod);
      c.ink.path(run.s, 1.1 * c.dpr, 0.45 * depthI(run.z, R), CYAN);
    }
    this.spiralLines(c, view);
    // the mixing chamber at the bottom: a small glow, as a point
    const base = project(view, [0, H * 0.5, 0]);
    c.ink.point(...c.map(base.at), 13 * c.dpr, ICE, 0.8 + 0.2 * Math.sin(c.t * 3));
  }

  /** Coaxial spirals wind down the stack; light pulses climb them, slowly and in turn. */
  private spiralLines(c: QCtx, view: View): void {
    for (let j = 0; j < this.spirals; j++) {
      const phi = (j * Math.PI * 2) / this.spirals;
      const pt = (u: number): V3 => {
        const a = phi + u * TURNS * Math.PI * 2 + c.t * 0.25, r = radiusAt(u) * 0.92;
        return [r * Math.cos(a), H * (u - 0.5), r * Math.sin(a)];
      };
      const pts: V3[] = [];
      for (let k = 0; k <= SPIRAL_SEGS; k++) pts.push(pt(k / SPIRAL_SEGS));
      const run = screenRun(c, view, pts);
      c.ink.path(run.s, 1.8 * c.dpr, 0.95 * depthI(run.z, R), VIOLET);
      const u = frac(c.t * PULSE_RATE + j / this.spirals);
      const q = project(view, pt(u));
      c.ink.point(...c.map(q.at), 6 * c.dpr, ICE, 0.6 + 0.4 * depthI(q.z, R));
      c.ink.point(...c.map(q.at), 14 * c.dpr, INDIGO, 0.12);
    }
  }
}
