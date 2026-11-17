// What the visitor (and Eric's release) does to the current: the pointer's wake, the lens around the pointer, the
// pulse a click or a tap sends through the glyphs, the scroll warp, and the surge a release sends down the river.
// No ring, stroke or label is drawn for any of it: only glyphs move, grow and flash. Positions are page px.

export interface Hit {
  dx: number;
  dy: number;
  /** 0..1: the glyph flashes toward full alpha (pulse fronts). */
  flash: number;
  /** 0..1: inside the pointer's lens (bigger, brighter, accent colour). */
  lens: number;
}

interface Stamp {
  x: number;
  y: number;
  /** Clamped push along the motion, px. */
  px: number;
  py: number;
  /** Unit perpendicular of the motion, for the swirl. */
  nx: number;
  ny: number;
  t0: number;
}

interface Pulse {
  x: number;
  y: number;
  t0: number;
  speed: number;
  reach: number;
}

interface Surge {
  t0: number;
  k: number;
}

const STAMP_EVERY_PX = 24;
const MAX_STAMPS = 20;
const STAMP_LIFE_MS = 1400;
const STAMP_RISE_MS = 60;
const STAMP_DECAY_MS = 520;
const WAKE_SIGMA_PX = 150;
const WAKE_CUTOFF_PX = WAKE_SIGMA_PX * 2.5;
const WAKE_GAIN = 0.035;
const WAKE_MAX_PX = 48;
const SWIRL_PX = 22;
const LENS_PX = 130;
const PULSE_BAND_PX = 60;
const PULSE_PUSH_PX = 26;
const MAX_PULSES = 6;
export const TAP_SPEED = 620;
export const POOL_SPEED = 1600;
const TAP_REACH_PX = 1400;
const POOL_REACH_PX = 1200;
const SURGE_SPEED = 950;
const SURGE_BAND_PX = 130;
const MAX_SURGES = 3;
const POOL_FLASH_MS = 900;
const SCROLL_EASE = 0.18;
const SCROLL_DECAY = 0.85;
const SCROLL_IDLE_MS = 100;

export class Stir {
  private stamps: Stamp[] = [];
  private pulses: Pulse[] = [];
  private surges: Surge[] = [];
  private flashes: { y: number; t0: number }[] = [];
  private lastStamp: { x: number; y: number; t: number } | null = null;
  pointer: { x: number; y: number } | null = null;
  /** Smoothed scroll velocity, px/s (positive scrolling down). */
  scrollV = 0;
  private lastScroll = { y: 0, t: 0 };

  /** Mouse/pen trail (client px): a stamp every 24 px of travel, pushing glyphs along the motion and swirling them aside. */
  move(x: number, y: number, scrollY: number, now: number, wake: boolean): void {
    this.pointer = { x, y };
    if (!wake) return;
    y += scrollY;
    const prev = this.lastStamp;
    if (!prev) {
      this.lastStamp = { x, y, t: now };
      return;
    }
    const dist = Math.hypot(x - prev.x, y - prev.y);
    if (dist < STAMP_EVERY_PX) return;
    const dt = Math.max(1, now - prev.t) / 1000;
    const vx = (x - prev.x) / dt;
    const vy = (y - prev.y) / dt;
    const v = Math.hypot(vx, vy) || 1;
    const push = Math.min(WAKE_MAX_PX, v * WAKE_GAIN);
    this.stamps = [...this.stamps, { x, y, px: (vx / v) * push, py: (vy / v) * push, nx: -vy / v, ny: vx / v, t0: now }].slice(-MAX_STAMPS);
    this.lastStamp = { x, y, t: now };
  }

  pulse(x: number, y: number, now: number, speed = TAP_SPEED): void {
    const reach = speed === TAP_SPEED ? TAP_REACH_PX : POOL_REACH_PX;
    this.pulses = [...this.pulses, { x, y, t0: now, speed, reach }].slice(-MAX_PULSES);
  }

  surge(now: number, k: number): void {
    this.surges = [...this.surges, { t0: now, k }].slice(-MAX_SURGES);
  }

  flashPool(y: number, now: number): void {
    this.flashes = [...this.flashes.filter((f) => now - f.t0 < POOL_FLASH_MS), { y, t0: now }];
  }

  scrolled(y: number, now: number): void {
    const dt = (now - this.lastScroll.t) / 1000;
    if (dt > 0 && dt < 0.5) this.scrollV += ((y - this.lastScroll.y) / dt - this.scrollV) * SCROLL_EASE;
    this.lastScroll = { y, t: now };
  }

  /** Drops what has run out and lets the scroll velocity settle when the page stops. */
  step(now: number, docH: number): void {
    if (now - this.lastScroll.t > SCROLL_IDLE_MS) this.scrollV *= SCROLL_DECAY;
    if (Math.abs(this.scrollV) < 1) this.scrollV = 0;
    this.stamps = this.stamps.filter((s) => now - s.t0 < STAMP_LIFE_MS);
    this.pulses = this.pulses.filter((p) => ((now - p.t0) / 1000) * p.speed < p.reach + PULSE_BAND_PX);
    this.surges = this.surges.filter((s) => ((now - s.t0) / 1000) * SURGE_SPEED < docH + SURGE_BAND_PX);
    this.flashes = this.flashes.filter((f) => now - f.t0 < POOL_FLASH_MS);
  }

  busy(): boolean {
    return this.stamps.length + this.pulses.length + this.surges.length + this.flashes.length > 0 || this.scrollV !== 0;
  }

  /** Displacement, flash and lens for one glyph at page (x, y); `scrollY` turns the client pointer into page px. */
  at(x: number, y: number, now: number, scrollY: number, out: Hit): Hit {
    out.dx = 0;
    out.dy = 0;
    out.flash = 0;
    out.lens = 0;
    for (const s of this.stamps) {
      const rx = x - s.x;
      const ry = y - s.y;
      if (Math.abs(rx) > WAKE_CUTOFF_PX || Math.abs(ry) > WAKE_CUTOFF_PX) continue;
      const age = now - s.t0;
      const env = Math.min(1, age / STAMP_RISE_MS) * Math.exp(-age / STAMP_DECAY_MS);
      const k = Math.exp(-(rx * rx + ry * ry) / (WAKE_SIGMA_PX * WAKE_SIGMA_PX)) * env;
      const side = rx * s.nx + ry * s.ny >= 0 ? 1 : -1;
      out.dx += k * (s.px + side * s.nx * SWIRL_PX);
      out.dy += k * (s.py + side * s.ny * SWIRL_PX);
    }
    for (const p of this.pulses) {
      const r = ((now - p.t0) / 1000) * p.speed;
      const rx = x - p.x;
      const ry = y - p.y;
      const d = Math.hypot(rx, ry);
      const off = Math.abs(d - r);
      if (off > PULSE_BAND_PX || d < 1) continue;
      const f = (1 - off / PULSE_BAND_PX) * Math.max(0, 1 - r / p.reach);
      out.dx += (rx / d) * PULSE_PUSH_PX * f;
      out.dy += (ry / d) * PULSE_PUSH_PX * f;
      out.flash = Math.max(out.flash, f);
    }
    if (this.pointer) {
      const d = Math.hypot(x - this.pointer.x, y - (this.pointer.y + scrollY));
      if (d < LENS_PX) out.lens = (1 - d / LENS_PX) ** 2;
    }
    return out;
  }

  /** Release surge strength (k-weighted, 0..~1) at page y; the front runs down from the source. */
  surgeAt(y: number, now: number, sourceY: number): number {
    let b = 0;
    for (const s of this.surges) {
      const front = sourceY + ((now - s.t0) / 1000) * SURGE_SPEED;
      const d = Math.abs(y - front) / SURGE_BAND_PX;
      if (d < 1) b = Math.max(b, s.k * 0.5 * (1 + Math.cos(Math.PI * d)));
    }
    return b;
  }

  /** How strongly a pool at page y flashes now: a surge passing through it, or an arrival from it. */
  poolFlash(y: number, now: number, sourceY: number): number {
    let f = this.surgeAt(y, now, sourceY);
    for (const fl of this.flashes) if (Math.abs(fl.y - y) < 1) f = Math.max(f, 1 - (now - fl.t0) / POOL_FLASH_MS);
    return f;
  }
}
