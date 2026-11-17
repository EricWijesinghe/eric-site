// Keeps the projected skill labels apart. The 3D markers stay on their rings; only the DOM labels
// nudge, a few pixels per pass, until every pair keeps MIN_GAP between edges and every label stays
// inside the stage. Without this, neighbours on the front arc sat 10 px apart and their boxes met.

/** A label box in stage pixels: centre (x, y) and half-extents (hw, hh). */
export interface LabelBox {
  x: number;
  y: number;
  hw: number;
  hh: number;
}

export interface Bounds {
  width: number;
  height: number;
  pad: number;
}

/** Edge-to-edge gap the labels keep from each other, in CSS px. */
export const LABEL_GAP = 12;
// Enough passes for a crowded front arc to settle; 8 left pairs overlapping by 16-50 px at 1024-1440.
const PASSES = 24;

/** Moves the boxes in place so no pair overlaps within LABEL_GAP and each stays inside the bounds. */
export function spreadLabels(boxes: LabelBox[], bounds: Bounds, gap: number = LABEL_GAP): void {
  for (let pass = 0; pass < PASSES; pass++) {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const needX = a.hw + b.hw + gap - Math.abs(dx);
        const needY = a.hh + b.hh + gap - Math.abs(dy);
        if (needX <= 0 || needY <= 0) continue;
        // Push apart along the axis that needs the smaller move; each box takes half.
        if (needX < needY) {
          const s = ((dx < 0 ? -1 : 1) * needX) / 2;
          a.x -= s;
          b.x += s;
        } else {
          const s = ((dy < 0 ? -1 : 1) * needY) / 2;
          a.y -= s;
          b.y += s;
        }
      }
    }
    for (const box of boxes) clamp(box, bounds);
  }
}

function clamp(box: LabelBox, bounds: Bounds): void {
  const inset = bounds.pad;
  box.x = Math.min(Math.max(box.x, box.hw + inset), bounds.width - box.hw - inset);
  box.y = Math.min(Math.max(box.y, box.hh + inset), bounds.height - box.hh - inset);
}
