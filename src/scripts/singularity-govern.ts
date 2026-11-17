// Performance governor. It picks a tier from the GPU at start (a 30-frame probe can demote it), steps the
// resolution down while frames run long and back up once they are calm, and caps the frame rate when
// nobody is touching the hero or the device is saving power.
import { CONFIG, GOV } from './singularity-config';

export type Tier = 'high' | 'mid' | 'low';
const BIT_SHARE: Record<Tier, number> = { high: 1, mid: 0.7, low: 0.45 };
const DPR_CAP: Record<Tier, number> = { high: CONFIG.dprCap, mid: 1.5, low: 1 };
const DOWN: Record<Tier, Tier> = { high: 'mid', mid: 'low', low: 'low' };
const RING = 120; // frame samples kept for the p90

export interface GpuInfo { renderer: string; cores: number; memory: number | undefined }

/** Software rasterisers are always the low tier; a small machine starts at mid; everything else is high. */
export function pickTier(info: GpuInfo): Tier {
  if (/swiftshader|llvmpipe|software|basic render/i.test(info.renderer)) return 'low';
  if (info.cores <= 4 || (info.memory !== undefined && info.memory <= 4)) return 'mid';
  return 'high';
}

/** The GPU's name, when the browser will say; otherwise the generic renderer string. */
export function readRenderer(gl: WebGL2RenderingContext): string {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
}

/** Battery is only checked where the API exists; elsewhere the device is treated as plugged in. */
export function watchBattery(onLow: (low: boolean) => void): void {
  type Battery = { charging: boolean; level: number; addEventListener(type: string, fn: () => void): void };
  const nav = navigator as Navigator & { getBattery?: () => Promise<Battery> };
  nav.getBattery?.().then((b) => {
    const check = (): void => onLow(!b.charging && b.level < 0.2);
    check();
    b.addEventListener('levelchange', check);
    b.addEventListener('chargingchange', check);
  }, () => onLow(false));
}

export function saveDataOn(): boolean {
  return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
}

export class Governor {
  tier: Tier;
  workScale = 1; // share of the disk's particles drawn; the governor lowers it under load, the canvas keeps its resolution
  private readonly ring = new Float32Array(RING);
  private count = 0;
  private cursor = 0;
  private calmSince = -1;
  private probeMs: number[] = [];
  private probed = false;
  p90 = 0;

  constructor(tier: Tier) {
    this.tier = tier;
  }

  /** Share of the disk's bits this tier draws. */
  get bitShare(): number {
    return BIT_SHARE[this.tier];
  }

  /** Device-px ratio ceiling for this tier, before the runtime scale. */
  get dprCap(): number {
    return DPR_CAP[this.tier];
  }

  /** The first frames on the device: a slow probe demotes the tier one step. Returns true when it changed. */
  probe(ms: number): boolean {
    if (this.probed) return false;
    this.probeMs.push(ms);
    if (this.probeMs.length < GOV.probeFrames) return false;
    this.probed = true;
    const avg = this.probeMs.reduce((a, b) => a + b, 0) / this.probeMs.length;
    this.probeMs = [];
    const next = avg > GOV.probeSlowMs ? DOWN[this.tier] : this.tier;
    if (next === this.tier) return false;
    this.tier = next;
    return true;
  }

  /** One frame's cost in ms. Returns true when the resolution scale changed and the caller must re-layout. */
  sample(ms: number, now: number): boolean {
    this.ring[this.cursor] = ms;
    this.cursor = (this.cursor + 1) % RING;
    this.count = Math.min(this.count + 1, RING);
    if (this.count < GOV.probeFrames || this.cursor % GOV.probeFrames !== 0) return false;
    this.p90 = percentile90(this.ring, this.count);
    if (this.p90 > GOV.p90Hi) {
      this.calmSince = -1;
      return this.stepScale(-GOV.workStep);
    }
    if (this.p90 >= GOV.p90Lo) { this.calmSince = -1; return false; }
    if (this.calmSince < 0) this.calmSince = now;
    if (now - this.calmSince < GOV.calmMs) return false;
    this.calmSince = now;
    return this.stepScale(GOV.workStep);
  }

  private stepScale(delta: number): boolean {
    const next = Math.min(1, Math.max(GOV.workMin, this.workScale + delta));
    if (next === this.workScale) return false;
    this.workScale = next;
    this.count = 0; // judge the new resolution on its own frames
    return true;
  }

  /** Whether this frame is skipped to hold the idle frame rate. */
  capped(now: number, lastInput: number, lowBattery: boolean): boolean {
    return now - lastInput > CONFIG.idleMs || lowBattery || saveDataOn();
  }
}

function percentile90(ring: Float32Array, count: number): number {
  const sorted = Array.from(ring.subarray(0, count)).sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
}
