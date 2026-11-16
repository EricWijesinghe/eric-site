// The data field: binary and code glyphs that orbit him, rain in depth down the canvas, and burst out of his body
// (through the outline of his shoulders and arms) on release as a shock of data (Eric round 3: "I wanna codes, binaries and so much more"). Glyphs are
// decoration, never words about him. Ink drops any glyph inside his silhouette or head zone, so nothing reads as a
// line leaving him. The head zone's column cuts the rain, so none stands above his head.
import { CODE_GLYPH_FIRST, CODE_GLYPH_N } from './singularity-config';
import { clamp, frac, rng, smooth, type Pt } from './singularity-math';
import { CYAN, ICE, spectrum, type Rgb } from './singularity-palette';
import type { Ink } from './singularity-ink';
import type { Sites } from './singularity-figure';

const ORBIT_N = 220; // glyph streams circling him, at depth
const RAIN_N = 130; // columns of code rain across the canvas
const RAIN_LEN = 7; // glyphs per rain column
const BURST_N = 520; // particles in a full-strength release
const BURST_K_MAX = 2.2; // the strongest release: a full charge (singularity-input.ts)
const BURST_SHARE_MIN = 0.3; // the weakest release still throws this share of them
const BURST_LIFE = [2.2, 3.2]; // seconds a burst particle lives
const BURST_SPEED = 0.42; // canvas heights per second, before drag
const BURST_DRAG = 0.8; // per second: eases the shock out to the canvas edges
const BURST_SPREAD = 1.1; // radians of scatter around each glyph's way out
const BURST_OUT_MIN = 0.15; // a glyph's direction must keep at least this much of the outward normal
const SITE_STRIDE = 4; // x, y, nx, ny per site
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

  /**
   * A release at time t: a shock of glyphs leaves his body. Each one starts on a site just inside the outline of his
   * shoulders and arms (singularity-figure.ts), hidden by his silhouette, and comes out through that outline: nothing
   * appears from empty space or from his head (Eric round 10). `map` places a figure-px point on the canvas, `H` is
   * the canvas height, and `k` the release's strength: a longer hold throws more glyphs, faster.
   */
  burst(t: number, hub: Pt, H: number, k: number, sites: Sites, map: (x: number, y: number) => Pt): void {
    const power = clamp(k, 0, BURST_K_MAX), lift = 1 + 0.25 * power;
    const n = Math.round(BURST_N * (BURST_SHARE_MIN + (1 - BURST_SHARE_MIN) * power / BURST_K_MAX));
    for (let i = 0; i < n; i++) {
      const side = sites[this.rnd() < 0.5 ? 0 : 1], from = side.length ? side : sites[0].length ? sites[0] : sites[1];
      if (!from.length) return;
      const j = Math.floor(this.rnd() * (from.length / SITE_STRIDE)) * SITE_STRIDE;
      const [x, y] = map(from[j], from[j + 1]), nx = from[j + 2], ny = from[j + 3];
      // out through the outline and away from his chest, so the burst still spreads as a sphere around him
      const rl = Math.hypot(x - hub[0], y - hub[1]) || 1;
      const th = Math.atan2(ny + (y - hub[1]) / rl, nx + (x - hub[0]) / rl) + (this.rnd() - 0.5) * BURST_SPREAD;
      let dx = Math.cos(th), dy = Math.sin(th);
      if (dx * nx + dy * ny < BURST_OUT_MIN) { dx = nx; dy = ny; } // never back into his body
      const sp = BURST_SPEED * H * (0.55 + 0.6 * this.rnd()) * lift;
      this.bursts.push({
        x, y, vx: dx * sp, vy: dy * sp * 0.7, born: t, life: BURST_LIFE[0] + this.rnd() * (BURST_LIFE[1] - BURST_LIFE[0]),
        // inked in his own cyan and ice only: magenta and emerald glyphs read as colour dabs beside him (round 10 review)
        sz: 0.8 + this.rnd() * 0.5, seed: this.rnd() * 1000, rgb: this.rnd() < 0.6 ? CYAN : ICE,
      });
    }
    this.spawned += n;
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
