// The tremor around him (Eric round 10, O5: "everything around needed to be little shakey like when energizing"). The
// engine shifts every layer behind him (the void, the disk, the network, the quantum layer, the glyph field) by this
// offset and never the figure, so his surroundings tremble with the page while he stays still: the calm centre.
// The curve is the page's own (energy-shake.ts): barely there at the first touch, strong but readable at full charge,
// then one short damped jolt on release, scaled by its power. Reduced motion: no offset at all.
import type { Pt } from './singularity-math';

const AMP_LOW = 0.5, AMP_FULL = 3; // CSS px, as energy-shake.ts
const AMP_CURVE = 1.6;
const MIN_LEVEL = 0.02;
const STEP_S = 0.022; // a new offset about 45 times a second, whatever the display's refresh rate
const JOLT_PX = 3.4, JOLT_MAX_PX = 8; // per unit of release power, and its ceiling
const JOLT_S = 0.42, JOLT_TAU_S = 0.1, JOLT_HZ = 9;

export class Tremor {
  private jt0 = -1e9;
  private jPx = 0;
  private dir: Pt = [0, 0];
  private last = -1e9;
  private n: Pt = [0, 0];

  constructor(private readonly off: boolean) {}

  /** A release: one swing along a random direction, `power` in release-strength units (about 0.15 to 1.6). */
  jolt(t: number, power: number): void {
    const a = Math.random() * Math.PI * 2;
    this.jt0 = t;
    this.jPx = Math.min(JOLT_MAX_PX, JOLT_PX * power);
    this.dir = [Math.cos(a), Math.sin(a)];
  }

  /** The offset for this frame, device px. */
  at(t: number, charge: number, dpr: number): Pt {
    if (this.off) return [0, 0];
    const amp = charge > MIN_LEVEL ? AMP_LOW + (AMP_FULL - AMP_LOW) * charge ** AMP_CURVE : 0;
    const jt = t - this.jt0;
    const kick = jt >= 0 && jt < JOLT_S ? this.jPx * Math.exp(-jt / JOLT_TAU_S) * Math.cos(2 * Math.PI * JOLT_HZ * jt) : 0;
    if (!amp && !kick) return [0, 0];
    if (!amp) this.n = [0, 0]; // a release settles the tremor at once; only the jolt is left
    else if (t - this.last >= STEP_S || t < this.last) {
      this.last = t;
      this.n = [(Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp];
    }
    return [(this.n[0] + this.dir[0] * kick) * dpr, (this.n[1] + this.dir[1] * kick) * dpr];
  }
}
