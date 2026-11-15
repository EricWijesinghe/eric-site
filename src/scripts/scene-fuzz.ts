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
const TILE_R = 4;
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
  const cPanelY = h - PANEL_H * 2 - PANEL_GAP;
  const mapTop = 248;
  const r = Math.min(w * 0.22, h * 0.15);
  return {
    wide: false,
    ring: { x: w / 2, y: 124, r },
    map: { x: 0, y: mapTop, w, h: cPanelY - mapTop - PANEL_GAP },
    cols: 16,
    rows: 3,
    c: { x: 0, y: cPanelY, w, h: PANEL_H },
    rust: { x: 0, y: h - PANEL_H, w, h: PANEL_H },
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
  g.fillStyle = lit > 0 ? tint('emerald', 0.15 + 0.5 * lit) : `rgb(${glass()} / 0.6)`;
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
  g.fillStyle = `rgb(${glass()} / 0.7)`;
  rrect(g, box.x, box.y, box.w, box.h, 14);
  g.fill();
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
    caption(g, `0x${hex(Math.floor(p * 97) + 0x3a, 2)} ${hex(Math.floor(p * 53) + 0x7f, 2)}`, tok.x + 8, tok.y - 8, ink(0.7));
  };

  const drawNodes = (g: CanvasRenderingContext2D, p: number, nodes: Pt[], crash: boolean): void => {
    const active = Math.min(LOOP.length - 1, Math.floor(p));
    nodes.forEach((n, k) => {
      const on = k <= p;
      g.fillStyle = on ? tint('cyan', 0.9) : tint('cyan', 0.3);
      g.beginPath();
      g.arc(n.x, n.y, k === active ? 5.5 : 4, 0, Math.PI * 2);
      g.fill();
      const name = LOOP[k];
      const width = name.length * 7.2;
      if (k === 0) caption(g, name, n.x - width / 2, n.y - 14, ink(0.9));
      // Side labels sit inside the ring on wide scenes, outside it on narrow ones where the ring is small.
      else if (k === 1) caption(g, name, L.wide ? n.x - 12 - width : n.x + 12, n.y + 4, ink(0.9));
      else if (k === 2) caption(g, name, n.x - width / 2, n.y + 22, ink(0.9));
      else caption(g, name, L.wide ? n.x + 12 : n.x - 12 - width, n.y + 4, ink(0.9));
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
      // The status sits on a glass chip so the ring line never runs through its words.
      const sw = status.length * 7.2 + 14;
      g.fillStyle = `rgb(${glass()} / 0.75)`;
      rrect(g, L.ring.x - sw / 2, L.ring.y + 32, sw, 22, 8);
      g.fill();
      caption(g, status, L.ring.x - sw / 2 + 7, L.ring.y + 47, ink(0.95));
      drawMap(g, t);
      drawMemory(g, L.c, 'C · READ AFTER FREE', ['free(p);', '*p;  // compiles, runs'], 'undefined behaviour', true, t);
      drawMemory(g, L.rust, 'RUST · BORROW OUTLIVES OWNER', ['let r = &v[0]; drop(v);', 'use(r);  // compile error'], 'never runs', false, t);
    },
  };
}

export function mountFuzz(host: HTMLElement): void {
  mountScene(host, makeScene);
}
