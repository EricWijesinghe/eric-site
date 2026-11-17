// Quantum computing behind him: a dilution-refrigerator chandelier on his right, Bloch spheres around his
// body, a qubit chip under him with its ripples, entanglement threads and circuit wires. It is drawn into the
// ribbon layer behind the figure, in figure px, so it moves and scales with him. Nothing here is text.
// Density follows the GPU tier (QUANTUM_DENSITY in singularity-config): the low tier keeps the main shapes.
import type { Pt } from './singularity-math';
import { Blochs, type BlochSpec } from './singularity-quantum-bloch';
import { Fridge } from './singularity-quantum-fridge';
import type { QCtx } from './singularity-quantum-geom';
import { Chip, Threads, Wires } from './singularity-quantum-circuit';

const FOCUS: Pt = [900, 820]; // figure px: the point the quantum layer grows from, behind his right shoulder
const SCALE = 1.2; // the layer is this many times its drawn size (shape only; line weights stay in device px)

// figure px: the spheres sit around his body, clear of his head and the copy on the left
const SPHERES: BlochSpec[] = [
  { x: 1200, y: 430, R: 84, yaw: -0.5, w: -0.9, ph: 1.3 }, // right of his head, never above it (figure px)
  { x: 610, y: 905, R: 92, yaw: 0.4, w: 0.7, ph: 0.3 },
  { x: 360, y: 1010, R: 70, yaw: 0.9, w: 1.1, ph: 2.1 },
];

export class Quantum {
  private readonly fridge: Fridge;
  private readonly blochs: Blochs;
  private readonly chip: Chip;
  private readonly threads: Threads;
  private readonly wires: Wires;
  private readonly spheres: number;

  /** density: the share of the elements to draw, 0..1, from the GPU tier. seed fixes the thread pairs. */
  constructor(seed: number, density: number) {
    const side = density > 0.8 ? 5 : 4;
    this.spheres = Math.max(1, Math.round(SPHERES.length * density));
    this.fridge = new Fridge(Math.max(3, Math.round(7 * density)), Math.max(1, Math.round(3 * density)));
    this.blochs = new Blochs(SPHERES);
    this.chip = new Chip(side, Math.max(1, Math.round(3 * density)));
    this.threads = new Threads(seed, Math.round(10 * density), side * side + this.spheres);
    this.wires = new Wires(Math.max(1, Math.round(3 * density)));
  }

  /** Draws the scene for this frame. Everything it emits is kept clear of his head by the ribbon shader. */
  draw(c: QCtx): void {
    // enlarged about the focus below his right shoulder, so the chandelier and chip read at a glance
    const big: QCtx = { ...c, map: (a: Pt): Pt => c.map([FOCUS[0] + (a[0] - FOCUS[0]) * SCALE, FOCUS[1] + (a[1] - FOCUS[1]) * SCALE]) };
    this.fridge.draw(big);
    const tips: Pt[] = this.blochs.draw(big, this.spheres);
    const qubits = this.chip.draw(big);
    this.threads.draw(big, [...qubits, ...tips]);
    this.wires.draw(big, qubits);
  }
}
