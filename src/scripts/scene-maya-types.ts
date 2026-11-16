// Shapes shared by the Maya2C scene and its regions (lattice, hash tree, DAG).
import type { Pt, Rect, Spot } from './scene-core';

/** Pointer state the regions read: where it hovers, and how the lattice is being turned by a drag. */
export interface Ui {
  hover: Pt | null;
  spin: number; // radians added to the lattice's yaw by a horizontal drag
  tilt: number; // radians added to its pitch by a vertical drag
}

/** What a region reports after drawing: the seal's anchor, its hotspots, and the inspect line for the hover. */
export interface RegionOut {
  anchor: Pt;
  spots: Spot[];
  hot: string | null;
}

/** Draws one region inside `r` (clipped to it) and reports what the stage needs from it. */
export interface Region {
  draw(g: CanvasRenderingContext2D, r: Rect, c: number, t: number, ui: Ui): RegionOut;
}

export const within = (p: Pt | null, r: Rect): boolean =>
  p !== null && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
