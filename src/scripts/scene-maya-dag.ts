// The block DAG of the Maya2C scene. Each cell is a vertex: its main cell is the block, and the cell
// under it is the 2f+1 certificate that the round's validators signed for it. Parent edges link a
// vertex to the one before it. A block the poller reports slides in with a pulse. The payload text
// inside a cell is decorative: it stands for no chain data, and the real height is in the hover caption.
import {
  caption,
  CHIP_H,
  chip,
  chipY,
  clamp01,
  easeOut,
  glass,
  ink,
  isLight,
  rrect,
  stroke,
  tint,
  type Pt,
  type Rect,
  PALETTE as P,
} from './scene-core';
import { lineW } from './scene-core';
import { bits, hex } from './scene-glyphs';

export interface Block {
  seed: number;
  live: boolean;
  height?: number; // set only for blocks the poller reported; never invented
}

const SLIDE_S = 0.9; // a new block pushes the row one column over in this long
const HASH_ROWS = 2;
const MIN_CELL_COLS = 4; // a narrow cell still carries a few glyphs
const CELL_GLYPH_W = 5.6; // px per glyph of the 8px cell font
const CELL_LINE_H = 10;
const CELL_FONT = '8px "JetBrains Mono", ui-monospace, monospace';
const HOVER_PAD = 6; // px around a cell that still counts as hovering it
const CELL_R = 6;
const LABEL = 'DAG-BFT · BLOCKS';
const LEGEND = 'vertex · lower cell = certificate';
const LABEL_Y = chipY(0);
const LEGEND_Y = chipY(1);
// The chip rows take the top of the band; cells are drawn only below them, so no chip covers a cell.
const CHIP_ZONE = LEGEND_Y + CHIP_H / 2 + 4;
const SIDE_GAP = 4; // between a main cell and its certificate cell
const PEARL_FILL = 'rgb(196 224 250 / 0.8)'; // light theme: a pale azure inside each vertex

interface Cell {
  x: number; // centre x
  r: Rect; // the main cell's box
  top: number; // main row, y centre
}

/** A cell's payload, decorative: bit rows and hex digests fitted to the cell, so nothing spills past its edge. */
function drawHashTexture(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number): void {
  const cols = Math.max(MIN_CELL_COLS, Math.floor(w / CELL_GLYPH_W));
  const rows = Math.min(HASH_ROWS, Math.floor(h / CELL_LINE_H));
  g.font = CELL_FONT;
  g.textBaseline = 'alphabetic';
  for (let r = 0; r < rows; r++) {
    const row = r % 2 === 0 ? bits(seed + r, cols) : hex(seed * 3 + r, cols);
    g.fillStyle = tint('azure', r % 2 === 0 ? 0.3 : 0.5);
    g.fillText(row, x, y + (r + 1) * CELL_LINE_H);
  }
}

/** One rounded cell with a soft glow rather than a hard outline, and its decorative payload. */
function drawCell(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, b: Block, hot: boolean): void {
  rrect(g, x - 4, y - 4, w + 8, h + 8, CELL_R + 4);
  // The halo is a soft azure wash on pearl; a deep-ink ring there would read as a solid navy node.
  g.strokeStyle = isLight() ? tint('azure', hot ? 0.3 : 0.12) : stroke('cyan', hot ? 0.3 : 0.1);
  g.lineWidth = lineW(4);
  g.stroke();
  rrect(g, x, y, w, h, CELL_R);
  g.fillStyle = isLight() ? PEARL_FILL : `rgb(${glass()} / ${b.live ? 0.92 : 0.7})`;
  g.fill();
  g.strokeStyle = hot ? P.ice : tint('cyan', b.live ? 0.5 : 0.22);
  g.lineWidth = lineW(hot ? 1.5 : 1);
  g.stroke();
  drawHashTexture(g, x + 4, y + 4, w - 8, h - 8, b.seed);
}

/** A cell sliding past the box edge fades out there instead of being cut by a hard clip. */
function edgeFade(x: number, r: Rect, colW: number): number {
  return clamp01((x - r.x - colW * 0.5) / colW);
}

function inside(p: Pt, r: Rect, pad: number): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

/** Draws the DAG in its band: parent edges, certificates, cells, and the caption of a picked one. */
export function drawDag(
  g: CanvasRenderingContext2D,
  r: Rect,
  blocks: Block[],
  arrivedAt: number,
  clock: number,
  hover: Pt | null,
): void {
  const colW = Math.max(46, Math.min(96, r.w / 9));
  const endX = r.x + r.w - colW * 0.8;
  // Cells are centred in the band under the chip rows: the main cell, then its certificate cell below.
  const body = Math.max(0, r.h - CHIP_ZONE);
  const mainW = colW * 0.56;
  const mainH = body * 0.5;
  const sideW = colW * 0.3;
  const sideH = body * 0.16;
  const mainY = r.y + CHIP_ZONE + (body - (mainH + SIDE_GAP + sideH)) / 2 + mainH / 2;
  const sideY = mainY + mainH / 2 + SIDE_GAP + sideH / 2;
  const shift = colW * (1 - easeOut((clock - arrivedAt) / SLIDE_S));
  const pos = (i: number) => endX - (blocks.length - 1 - i) * colW + shift;
  const cells: Cell[] = blocks.map((_, i) => {
    const x = pos(i);
    return { x, r: { x: x - mainW / 2, y: mainY - mainH / 2, w: mainW, h: mainH }, top: mainY };
  });
  const hot = hover ? cells.findIndex((c) => inside(hover, c.r, HOVER_PAD)) : -1;

  g.lineWidth = lineW(1);
  for (let i = 0; i < blocks.length; i++) {
    const x = cells[i].x;
    if (x < r.x - colW || x > r.x + r.w + colW) continue;
    const alpha = blocks[i].live ? 0.7 : 0.25;
    g.globalAlpha = edgeFade(x, r, colW);
    if (i > 0) {
      // Parent edges: the main chain, plus the certificate's link into this block's main cell.
      const px = cells[i - 1].x;
      const onPath = hot >= 1 && i <= hot;
      g.strokeStyle = onPath ? P.ice : tint('cyan', alpha * 0.8);
      g.lineWidth = lineW(onPath ? 2 : 1);
      g.beginPath();
      g.moveTo(px + mainW / 2, mainY);
      g.lineTo(x - mainW / 2, mainY);
      g.moveTo(px, mainY + mainH / 2);
      g.lineTo(x - sideW / 2, sideY);
      g.stroke();
      g.lineWidth = lineW(1);
    }
    g.strokeStyle = stroke('emerald', alpha * 0.6);
    g.beginPath();
    g.moveTo(x, sideY);
    g.lineTo(x, mainY + mainH / 2);
    g.stroke();
  }

  for (let i = 0; i < blocks.length; i++) {
    const x = cells[i].x;
    if (x < r.x - colW || x > r.x + r.w + colW) continue;
    const b = blocks[i];
    g.globalAlpha = edgeFade(x, r, colW);
    drawCell(g, x - mainW / 2, mainY - mainH / 2, mainW, mainH, b, i === hot);
    rrect(g, x - sideW / 2, sideY - sideH / 2, sideW, sideH, CELL_R / 2);
    g.fillStyle = isLight() ? PEARL_FILL : `rgb(${glass()} / ${b.live ? 0.85 : 0.55})`;
    g.fill();
  }
  g.globalAlpha = 1;

  // A new block: a pulse that spreads from its cell as it arrives.
  const newest = blocks[blocks.length - 1];
  if (newest && newest.live && clock - arrivedAt < SLIDE_S) {
    const x = cells[blocks.length - 1].x;
    const k = clamp01((clock - arrivedAt) / SLIDE_S);
    g.strokeStyle = stroke('cyan', 0.7 * (1 - k));
    rrect(g, x - mainW / 2 - 8 * k, mainY - mainH / 2 - 8 * k, mainW + 16 * k, mainH + 16 * k, CELL_R + 4 * k);
    g.stroke();
  }
  chip(g, LABEL, r.x + 16, r.y + LABEL_Y, ink(0.9));
  chip(g, LEGEND, r.x + 16, r.y + LEGEND_Y, ink(0.8));
  if (hot >= 0) {
    const picked = blocks[hot];
    const label = picked.height === undefined ? 'structure cell · no height' : `height ${picked.height.toLocaleString('en-US')}`;
    caption(g, label, cells[hot].r.x, cells[hot].r.y - 10, ink(0.95));
  }
}
