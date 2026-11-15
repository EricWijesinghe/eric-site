// The data field: binary and code glyphs that orbit him, rain in depth down the canvas, and burst out of his body
// on release as a spherical shock of data (Eric round 3: "I wanna codes, binaries and so much more"). Glyphs are
// decoration, never words about him. Ink drops any glyph inside his silhouette or head zone, so nothing reads as a
// line leaving him. The head zone's column cuts the rain, so none stands above his head.
import { CODE_GLYPH_FIRST, CODE_GLYPH_N } from './singularity-config';
import { clamp, frac, rng, smooth, type Pt } from './singularity-math';
import { CYAN, ICE, spectrum, type Rgb } from './singularity-palette';
import type { Ink } from './singularity-ink';

const ORBIT_N = 220; // glyph streams circling him, at depth
const RAIN_N = 130; // columns of code rain across the canvas
const RAIN_LEN = 7; // glyphs per rain column
const BURST_N = 420; // particles per release
const BURST_LIFE = [2.2, 3.2]; // seconds a burst particle lives
const BURST_SPEED = 0.42; // canvas heights per second, before drag
const BURST_DRAG = 0.8; // per second: eases the shock out to the canvas edges
const BURST_START = 0.18; // a burst starts this far (in figure units) from his centre, outside the body
const FLIP_RATE = 5; // glyph changes per second in the streams
const RAIN_PITCH = 15; // CSS px between rain glyphs
const BINARY_HEX = [0, 1, 0, 1, 2, 3, 4, 5, 6, 7]; // atlas cells: 0, 1 and the hex digits
const CODE_POOL = Array.from({ length: CODE_GLYPH_N }, (_, i) => CODE_GLYPH_FIRST + i);
const RAIN_TINT_N = 3; // rain stays in the first three spectrum colours: cyan, teal, azure

interface Orbit { seed: number; a: number; r: number; w: number; tilt: number; sz: number; rgb: Rgb }
interface Rain { x: number; ph: number; sp: number; sz: number; a: number; seed: number; rgb: Rgb }
interface Burst { x: number; y: number; vx: number; vy: number; born: number; life: number; sz: number; seed: number; rgb: Rgb }

/** The atlas cell for a stream's glyph at `step`: mostly binary and hex, with code tokens mixed in. */
function pick(seed: number, step: number): number {
  const i = Math.abs(Math.floor(seed * 97 + step));
  return i % 3 === 0 ? CODE_POOL[i % CODE_POOL.length] : BINARY_HEX[i % BINARY_HEX.length];
}

/** The release's data field and the streams that live around him, held in CPU state and drawn into the ink. */
export class DataField {
  /** Burst particles spawned since the start (the ?debug readout and the spec check it). */
  spawned = 0;
  private readonly orbit: Orbit[];
  private readonly rain: Rain[];
  private bursts: Burst[] = [];
  private readonly rnd: () => number;

  constructor(seed: number) {
    this.rnd = rng(seed);
    this.orbit = Array.from({ length: ORBIT_N }, () => ({
      seed: this.rnd() * 1000, a: this.rnd() * Math.PI * 2, r: 0.5 + this.rnd() * 0.9, w: (0.04 + this.rnd() * 0.1) * (this.rnd() < 0.5 ? -1 : 1),
      tilt: 0.28 + this.rnd() * 0.3, sz: 0.85 + this.rnd() * 0.6, rgb: this.rnd() < 0.6 ? CYAN : ICE,
    }));
    this.rain = Array.from({ length: RAIN_N }, () => ({
      x: this.rnd(), ph: this.rnd(), sp: 0.05 + this.rnd() * 0.12, sz: 0.8 + this.rnd() * 0.6, a: 0.4 + this.rnd() * 0.35,
      seed: this.rnd() * 1000, rgb: spectrum(this.rnd() * RAIN_TINT_N),
    }));
  }

  /** A release at time t: a spherical shock of glyphs leaves his body. `H` is the canvas height, `U` his disk radius (device px). */
  burst(t: number, hub: Pt, U: number, H: number, k: number): void {
    const lift = 1 + 0.25 * clamp(k, 0, 2);
    for (let i = 0; i < BURST_N; i++) {
      const th = this.rnd() * Math.PI * 2, sp = BURST_SPEED * H * (0.55 + 0.6 * this.rnd()) * lift;
      const r0 = BURST_START * U;
      this.bursts.push({
        x: hub[0] + Math.cos(th) * r0, y: hub[1] + Math.sin(th) * r0 * 0.7,
        vx: Math.cos(th) * sp, vy: Math.sin(th) * sp * 0.7, born: t, life: BURST_LIFE[0] + this.rnd() * (BURST_LIFE[1] - BURST_LIFE[0]),
        sz: 0.8 + this.rnd() * 0.5, seed: this.rnd() * 1000, rgb: spectrum(this.rnd() * 7),
      });
    }
    this.spawned += BURST_N;
  }

  /** Moves the burst by this frame's dt, and retires particles past their life at time t. */
  step(t: number, dt: number): void {
    const drag = Math.exp(-dt * BURST_DRAG);
    for (const b of this.bursts) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.vx *= drag; b.vy *= drag;
    }
    this.bursts = this.bursts.filter((b) => t - b.born < b.life);
  }

  /** Draws the streams and the burst into the ink. `cam.charge` draws the orbit in and quickens the rain. */
  paint(t: number, cam: { W: number; H: number; U: number; hub: Pt; charge: number; dpr: number }, ink: Ink): void {
    const { W, H, U, hub, charge, dpr } = cam;
    for (const o of this.orbit) {
      const a = o.a + t * o.w, r = o.r * U * (1 - 0.28 * charge);
      const x = hub[0] + Math.cos(a) * r, y = hub[1] + Math.sin(a) * r * o.tilt;
      const front = 0.55 + 0.45 * (Math.sin(a) + 1) / 2;
      const alpha = (0.45 + 0.4 * charge) * front * (0.7 + 0.3 * Math.sin(t * 1.3 + o.seed));
      ink.character(x, y, 13 * o.sz * dpr, pick(o.seed, Math.floor(t * FLIP_RATE)), o.rgb, alpha);
    }
    const pitch = RAIN_PITCH * dpr;
    for (const c of this.rain) {
      const head = frac(c.ph + t * c.sp * (1 + charge)) * H * 1.3 - 0.15 * H;
      for (let k = 0; k < RAIN_LEN; k++) {
        const y = head - k * pitch * c.sz;
        const fade = Math.pow(1 - k / RAIN_LEN, 1.5);
        ink.character(c.x * W, y, 11 * c.sz * dpr, pick(c.seed, Math.floor(t * 4) + k), c.rgb, c.a * fade * (1 + 0.5 * charge));
      }
    }
    for (const b of this.bursts) {
      const age = t - b.born;
      if (age < 0) continue;
      const a = Math.pow(1 - age / b.life, 1.6) * smooth(0, 0.12, age);
      if (a > 0) ink.character(b.x, b.y, 14 * b.sz * dpr, pick(b.seed, Math.floor(age * 9)), b.rgb, a * 1.2);
    }
  }
}
