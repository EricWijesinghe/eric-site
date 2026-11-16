// The head zone: his head's halo, his silhouette, and a column rising from the top of his head to the top of the
// canvas. Nothing may be drawn in it (Eric, rounds 1-3: a line at or above the head reads as hair, an antenna or an
// eel). Every stroke, dot and glyph is cut there, and the sky shader fades its trails, rays and rain in the same
// column (singularity-shaders.ts), so the zone is empty by construction, not by intent.
import type { Pt } from './singularity-math';

export interface HeadBox { x0: number; x1: number; y0: number; y1: number } // figure px

const COLUMN_MARGIN = 40; // figure px either side of his head that the column covers
const HALO_HIT = 0.25; // only the inner part of the halo blocks points and strokes; its soft rim stays populated
const SOLID_HIT = 128; // figure alpha (0..255) that counts as his body
const SAMPLE_PX = 8; // a segment is sampled this often (device px); the zone is wider than this, so none is skipped

const KEEP_FROM = 1.15, KEEP_TO = 1.8; // in head radii, as HEAD_KEEP
// The flanks (G1): from the canvas top down to his shoulder line, within one head width either side of his head, no
// steep segment is drawn: a vertical trace beside his temple read as a line converging on his head (round 10 review).
const FLANK_FLOOR = 0.25; // the shoulder line, in head heights below his chin
const STEEP = 1; // a segment counts as vertical when it rises at least this much per unit sideways

/**
 * The release shock's keep factor at a figure-px point, the CPU mirror of HEAD_KEEP (singularity-shaders.ts): 0 on
 * his head, the column above it and a margin at ear height. ?debug samples it to prove the shock is cut there.
 */
export function headKeep(h: HeadBox, x: number, y: number): number {
  const rx = (h.x1 - h.x0) / 2, ry = (h.y1 - h.y0) / 2;
  const qx = (x - (h.x0 + h.x1) / 2) / rx, qy = (y - (h.y0 + h.y1) / 2) / ry;
  const d = qy < 0 ? Math.abs(qx) : Math.hypot(qx, qy);
  const k = Math.max(0, Math.min(1, (d - KEEP_FROM) / (KEEP_TO - KEEP_FROM)));
  return k * k * (3 - 2 * k);
}

export class HeadZone {
  // device px: the column's sides, and its floor (the top of his head); the column runs up to the canvas edge
  private cx0 = 0;
  private cx1 = 0;
  private cy1 = 0;
  private fx0 = 0;
  private fx1 = 0;
  private fy1 = 0;
  private fo: Pt = [0, 0];
  private s = 1;

  /** `solid` reads his figure's alpha at a figure-px point; null lets the zone skip the silhouette test. */
  constructor(
    private readonly halo: (x: number, y: number) => number,
    private readonly head: HeadBox,
    private readonly solid: ((x: number, y: number) => number) | null = null,
  ) {}

  /** Places the zone for this frame: his figure's origin (device px) and scale (device px per figure px). */
  place(fo: Pt, s: number): void {
    this.fo = fo;
    this.s = s;
    this.cx0 = fo[0] + (this.head.x0 - COLUMN_MARGIN) * s;
    this.cx1 = fo[0] + (this.head.x1 + COLUMN_MARGIN) * s;
    this.cy1 = fo[1] + this.head.y0 * s;
    const hw = this.head.x1 - this.head.x0, hh = this.head.y1 - this.head.y0;
    this.fx0 = fo[0] + (this.head.x0 - hw) * s;
    this.fx1 = fo[0] + (this.head.x1 + hw) * s;
    this.fy1 = fo[1] + (this.head.y1 + FLANK_FLOOR * hh) * s;
  }

  /** True when a→b is a steep segment in his head's flanks, above his shoulder line. */
  flank(a: Pt, b: Pt): boolean {
    const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
    if (dy < dx * STEEP || Math.min(a[1], b[1]) > this.fy1) return false;
    return Math.max(a[0], b[0]) > this.fx0 && Math.min(a[0], b[0]) < this.fx1;
  }

  /** The column as the sky shader reads it: left, right and floor (device px), and a spare slot. */
  column(): [number, number, number, number] {
    return [this.cx0, this.cx1, this.cy1, 0];
  }

  /** True when a device-px point is inside the zone: the column (widened by `pad`), his silhouette or his halo. */
  hits(x: number, y: number, pad = 0): boolean {
    if (x > this.cx0 - pad && x < this.cx1 + pad && y < this.cy1 + pad) return true;
    const fx = (x - this.fo[0]) / this.s, fy = (y - this.fo[1]) / this.s;
    if (this.solid && this.solid(fx, fy) >= SOLID_HIT) return true;
    return this.halo(fx, fy) > HALO_HIT;
  }

  /** True when the segment a→b touches the zone, its column widened by the ribbon's half-width `pad`. */
  segment(a: Pt, b: Pt, pad: number): boolean {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SAMPLE_PX));
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      if (this.hits(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, pad)) return true;
    }
    return false;
  }
}
