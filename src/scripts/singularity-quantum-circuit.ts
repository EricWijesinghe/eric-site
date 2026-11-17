// The quantum chip and its circuit: a qubit lattice with glowing couplers and ripples that cross its plane,
// the entanglement threads that join qubits to the Bloch tips, and the circuit wires that run from the
// refrigerator's base to the chip, with gate shapes and pulses travelling along them. Shapes only, no letters.
import { filament, roundedRect } from './singularity-curve';
import { frac, rng, type Pt } from './singularity-math';
import { CYAN, ICE, INDIGO, MAGENTA, type Rgb, VIOLET } from './singularity-palette';
import { depthI, project, ring3, screenRun, type QCtx, type V3, type View } from './singularity-quantum-geom';

const CHIP = { cx: 1000, cy: 1090, hx: 330, hz: 150, f: 1000, pitch: -1.05 }; // figure px; chip half sizes
const RIPPLE_MAX = 330; // world px a ripple travels before it fades
const RIPPLE_SEGS = 56;
const THREAD_SEGS = 40, WIRE_SEGS = 48;
const WIRE_FROM: Pt = [1215, 1000]; // the refrigerator's base, figure px
const GATE_AT = [0.3, 0.62]; // where along a wire the gates sit

interface Coupler { a: number; b: number }
interface Pair { a: number; b: number; bow: number; rgb: Rgb; ph: number }

/** An arc between two 3D points that bows upward by `lift` of their length; it stands in for a coupler. */
function arc3(a: V3, b: V3, lift: number, n: number): V3[] {
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + lift, (a[2] + b[2]) / 2];
  const pts: V3[] = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n, v = 1 - u;
    pts.push([
      v * v * a[0] + 2 * v * u * mid[0] + u * u * b[0],
      v * v * a[1] + 2 * v * u * mid[1] + u * u * b[1],
      v * v * a[2] + 2 * v * u * mid[2] + u * u * b[2],
    ]);
  }
  return pts;
}

export class Chip {
  private readonly qubits: V3[] = [];
  private readonly couplers: Coupler[] = [];
  private readonly outline: V3[];

  constructor(side: number, private readonly ripples: number) {
    const gx = (2 * CHIP.hx) / side, gz = (2 * CHIP.hz) / side;
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        this.qubits.push([(i - (side - 1) / 2) * gx, 0, (j - (side - 1) / 2) * gz]);
        const k = j * side + i;
        if (i + 1 < side) this.couplers.push({ a: k, b: k + 1 });
        if (j + 1 < side) this.couplers.push({ a: k, b: k + side });
      }
    }
    this.outline = roundedRect([0, 0], CHIP.hx * 0.98, CHIP.hz * 0.98, 70, 8).map((p): V3 => [p[0], 0, p[1]]);
  }

  /** Draws the chip, its couplers and ripples. Returns each qubit in figure px. */
  draw(c: QCtx): Pt[] {
    const view: View = { yaw: 0.12 + 0.03 * Math.sin(c.t * 0.2), pitch: CHIP.pitch, f: CHIP.f, cx: CHIP.cx, cy: CHIP.cy };
    const at = (p: V3) => project(view, p);
    // a soft edge (no hard border): a wide, faint glow only
    const edge = screenRun(c, view, this.outline);
    c.ink.path(edge.s, 4 * c.dpr, 0.3, INDIGO);
    // couplers: each lights for a moment as a pulse runs along it, in turn across the chip
    this.couplers.forEach((k, idx) => {
      const pts = arc3(this.qubits[k.a], this.qubits[k.b], 18, 10);
      const run = screenRun(c, view, pts);
      const u = frac(c.t * 0.45 + idx * 0.37), g = Math.min(pts.length - 1, Math.floor(u * pts.length));
      c.ink.path(run.s, 1.1 * c.dpr, 0.5 * depthI(run.z, CHIP.hx), CYAN);
      c.ink.point(run.s[g][0], run.s[g][1], 4.5 * c.dpr, ICE, 0.9);
    });
    // qubits: points that breathe out of step with one another
    const fig: Pt[] = [];
    this.qubits.forEach((q, i) => {
      const p = at(q);
      fig.push(p.at);
      const d = c.map(p.at), b = 0.5 + 0.5 * Math.sin(c.t * 1.8 + i * 1.3);
      c.ink.point(d[0], d[1], 4.6 * c.dpr * depthI(p.z, CHIP.hx), CYAN, 0.6 + 0.4 * b);
    });
    // ripples across the chip plane: two sources, their rings interfering where they overlap
    for (let s = 0; s < 2; s++) {
      const src: V3 = s === 0 ? [-CHIP.hx * 0.35, 0, -CHIP.hz * 0.2] : [CHIP.hx * 0.4, 0, CHIP.hz * 0.25];
      const rgb = s === 0 ? INDIGO : MAGENTA;
      for (let k = 0; k < this.ripples; k++) {
        const R = frac(c.t * 0.2 + k / this.ripples + s * 0.5) * RIPPLE_MAX;
        const ring = ring3(R, RIPPLE_SEGS, [1, 0, 0], [0, 0, 1]).map((p): V3 => [p[0] + src[0], 0, p[2] + src[2]]);
        const run = screenRun(c, view, ring);
        c.ink.path(run.s, 1.4 * c.dpr, 0.8 * (1 - R / RIPPLE_MAX) ** 2, rgb);
      }
    }
    return fig;
  }
}

export class Threads {
  private readonly pairs: Pair[] = [];

  /** count threads, each joining two of `anchors` (the qubits and the Bloch tips), picked at random. */
  constructor(seed: number, count: number, anchors: number) {
    const rnd = rng(seed);
    const rgbs: Rgb[] = [CYAN, VIOLET, MAGENTA, INDIGO];
    for (let i = 0; i < count && anchors > 1; i++) {
      const a = Math.floor(rnd() * anchors);
      let b = Math.floor(rnd() * anchors);
      if (b === a) b = (a + 1) % anchors;
      this.pairs.push({ a, b, bow: (rnd() - 0.5) * 0.5, rgb: rgbs[i % rgbs.length], ph: rnd() * 6.28 });
    }
  }

  /** Each thread is a smooth curve that flows, with a light pulse running along it. */
  draw(c: QCtx, anchors: Pt[]): void {
    for (const p of this.pairs) {
      const A = anchors[p.a], B = anchors[p.b];
      if (!A || !B) continue;
      const fig = filament(A, B, { n: THREAD_SEGS, bow: p.bow, sway: 0.05, phase: p.ph + c.t * 1.2 });
      const dev = fig.map(c.map);
      const I = 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(c.t * 1.1 + p.ph));
      c.ink.path(dev, 1.1 * c.dpr, I, p.rgb);
      const k = Math.floor(frac(c.t * 0.3 + p.ph * 0.1) * (THREAD_SEGS + 1));
      c.ink.point(dev[k][0], dev[k][1], 3.6 * c.dpr, ICE, 0.9);
    }
  }
}

export class Wires {
  constructor(private readonly n: number) {}

  /** Wires from the refrigerator's base to chip qubits. Gate shapes sit on them; pulses run along them and light a gate as they pass. */
  draw(c: QCtx, targets: Pt[]): void {
    for (let i = 0; i < this.n && targets.length; i++) {
      const from: Pt = [WIRE_FROM[0] + (i - (this.n - 1) / 2) * 16, WIRE_FROM[1]];
      const to = targets[(i * 7) % targets.length];
      const fig = filament(from, to, { n: WIRE_SEGS, bow: (i % 2 ? 1 : -1) * 0.16, sway: 0.01, phase: 0 });
      const dev = fig.map(c.map);
      c.ink.path(dev, 1.5 * c.dpr, 0.55, VIOLET);
      const u = frac(c.t * 0.35 + i * 0.31);
      for (const g of GATE_AT) {
        const k = Math.round(g * WIRE_SEGS), gate = roundedRect(fig[k], 12, 9, 4, 3).map(c.map);
        const glow = Math.exp(-(((u - g) / 0.05) ** 2)); // the gate lights as a pulse passes through it
        c.ink.path(gate, 1.3 * c.dpr, 0.8 + 0.6 * glow, CYAN);
      }
      const at = Math.min(WIRE_SEGS, Math.floor(u * (WIRE_SEGS + 1)));
      c.ink.point(dev[at][0], dev[at][1], 4.2 * c.dpr, ICE, 0.9);
    }
  }
}
