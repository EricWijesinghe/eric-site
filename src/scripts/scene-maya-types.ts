// Shapes shared by the Maya2C scene and its regions (lattice, hash tree, DAG).
import type { Pt, Rect } from './scene-core';

/** Pointer state the regions read: where it hovers, and how the lattice is being turned by a drag. */
export interface Ui {
  hover: Pt | null;
  spin: number; // radians added to the lattice's yaw by a horizontal drag
  tilt: number; // radians added to its pitch by a vertical drag
}

/** Draws one region and returns the point the seal draws its convergence line from. */
export interface Region {
  draw(g: CanvasRenderingContext2D, r: Rect, c: number, t: number, ui: Ui): Pt;
}
