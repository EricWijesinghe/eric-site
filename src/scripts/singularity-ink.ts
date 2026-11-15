// What a frame draws, written as vertices: soft ribbons (network edges, quantum wires) and glowing points (nodes,
// packets, chips), plus the glyph particles of the data field. The hero owns the GL; this only fills the buffers.
// Nothing enters his head zone: his halo, his silhouette or the column above him (singularity-zone.ts).
import { DOT_MAX, DOT_STRIDE, GLYPH_MAX, GLYPH_STRIDE, RIB_MAX, RIB_STRIDE } from './singularity-config';
import type { Pt } from './singularity-math';
import type { Rgb } from './singularity-palette';
import { HeadZone } from './singularity-zone';

const VERTS_PER_SEG = 6;
export type WidthFn = number | ((i: number, n: number) => number);
/** A device-px rectangle that scales the brightness of whatever is drawn inside it (k 0..1). */
export interface Gain { x0: number; y0: number; x1: number; y1: number; k: number }

export class Ink {
  /** Ribbon vertices written this frame. */
  count = 0;
  /** Points written this frame. */
  dots = 0;
  /** Glyph particles written this frame. */
  glyphs = 0;
  /** Centreline points that reached the head zone. The cuts keep this at 0; the debug readout and the spec check it. */
  zoneHits = 0;
  /** Set once per frame by the hero: the copy column and his face are dimmed so the text and the face stay readable. */
  gains: Gain[] = [];

  constructor(
    private readonly rib: Float32Array,
    private readonly dot: Float32Array,
    private readonly zone: HeadZone,
    private readonly glyph: Float32Array,
  ) {}

  reset(): void {
    this.count = 0;
    this.dots = 0;
    this.glyphs = 0;
  }

  /**
   * A soft glowing ribbon along pts, `width` in device px (a number, or a function of the point index).
   * Its profile falls off across the width, so the edge dissolves; I is brightness. A segment that touches
   * the head zone is cut out, so the ribbon breaks there instead of entering it.
   */
  path(pts: Pt[], width: WidthFn, I: number, rgb: Rgb): void {
    const n = pts.length;
    const wAt = typeof width === 'number' ? (): number => width : (i: number): number => width(i, n);
    for (let i = 0; i < n - 1 && this.count + VERTS_PER_SEG <= RIB_MAX; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const wa = wAt(i), wb = wAt(i + 1);
      if (this.zone.segment(pts[i], pts[i + 1], Math.max(wa, wb))) continue;
      if (this.zone.hits(ax, ay) || this.zone.hits(bx, by)) { this.zoneHits++; continue; }
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      const Ig = I * this.gainAt((ax + bx) / 2, (ay + by) / 2);
      // two triangles across the segment; side is -1..1 from one edge to the other
      this.vertex(ax - nx * wa, ay - ny * wa, -1, Ig, rgb);
      this.vertex(bx - nx * wb, by - ny * wb, -1, Ig, rgb);
      this.vertex(bx + nx * wb, by + ny * wb, 1, Ig, rgb);
      this.vertex(ax - nx * wa, ay - ny * wa, -1, Ig, rgb);
      this.vertex(bx + nx * wb, by + ny * wb, 1, Ig, rgb);
      this.vertex(ax + nx * wa, ay + ny * wa, 1, Ig, rgb);
    }
  }

  /** A glowing point of `size` device px. Dropped inside the head zone. */
  point(x: number, y: number, size: number, rgb: Rgb, a: number): void {
    if (this.dots >= DOT_MAX || this.zone.hits(x, y)) return;
    this.dot.set([x, y, rgb[0], rgb[1], rgb[2], a * this.gainAt(x, y), size], this.dots * DOT_STRIDE);
    this.dots++;
  }

  /** A glyph particle: atlas cell `g` (singularity-config GLYPHS) of `size` device px. Dropped inside the head zone. */
  character(x: number, y: number, size: number, g: number, rgb: Rgb, a: number): void {
    if (this.glyphs >= GLYPH_MAX || this.zone.hits(x, y)) return;
    this.glyph.set([x, y, rgb[0], rgb[1], rgb[2], a * this.gainAt(x, y), size, g], this.glyphs * GLYPH_STRIDE);
    this.glyphs++;
  }

  /** The smallest gain of the rectangles that contain (x, y); 1 outside all of them. */
  gainAt(x: number, y: number): number {
    let k = 1;
    for (const g of this.gains) if (x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1 && g.k < k) k = g.k;
    return k;
  }

  private vertex(x: number, y: number, side: number, I: number, rgb: Rgb): void {
    this.rib.set([x, y, side, I, rgb[0], rgb[1], rgb[2]], this.count * RIB_STRIDE);
    this.count++;
  }
}
