// Security research, as an illustration: a coverage-guided fuzzing loop. An input is taken from the
// corpus, mutated, run against the target, and kept in the corpus only if it reaches new code; the
// coverage map grows as that happens. An input that crashes goes to triage. Beneath it, memory safety:
// the same use-after-free written in C compiles and runs, while Rust's borrow rules reject it before
// it runs. The map and the inputs are generated for the drawing; they are not fuzzer output.
import {
  caption,
  clamp01,
  glass,
  ink,
  isLight,
  mountScene,
  PALETTE as P,
  rng,
  rrect,
  STILL_T,
  stroke, tint,
  type Painter,
  type PointerKind,
  type Pt,
  type Rect,
} from './scene-core';
import { lineW } from './scene-core';
import { hex } from './scene-glyphs';
import { railPos, drawRail } from './scene-steps';

const LOOP = ['CORPUS', 'MUTATE', 'EXECUTE', 'COVERAGE'] as const;
const HOP_S = 1.4; // seconds per hop around the loop
const CRASH_EVERY = 3; // every third round's input crashes the target
const GROW_S = 20; // coverage grows over this long, then the map starts again
const GROW_CYCLE_S = 24;
const COVER_MAX = 0.7; // the illustration never covers the whole map
const RECENT = 3; // the last few tiles lit are drawn brighter
const TILE_GAP = 4;
const TILE_R = 2; // ticks, not pills
const TICK = 14; // px: a narrow map's tick size
const STATUS_DY = 40; // px from the ring's bottom to the step caption's baseline
const MAP_DY = 34; // narrow: px from the step caption to the coverage map's caption line
const PAIR_MIN_W = 480; // px: from this width the C and Rust panels sit side by side
const HEX_DX = 12; // the hex readout sits this far outside the ring, beyond the token along its radius
const MAP_MIN = 5 * TICK + 4 * TILE_GAP; // px: five rows of ticks, the least a coverage map can read as one
const RING_MIN = 28;
const HEX_CLEAR = 40; // and hides while the token is this near a node
const RAIL_Y = 12;
const TOP = 64; // below the rail, whose narrow active-name line ends near y 58
const WIDE_RATIO = 1.15;
const PANEL_H = 80;
const PANEL_GAP = 10;
const TOKEN_R = 3.2;
const STATUS = [
  'pick an input from the corpus',
  'mutate: flip, splice and grow bytes',
  'run the target and record its edges',
  'new edges: keep the input',
];
const STATUS_CRASH = 'crash: the input goes to triage';

interface Layout {
  wide: boolean;
  ring: Pt & { r: number };
  map: Rect;
  cols: number;
  rows: number;
  c: Rect; // C memory-safety panel
  rust: Rect; // Rust memory-safety panel
}

function layout(w: number, h: number): Layout {
  if (w >= h * WIDE_RATIO) {
    const r = Math.min(w * 0.17, h * 0.19);
    const panelY = h - PANEL_H;
    return {
      wide: true,
      ring: { x: w * 0.3, y: h * 0.43, r },
      map: { x: w * 0.56, y: TOP + 20, w: w * 0.44, h: panelY - PANEL_GAP * 3 - (TOP + 20) },
      cols: 12,
      rows: 10,
      c: { x: 0, y: panelY, w: w * 0.46, h: PANEL_H },
      rust: { x: w * 0.54, y: panelY, w: w * 0.46, h: PANEL_H },
    };
  }
  // Tall boxes: ring, its caption, the map, then the C and Rust panels, side by side when they fit.
  const pair = w >= PAIR_MIN_W;
  const cPanelY = pair ? h - PANEL_H : h - PANEL_H * 2 - PANEL_GAP;
  // The map keeps at least MAP_MIN of height: the ring gives way first, so the code panels never take its rows.
  const room = cPanelY - (TOP + 8) - STATUS_DY - MAP_DY - PANEL_GAP * 2 - MAP_MIN;
  const r = Math.max(RING_MIN, Math.min(w * 0.2, h * 0.12, room / 2));
  const ringY = TOP + 8 + r;
  const mapTop = ringY + r + STATUS_DY + MAP_DY;
  return {
    wide: false,
    ring: { x: w / 2, y: ringY, r },
    map: { x: 0, y: mapTop, w, h: Math.max(0, cPanelY - mapTop - PANEL_GAP * 2) },
    // Small square ticks, as many as fit, so the map reads as a fine coverage grid at any size.
    cols: Math.max(1, Math.floor((w + TILE_GAP) / (TICK + TILE_GAP))),
    rows: Math.max(1, Math.floor((cPanelY - mapTop - PANEL_GAP * 2 + TILE_GAP) / (TICK + TILE_GAP))),
    c: { x: 0, y: cPanelY, w: pair ? w * 0.48 : w, h: PANEL_H },
    rust: pair ? { x: w * 0.52, y: cPanelY, w: w * 0.48, h: PANEL_H } : { x: 0, y: h - PANEL_H, w, h: PANEL_H },
  };
}

/** Ring position of loop node k: k = 0 at the top, then clockwise. */
const nodeAngle = (k: number): number => -Math.PI / 2 + (k * Math.PI) / 2;

/** How many tiles of the map are covered at clock time `t`: it grows, then starts over. */
function covered(t: number, tiles: number): number {
  return Math.floor(clamp01((t % GROW_CYCLE_S) / GROW_S) * tiles * COVER_MAX);
}

const RANKS = new Map<number, number[]>();
/** The lighting order over the tiles: a fixed shuffle, so the map fills in scattered rather than in rows. */
function rankTable(n: number): number[] {
  const cached = RANKS.get(n);
  if (cached) return cached;
  const rand = rng(0xc0de);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const rank = new Array<number>(n);
  order.forEach((tile, k) => {
    rank[tile] = k;
  });
  RANKS.set(n, rank);
  return rank;
}

function drawTile(g: CanvasRenderingContext2D, x: number, y: number, tw: number, th: number, lit: number, recent: boolean): void {
  rrect(g, x, y, tw, th, TILE_R);
  // Pearl: an unlit tick is a faint ink tint, not a white tile.
  g.fillStyle = lit > 0 ? tint('emerald', 0.15 + 0.5 * lit) : isLight() ? 'rgb(10 63 134 / 0.07)' : `rgb(${glass()} / 0.6)`;
  g.fill();
  if (recent && lit > 0) {
    g.strokeStyle = P.ice;
    g.lineWidth = lineW(1.5);
    g.stroke();
    g.lineWidth = lineW(1);
  }
}

/** The C and Rust comparison: a title, two lines of code, and what happens when it runs. */
function drawMemory(g: CanvasRenderingContext2D, box: Rect, title: string, code: readonly string[], verdict: string, bad: boolean, t: number): void {
  // Dark keeps its glass panel; pearl sets the code straight on the surface, no card.
  if (!isLight()) {
    g.fillStyle = `rgb(${glass()} / 0.7)`;
    rrect(g, box.x, box.y, box.w, box.h, 14);
    g.fill();
  }
  caption(g, title, box.x + 14, box.y + 18, ink(0.8));
  code.forEach((line, i) => caption(g, line, box.x + 14, box.y + 36 + i * 16, ink(0.92)));
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
  const vy = box.y + box.h - 12;
  g.fillStyle = bad ? P.alert : P.ice;
  g.beginPath();
  g.arc(box.x + 18, vy - 4, 3.5 + pulse, 0, Math.PI * 2);
  g.fill();
  caption(g, verdict, box.x + 30, vy, ink(0.95));
}

function makeScene(_host: HTMLElement, reduce: boolean): Painter {
  let L = layout(0, 0);
  let w = 0;
  let h = 0;
  let pointer: Pt | null = null;
  let loopStart = reduce ? STILL_T - 2 * HOP_S : 0; // a press starts the loop over
  let hoverTile = -1;

  const pos = (): Pt[] => LOOP.map((_, k) => ({ x: L.ring.x + L.ring.r * Math.cos(nodeAngle(k)), y: L.ring.y + L.ring.r * Math.sin(nodeAngle(k)) }));
  const tileAt = (p: Pt, tiles: number): number => {
    const { map, cols, rows } = L;
    const tw = (map.w - TILE_GAP * (cols - 1)) / cols;
    const th = (map.h - TILE_GAP * (rows - 1)) / rows;
    const col = Math.floor((p.x - map.x) / (tw + TILE_GAP));
    const row = Math.floor((p.y - map.y) / (th + TILE_GAP));
    if (col < 0 || row < 0 || col >= cols || row >= rows) return -1;
    const i = row * cols + col;
    return i < tiles ? i : -1;
  };

  const drawRing = (g: CanvasRenderingContext2D, p: number): void => {
    const { ring } = L;
    g.strokeStyle = stroke('cyan', 0.16);
    g.lineWidth = lineW(1);
    g.beginPath();
    g.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
    g.stroke();
    // The travelled part of the loop is lit; the token rides the front of it.
    const end = nodeAngle(0) + p * (Math.PI / 2);
    g.strokeStyle = P.ice;
    g.lineWidth = lineW(2);
    g.beginPath();
    g.arc(ring.x, ring.y, ring.r, nodeAngle(0), end);
    g.stroke();
    g.lineWidth = lineW(1);
    const tok = { x: ring.x + ring.r * Math.cos(end), y: ring.y + ring.r * Math.sin(end) };
    g.fillStyle = P.white;
    g.beginPath();
    g.arc(tok.x, tok.y, TOKEN_R, 0, Math.PI * 2);
    g.fill();
    // The input's bytes ride beside the token, and step aside while it passes a node.
    if (pos().every((n) => Math.hypot(n.x - tok.x, n.y - tok.y) > HEX_CLEAR)) {
      // Outside the ring, so it never reads as a second line of the TRIAGE label inside it.
      const [ux, uy] = [Math.cos(end), Math.sin(end)];
      g.textAlign = ux > 0.2 ? 'left' : ux < -0.2 ? 'right' : 'center';
      caption(g, `0x${hex(Math.floor(p * 97) + 0x3a, 2)} ${hex(Math.floor(p * 53) + 0x7f, 2)}`, tok.x + ux * HEX_DX, tok.y + uy * HEX_DX + 4 + (uy > 0.2 ? 8 : 0), ink(0.7));
      g.textAlign = 'left';
    }
  };

  const drawNodes = (g: CanvasRenderingContext2D, p: number, nodes: Pt[], crash: boolean): void => {
    const active = Math.min(LOOP.length - 1, Math.floor(p));
    nodes.forEach((n, k) => {
      const on = k <= p;
      g.fillStyle = on ? tint('cyan', 0.9) : tint('cyan', 0.3);
      g.beginPath();
      g.arc(n.x, n.y, k === active ? 5.5 : 4, 0, Math.PI * 2);
      g.fill();
      // The nodes carry no names: the rail above names every step, and the active one is lit on both.
    });
    // Triage: the crashing input leaves the loop for the centre bucket.
    const c = L.ring;
    const triage = p >= 2 && p < 3 && crash;
    g.strokeStyle = triage ? P.alert : tint('cyan', 0.25);
    g.lineWidth = lineW(triage ? 1.5 : 1);
    g.beginPath();
    g.arc(c.x, c.y, 10, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = lineW(1);
    caption(g, 'TRIAGE', c.x - 26, c.y + 26, triage ? P.alert : ink(0.6));
  };

  const drawMap = (g: CanvasRenderingContext2D, t: number): void => {
    const { map, cols, rows } = L;
    const tiles = cols * rows;
    const tw = (map.w - TILE_GAP * (cols - 1)) / cols;
    const th = (map.h - TILE_GAP * (rows - 1)) / rows;
    const n = covered(t, tiles);
    const ranks = rankTable(tiles);
    for (let i = 0; i < tiles; i++) {
      const rank = ranks[i];
      const x = map.x + (i % cols) * (tw + TILE_GAP);
      const y = map.y + Math.floor(i / cols) * (th + TILE_GAP);
      const lit = rank < n ? 1 - rank / Math.max(1, n) * 0.4 : 0;
      drawTile(g, x, y, tw, th, lit, rank >= n - RECENT && rank < n);
    }
    if (hoverTile >= 0) {
      const x = map.x + (hoverTile % cols) * (tw + TILE_GAP);
      const y = map.y + Math.floor(hoverTile / cols) * (th + TILE_GAP);
      g.strokeStyle = P.white;
      g.lineWidth = lineW(1.5);
      rrect(g, x, y, tw, th, TILE_R);
      g.stroke();
      g.lineWidth = lineW(1);
    }
    caption(g, 'COVERAGE MAP · ILLUSTRATION', map.x, map.y - 10, ink(0.78));
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      L = layout(w, h);
    },
    pointer(kind: PointerKind, x: number, y: number) {
      pointer = kind === 'leave' ? null : { x, y };
      hoverTile = pointer ? tileAt(pointer, L.cols * L.rows) : -1;
    },
    act(t) {
      loopStart = t;
    },
    draw(g, _cw, _ch, t) {
      const p = railPos(t - loopStart, LOOP.length, HOP_S);
      const round = Math.floor((t - loopStart) / (LOOP.length * HOP_S));
      const crash = round % CRASH_EVERY === CRASH_EVERY - 1;
      drawRail(g, { x: 0, y: RAIL_Y, w }, LOOP, p);
      drawRing(g, p);
      const nodes = pos();
      drawNodes(g, p, nodes, crash);
      const status = p >= 3 && crash ? STATUS_CRASH : STATUS[Math.min(STATUS.length - 1, Math.floor(p))];
      // The step caption sits under the ring, so no line runs through its words.
      g.textAlign = 'center';
      caption(g, status, L.ring.x, L.ring.y + L.ring.r + STATUS_DY, ink(0.95));
      g.textAlign = 'left';
      drawMap(g, t);
      drawMemory(g, L.c, 'C · READ AFTER FREE', ['free(p);', '*p;  // compiles, runs'], 'undefined behaviour', true, t);
      drawMemory(g, L.rust, 'RUST · BORROW OUTLIVES OWNER', ['let r = &v[0]; drop(v);', 'use(r);  // compile error'], 'never runs', false, t);
    },
  };
}

export function mountFuzz(host: HTMLElement): void {
  mountScene(host, makeScene);
}
