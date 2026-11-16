// The block DAG of the Maya2C scene, drawn as rounds. Each column is a round; each square in it is one
// validator's vertex (four rows: structure only, never a committee size). A vertex's edges reach a quorum of
// the previous round's vertices, and the tick on it is its quorum certificate. Every other round has a
// leader anchor (ringed); committing an anchor commits its whole causal history. A round the poller reports
// slides in with a pulse. Cells carry no text: the inspect line under the stage names the picked vertex.
import {
  CHIP_H,
  CHIP_ZONE,
  chip,
  chipY,
  easeOut,
  glass,
  ink,
  isLight,
  MONO,
  rgbOf,
  rrect,
  stroke,
  tint,
  type Pt,
  type Rect,
  type Spot,
  PALETTE as P,
} from './scene-core';
import { lineW } from './scene-core';

export interface Block {
  seed: number;
  live: boolean;
  height?: number; // set only for blocks the poller reported; never invented
}

const ROWS = 4; // vertices drawn per round: a picture of the structure, not a validator count
const COL_TARGET = 80; // px per round column; the band shows as many rounds as fit
const MIN_COLS = 4;
const INSET = 16; // the row starts at the band's left inset, where its chips start
const CELL_MIN = 14;
const CELL_MAX = 28;
const CELL_R = 6;
const SLIDE_S = 0.9; // a new round pushes the row one column over in this long
const HIT_R = 20; // px: a touch this close to a vertex picks it (44 px target)
const ONE_ROW_W = 720; // px: from this band width the label and the legend share one chip row
const LABEL = 'DAG-BFT · ROUNDS';
const LEGEND = 'tick = quorum certificate · ring = leader anchor';
const LEGEND_LIT = 'lit = causal history of the picked vertex';
const LEGEND_COMMIT = 'lit = committed with the ringed anchor';
// Narrow bands: the same three legends, short enough for a phone's band width.
const SHORT = { [LEGEND]: 'tick = certificate · ring = anchor', [LEGEND_LIT]: 'lit = causal history', [LEGEND_COMMIT]: 'lit = committed with the anchor' } as Record<string, string>;
// The narrowest bands (320 px phones): the same legends again, shorter still.
const TINY = { [LEGEND]: 'tick = cert · ring = anchor', [LEGEND_LIT]: 'lit = causal history', [LEGEND_COMMIT]: 'lit = committed' } as Record<string, string>;
const PEARL_FILL = 'rgb(214 232 250 / 0.9)'; // light theme: a pale azure inside each vertex
const ONE_ZONE = chipY(0) + CHIP_H / 2 + 4;
// Rail stations (scene-maya RAIL_LABELS) that this band acts out while nothing is picked.
const AT_VERTEX = 2;
const AT_CERT = 3;
const AT_ANCHOR = 4;
const AT_FINAL = 5;

/** Which parent a vertex leaves out, so each one links to a quorum (all but one) of the round before. */
const skipOf = (b: Block, row: number): number => ((Math.imul(b.seed, 2654435761) + row * 40503) >>> 3) % ROWS;
const isAnchorRound = (b: Block): boolean => b.seed % 2 === 0;
const leaderOf = (b: Block): number => (b.seed >>> 1) % ROWS;

/** Vertices in the causal history of (col, row): itself and everything its edges reach, round by round. */
function history(blocks: Block[], col: number, row: number, first: number): Set<number> {
  const lit = new Set<number>([col * ROWS + row]);
  let frontier = [row];
  for (let i = col; i > first && frontier.length; i--) {
    const next = new Set<number>();
    for (const j of frontier) for (let k = 0; k < ROWS; k++) if (k !== skipOf(blocks[i], j)) next.add(k);
    frontier = [...next];
    frontier.forEach((k) => lit.add((i - 1) * ROWS + k));
  }
  return lit;
}

function vertexText(b: Block, anchor: boolean): string {
  const what = anchor
    ? 'Leader anchor: committing it commits its whole causal history, lit as committed.'
    : "A validator's vertex: its edges reach a quorum of the previous round, and its tick is its quorum certificate.";
  return b.height === undefined
    ? `${what} Structure only.`
    : `${what} Round drawn when the chain reported height ${b.height.toLocaleString('en-US')}.`;
}

export interface DagOut {
  spots: Spot[];
  hot: string | null;
}

/** One square vertex: one rim, a tick for its certificate, a ring when it is the round's leader anchor. */
function drawVertex(g: CanvasRenderingContext2D, x: number, y: number, s: number, o: { lit: number; tick: number; anchor: boolean; ring: number }): void {
  const light = isLight();
  rrect(g, x - s / 2, y - s / 2, s, s, CELL_R);
  g.fillStyle = o.lit === 2 ? tint('emerald', 0.3) : light ? PEARL_FILL : `rgb(${glass()} / 0.78)`;
  g.fill();
  g.strokeStyle = o.lit === 2 ? stroke('emerald', 0.95) : o.lit ? (light ? stroke('cyan', 1) : P.ice) : light ? rgbOf('cyan', 0.5) : tint('cyan', 0.32);
  g.lineWidth = o.lit ? 1.5 : 1;
  g.stroke();
  g.strokeStyle = light ? rgbOf('emerald', 0.55 + 0.45 * o.tick) : tint('emerald', 0.45 + 0.55 * o.tick);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x - s * 0.2, y + s * 0.02);
  g.lineTo(x - s * 0.04, y + s * 0.17);
  g.lineTo(x + s * 0.22, y - s * 0.16);
  g.stroke();
  if (!o.anchor) return;
  g.strokeStyle = stroke('violet', 0.45 + 0.5 * o.ring);
  g.lineWidth = lineW(1 + o.ring);
  g.beginPath();
  g.arc(x, y, s * 0.82, 0, Math.PI * 2);
  g.stroke();
}

/** Draws the rounds in their band, reports the vertices, and names the picked one. `step` is the rail position. */
export function drawDag(g: CanvasRenderingContext2D, r: Rect, blocks: Block[], arrivedAt: number, clock: number, hover: Pt | null, step: number): DagOut {
  const avail = Math.max(0, r.w - INSET * 2);
  const cols = Math.min(blocks.length, Math.max(MIN_COLS, Math.round(avail / COL_TARGET)));
  const colW = avail / cols;
  const first = blocks.length - cols;
  const zone = r.w >= ONE_ROW_W ? ONE_ZONE : CHIP_ZONE;
  const body = Math.max(0, r.h - zone - 8);
  const rowH = body / ROWS;
  const s = Math.max(CELL_MIN, Math.min(CELL_MAX, rowH * 0.62, colW * 0.4));
  const slide = 1 - easeOut((clock - arrivedAt) / SLIDE_S);
  const from = Math.max(0, first - (slide > 0 ? 1 : 0)); // the round leaving at the left, while it slides out
  const cx = (i: number): number => r.x + INSET + colW * (i - first + 0.5 + slide);
  const cy = (j: number): number => r.y + zone + rowH * (j + 0.5);

  // The picked vertex, nearest to the pointer; with none, the band acts out the rail's current station.
  let pick: { i: number; j: number } | null = null;
  if (hover) {
    let best = Math.max(HIT_R, s * 0.7);
    for (let i = first; i < blocks.length; i++)
      for (let j = 0; j < ROWS; j++) {
        const d = Math.hypot(hover.x - cx(i), hover.y - cy(j));
        if (d <= best) [best, pick] = [d, { i, j }];
      }
  }
  const station = Math.round(step);
  const last = blocks.length - 1;
  let anchorCol = last;
  while (anchorCol > first && !isAnchorRound(blocks[anchorCol])) anchorCol--;
  const pickAnchor = pick !== null && isAnchorRound(blocks[pick.i]) && leaderOf(blocks[pick.i]) === pick.j;
  const commit = pick ? pickAnchor : station === AT_FINAL && isAnchorRound(blocks[anchorCol]);
  const lit = pick
    ? history(blocks, pick.i, pick.j, from)
    : commit ? history(blocks, anchorCol, leaderOf(blocks[anchorCol]), from) : new Set<number>();
  const fresh = !pick && (station === AT_VERTEX || station === AT_CERT) ? last : -1;
  const litLevel = commit ? 2 : 1;

  // Edges: each vertex to the quorum of the round before; the picked history and the fresh round are bright.
  for (let i = Math.max(from, 1); i < blocks.length; i++) {
    g.globalAlpha = i === from ? 1 - slide : 1;
    for (let j = 0; j < ROWS; j++)
      for (let k = 0; k < ROWS; k++) {
        if (k === skipOf(blocks[i], j) || i - 1 < from) continue;
        const on = (lit.has(i * ROWS + j) && lit.has((i - 1) * ROWS + k)) || (i === fresh && station === AT_CERT);
        const x0 = cx(i) - s / 2;
        const x1 = cx(i - 1) + s / 2;
        const mid = (x0 + x1) / 2;
        g.strokeStyle = on
          ? commit ? stroke('emerald', 0.85) : isLight() ? stroke('cyan', 0.9) : P.ice
          : isLight() ? rgbOf('cyan', 0.18) : tint('cyan', blocks[i].live ? 0.24 : 0.14);
        g.lineWidth = on ? 1.5 : 1;
        g.beginPath();
        g.moveTo(x0, cy(j));
        g.bezierCurveTo(mid, cy(j), mid, cy(k), x1, cy(k));
        g.stroke();
      }
  }

  for (let i = from; i < blocks.length; i++) {
    g.globalAlpha = i < first ? 1 - slide : 1;
    const b = blocks[i];
    for (let j = 0; j < ROWS; j++) {
      const anchor = isAnchorRound(b) && leaderOf(b) === j;
      const on = lit.has(i * ROWS + j) || i === fresh;
      drawVertex(g, cx(i), cy(j), s, {
        lit: on ? (lit.has(i * ROWS + j) ? litLevel : 1) : 0,
        tick: (i === fresh && station === AT_CERT) || lit.has(i * ROWS + j) ? 1 : 0, // a fresh vertex has no certificate yet
        anchor,
        ring: anchor && (!pick ? station >= AT_ANCHOR && i === anchorCol : pickAnchor && pick.i === i) ? 1 : 0,
      });
    }
  }
  g.globalAlpha = 1;

  // A new round: a pulse that spreads from its column as it arrives.
  if (blocks[last]?.live && slide > 0) {
    const k = 1 - slide;
    g.strokeStyle = stroke('cyan', 0.7 * slide);
    g.lineWidth = lineW(1);
    rrect(g, cx(last) - s / 2 - 8 * k, cy(0) - s / 2 - 8 * k, s + 16 * k, cy(ROWS - 1) - cy(0) + s + 16 * k, CELL_R + 4 * k);
    g.stroke();
  }

  const full = lit.size ? (commit ? LEGEND_COMMIT : LEGEND_LIT) : LEGEND;
  g.font = MONO;
  const fits = (t: string): boolean => g.measureText(t).width <= r.w - INSET * 2 - 12;
  const legend = zone === ONE_ZONE ? full : fits(SHORT[full]) ? SHORT[full] : TINY[full];
  chip(g, LABEL, r.x + INSET, r.y + chipY(0), ink(0.9));
  const legendX = zone === ONE_ZONE ? r.x + INSET + g.measureText(LABEL).width + 32 : r.x + INSET;
  chip(g, legend, legendX, r.y + chipY(zone === ONE_ZONE ? 0 : 1), ink(0.8));

  const spots: Spot[] = [];
  for (let i = first; i < blocks.length; i++) {
    if (cx(i) - s / 2 < r.x || cx(i) + s / 2 > r.x + r.w) continue;
    for (let j = 0; j < ROWS; j++) {
      const anchor = isAnchorRound(blocks[i]) && leaderOf(blocks[i]) === j;
      spots.push({ x: cx(i), y: cy(j), label: `round ${i - first + 1}, vertex ${j + 1}${anchor ? ', leader anchor' : ''}` });
    }
  }
  return { spots, hot: pick ? vertexText(blocks[pick.i], pickAnchor) : null };
}
