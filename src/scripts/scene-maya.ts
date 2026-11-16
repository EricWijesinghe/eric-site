// Maya2C, the showpiece: one transaction's life and the two proofs it carries. A step rail names the
// stages (sign, mempool, DAG vertex, certificate, leader anchor, final). The block DAG grows with the
// real chain. ML-DSA rejects and retries until a signature lands inside its bound; the SLH-DSA tree
// hashes a revealed leaf up to its root; both proofs converge on one seal that locks when both have
// verified. Real data lives only in the HUD and in the block heights the poller reports. Cell texture
// is decorative and never stands for chain data.
import {
  caption,
  clamp01,
  easeOut,
  flashRgb,
  ink,
  isLight,
  mountScene,
  onChain,
  PALETTE as P,
  rgbOf,
  rng,
  stroke, tint,
  type Painter,
  type PointerKind,
  type Pt,
  type Rect,
  type Spot,
} from './scene-core';
import { lineW } from './scene-core';
import { drawDag, type Block, type DagOut } from './scene-maya-dag';
import { makeLattice } from './scene-maya-lattice';
import { makeTree } from './scene-maya-tree';
import { drawRail, railPos } from './scene-steps';
import { within, type RegionOut, type Ui } from './scene-maya-types';

const RAIL_LABELS = ['SIGN', 'MEMPOOL', 'DAG VERTEX', 'CERTIFICATE', 'LEADER ANCHOR', 'FINAL'] as const;
const RAIL_DWELL = 2.4; // seconds per station: the rail completes one pass per proof cycle
const CYCLE = RAIL_LABELS.length * RAIL_DWELL; // seconds for one full proof-and-seal loop
const SEAL_AT = 7.4; // both proofs have verified: the seal starts to gather them
const LOCK_AT = 8.8; // the seal locks with a flash
const LOCK_GROW_S = 0.5;
const FLASH_S = 1.2;
const MAX_BLOCKS = 16;
const STRUCT_BLOCKS = MAX_BLOCKS; // structure drawn at rest before any live block arrives: the band is never half empty
const SPIN = 0.4; // seal rotation before it locks
const GAP_OPEN = 0.9; // radians of each arc gap while the seal is open
const SEAL_LABEL = 'both must verify';
const LOCKED_LABEL = 'both verified · sealed';
const SEAL_HIT = 2.5; // the seal answers to a press this many radii around it
const SPIN_PER_PX = 0.011; // lattice yaw per pixel dragged
const TILT_PER_PX = 0.008;
const TILT_CLAMP = 0.9;
const REDUCED_LOCK_FROM = LOCK_AT - 1.6; // reduced motion: start the replay just before the lock
const RAIL_Y = 12; // the rail's line; its names sit under it
const TOP = 62; // the DAG band starts below the rail (its names end near y 58)
const WIDE_RATIO = 1.15; // same wide/narrow split as the other scenes
const DAG_WIDE = 0.36; // wide: the DAG's share of the height under the rail (four vertex rows)
const DAG_STACK = 0.36; // narrow: shares of the height left after the rail and the seal, chip rows included
const LAT_STACK = 0.34;
const SEAL_BAND = 0.15; // wide: the seal's share of the height
const SIDE_INSET = 8; // stacked: the proof links run down the band's sides, never across the tree
const LINK_R = 24; // px: corner radius of a stacked link
const SEAL_NARROW = 96; // px: narrow, the seal's own band under the tree
const SEAL_CLEAR = 32; // px between the tree's band and the seal's centre
const SEAL_TEXT = 'The seal locks only when ML-DSA and SLH-DSA both verify. Press it to replay.';

interface Layout {
  dag: Rect;
  lattice: Rect;
  tree: Rect;
  seal: Pt;
  sealR: number;
  stacked: boolean;
}

/** Wide: DAG on top, lattice and tree side by side, seal below. Narrow: everything stacked. */
export function layout(w: number, h: number): Layout {
  if (w >= h * WIDE_RATIO) {
    const dagH = (h - TOP) * DAG_WIDE;
    const sealH = h * SEAL_BAND;
    const lowY = TOP + dagH;
    const lowH = h - lowY - sealH;
    return {
      dag: { x: 0, y: TOP, w, h: dagH },
      lattice: { x: 0, y: lowY, w: w / 2, h: lowH },
      tree: { x: w / 2, y: lowY, w: w / 2, h: lowH },
      seal: { x: w / 2, y: h - sealH / 2 },
      sealR: Math.min(sealH * 0.22, 22),
      stacked: false,
    };
  }
  const body = Math.max(0, h - TOP - SEAL_NARROW);
  const dagH = body * DAG_STACK;
  const latH = body * LAT_STACK;
  const treeH = body - dagH - latH;
  const sealTop = TOP + body;
  return {
    dag: { x: 0, y: TOP, w, h: dagH },
    lattice: { x: 0, y: TOP + dagH, w, h: latH },
    tree: { x: 0, y: TOP + dagH + latH, w, h: treeH },
    seal: { x: w / 2, y: sealTop + SEAL_CLEAR },
    sealR: 14,
    stacked: true,
  };
}

/** Wide: a curve over the gap from a proof's point to the seal. Returns where the bead is at `u`. */
function arcLink(g: CanvasRenderingContext2D, a: Pt, s: Pt, R: number, u: number): Pt {
  const cx = (a.x + s.x) / 2;
  const cy = Math.min(a.y, s.y) - R * 2;
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.quadraticCurveTo(cx, cy, s.x, s.y);
  g.stroke();
  return { x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * cx + u * u * s.x, y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * cy + u * u * s.y };
}

/** Stacked: out to one side, down the band's inset and into the seal, so the link never crosses the tree. */
function sideLink(g: CanvasRenderingContext2D, L: Layout, a: Pt, sideX: number, u: number): Pt {
  const pts: Pt[] = [a, { x: sideX, y: a.y }, { x: sideX, y: L.seal.y }, L.seal];
  g.beginPath();
  g.moveTo(a.x, a.y);
  for (let i = 1; i < pts.length - 1; i++) g.arcTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, LINK_R);
  g.lineTo(L.seal.x, L.seal.y);
  g.stroke();
  // The bead walks the corners' polyline by length; the rounded corners are too small to show the gap.
  const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  let left = u * seg.reduce((s, d) => s + d, 0);
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, left / seg[i]) : 1;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k };
    }
    left -= seg[i];
  }
  return L.seal;
}

/** The seal: each proof's point is joined to it by a curve, and the bead rides the curve as it gathers. */
function drawSeal(g: CanvasRenderingContext2D, L: Layout, c: number, anchors: Pt[]): void {
  const { x, y } = L.seal;
  const R = L.sealR;
  if (c >= SEAL_AT) {
    const u = clamp01((c - SEAL_AT) / (LOCK_AT - SEAL_AT));
    g.strokeStyle = isLight() ? rgbOf('violet', 0.45) : stroke('violet', 0.3);
    g.lineWidth = 1;
    anchors.forEach((a, k) => {
      const b = L.stacked ? sideLink(g, L, a, k === 0 ? SIDE_INSET : L.tree.w - SIDE_INSET, u) : arcLink(g, a, L.seal, R, u);
      g.fillStyle = P.ice;
      g.beginPath();
      g.arc(b.x, b.y, 2.4, 0, Math.PI * 2);
      g.fill();
    });
  }

  const lock = easeOut((c - LOCK_AT) / LOCK_GROW_S);
  const flash = clamp01(1 - (c - LOCK_AT) / FLASH_S);
  if (flash > 0 && c >= LOCK_AT) {
    const glow = g.createRadialGradient(x, y, R * 0.2, x, y, R * 7);
    glow.addColorStop(0, `rgb(${flashRgb()} / ${0.7 * flash})`);
    glow.addColorStop(1, tint('indigo', 0));
    g.fillStyle = glow;
    g.fillRect(x - R * 7, y - R * 7, R * 14, R * 14);
  }

  const turn = c * SPIN * (1 - lock);
  const gap = GAP_OPEN * (1 - lock);
  g.strokeStyle = c >= LOCK_AT ? P.ice : tint('cyan', 0.6);
  g.lineWidth = lineW(2);
  for (let k = 0; k < 4; k++) {
    const start = turn + (k * Math.PI) / 2 + gap / 2;
    g.beginPath();
    g.arc(x, y, R, start, start + Math.PI / 2 - gap);
    g.stroke();
  }
  g.fillStyle = c >= LOCK_AT ? P.white : tint('cyan', 0.5);
  g.beginPath();
  g.arc(x, y, R * 0.18, 0, Math.PI * 2);
  g.fill();

  g.textAlign = 'center';
  const text = c >= LOCK_AT ? LOCKED_LABEL : SEAL_LABEL;
  caption(g, text, x, y + R + 22, ink(c >= LOCK_AT ? 0.95 : 0.5));
  g.textAlign = 'left';
}

function makePainter(host: HTMLElement, reduce: boolean): Painter {
  const lattice = makeLattice('ML-DSA · LATTICE');
  const tree = makeTree('SLH-DSA · HASH TREE');
  const figure = host.closest('figure, .stage'); // carries data-live, which picks the stage tag
  const seeds = rng(0xb10c);
  let L = layout(0, 0);
  let clock = 0;
  let arrivedAt = -Infinity;
  let prevHeight: number | null = null;
  let phaseStart = 0; // the proof loop runs from here; a press on the seal moves it
  let nextSeed = Math.floor(seeds() * 1e6) + 1;
  const blocks: Block[] = Array.from({ length: STRUCT_BLOCKS }, () => ({ seed: nextSeed++, live: false }));
  const ui: Ui = { hover: null, spin: 0, tilt: 0 };
  let out: { dag: DagOut; lat: RegionOut; tree: RegionOut } | null = null;
  let drag: { x: number; y: number; spin: number; tilt: number } | null = null;

  // Only a height that moved while the poller says live adds a block: never a made-up one.
  onChain((d) => {
    figure?.setAttribute('data-live', String(d.live));
    if (d.height === null) return;
    if (prevHeight !== null && d.height > prevHeight && d.live) {
      blocks.push({ seed: nextSeed++, live: true, height: d.height });
      if (blocks.length > MAX_BLOCKS) blocks.shift();
      arrivedAt = clock;
    }
    prevHeight = d.height;
  });

  const replay = (t: number): void => {
    phaseStart = t - (reduce ? REDUCED_LOCK_FROM : 0);
  };
  const onSeal = (x: number, y: number): boolean =>
    Math.hypot(x - L.seal.x, y - L.seal.y) <= Math.max(L.sealR * SEAL_HIT, 22);

  return {
    resize(w, h) {
      L = layout(w, h);
    },
    pointer(kind: PointerKind, x: number, y: number, t: number) {
      ui.hover = kind === 'leave' ? null : { x, y };
      if (kind === 'down') {
        if (onSeal(x, y)) {
          replay(t);
          return;
        }
        drag = { x, y, spin: ui.spin, tilt: ui.tilt };
      } else if (kind === 'move' && drag) {
        ui.spin = drag.spin + (x - drag.x) * SPIN_PER_PX;
        ui.tilt = Math.min(TILT_CLAMP, Math.max(-TILT_CLAMP, drag.tilt + (y - drag.y) * TILT_PER_PX));
      } else if (kind === 'up' || kind === 'leave') {
        drag = null;
      }
    },
    act(t) {
      replay(t);
    },
    spots(): Spot[] {
      if (!out) return [];
      return [...out.dag.spots, ...out.lat.spots, ...out.tree.spots, { ...L.seal, label: 'both-verify seal: press to replay' }];
    },
    inspect() {
      if (!out || !ui.hover) return null;
      if (onSeal(ui.hover.x, ui.hover.y)) return SEAL_TEXT;
      return out.dag.hot ?? out.tree.hot ?? out.lat.hot;
    },
    draw(g, w, _h, t) {
      clock = t;
      const c = (((t - phaseStart) % CYCLE) + CYCLE) % CYCLE;
      const step = railPos(c, RAIL_LABELS.length, RAIL_DWELL);
      drawRail(g, { x: 0, y: RAIL_Y, w }, RAIL_LABELS, step);
      // Each painter is clipped to its own band, so no drawing crosses into a neighbour or its labels.
      const clipped = <T>(r: Rect, fn: () => T): T => {
        g.save();
        g.beginPath();
        g.rect(r.x, r.y, r.w, r.h);
        g.clip();
        const v = fn();
        g.restore();
        return v;
      };
      const hoverIn = (r: Rect): Ui => (within(ui.hover, r) ? ui : { ...ui, hover: null });
      const dag = clipped(L.dag, () => drawDag(g, L.dag, blocks, arrivedAt, clock, hoverIn(L.dag).hover, step));
      const lat = clipped(L.lattice, () => lattice.draw(g, L.lattice, c, t, ui));
      const tr = clipped(L.tree, () => tree.draw(g, L.tree, c, t, hoverIn(L.tree)));
      out = { dag, lat, tree: tr };
      drawSeal(g, L, c, [lat.anchor, tr.anchor]);
    },
  };
}

export function mountMaya(host: HTMLElement): void {
  mountScene(host, makePainter);
}
