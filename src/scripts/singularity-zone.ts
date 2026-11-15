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

export class HeadZone {
  // device px: the column's sides, and its floor (the top of his head); the column runs up to the canvas edge
  private cx0 = 0;
  private cx1 = 0;
  private cy1 = 0;
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
