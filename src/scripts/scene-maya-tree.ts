// SLH-DSA as a hash-based signature. The signature reveals one leaf and its authentication path (the
// sibling node at each level). A verifier hashes the leaf with its siblings, level by level, and
// compares the result with the public root. SLH-DSA stacks such trees in layers (a hypertree) and
// uses few-time trees at its base; this drawing shows one layer, which is the same mechanism.
import { CHIP_ZONE, chip, chipY, clamp01, ink, PALETTE as P, stroke, tint, txt, type Pt, type Spot } from './scene-core';
import { lineW } from './scene-core';
import { hex } from './scene-glyphs';
import type { Region, Ui } from './scene-maya-types';

const DEPTH = 3;
const LEAVES = 1 << DEPTH;
const PATH_LEAF = 5; // the leaf this signature reveals
const LEAF_START = 0.3; // leaves are hashed from their secrets one after another
const LEAF_STEP = 0.12;
const AUTH_AT = 1.4; // the signature's authentication path lights up
const HASH_START = 1.9; // hashing up begins
const LEVEL_DELAY = 0.45; // seconds each level takes to hash up
export const ROOT_AT = HASH_START + DEPTH * LEVEL_DELAY;
const MATCH_AT = ROOT_AT + 0.3; // the root is compared with the public key
const HOVER_R = 14; // px: how near the pointer must be to pick a node
const PAD = 26;
const NODE_R = 4;
const ROOT_R = 5.5;
const ROUND_S = 0.9; // seconds a hashing node streams its digest
const ROUND_TICKS = 12;
const ROUND_DIGITS = 6;
const ROUND_FONT = '12px "JetBrains Mono", ui-monospace, monospace';
const TOP_GAP = 18; // px between the chip rows and the root, room for the root's match ring
const BOTTOM_GAP = 12;
const LABEL_Y = chipY(1); // the step chip sits under the title chip, with its 8px gap

interface Hot {
  lvl: number;
  j: number;
}

/** The time a node becomes known: a leaf once its secret is hashed, a parent once it has hashed up. */
const hashedAt = (lvl: number, j: number): number => (lvl === 0 ? LEAF_START + j * LEAF_STEP : HASH_START + lvl * LEVEL_DELAY);

/** The node index on the revealed path at a level, and its sibling (the authentication path). */
const pathAt = (lvl: number): number => PATH_LEAF >> lvl;
const siblingAt = (lvl: number): number => pathAt(lvl) ^ 1;

/** The tree node nearest the pointer, if it is within reach. */
function nearestNode(pos: (lvl: number, j: number) => Pt, at: Pt | null): Hot | null {
  if (!at) return null;
  let best: Hot | null = null;
  let bestD = HOVER_R * HOVER_R;
  for (let lvl = 0; lvl <= DEPTH; lvl++) {
    for (let j = 0; j < LEAVES >> lvl; j++) {
      const p = pos(lvl, j);
      const d = (p.x - at.x) ** 2 + (p.y - at.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { lvl, j };
      }
    }
  }
  return best;
}

/** Lights the chain of hashes from a picked node up to the root. */
function drawPathToRoot(g: CanvasRenderingContext2D, pos: (lvl: number, j: number) => Pt, hot: Hot): void {
  g.strokeStyle = P.ice;
  g.lineWidth = lineW(2);
  let lvl = hot.lvl;
  let j = hot.j;
  while (lvl < DEPTH) {
    const child = pos(lvl, j);
    const parent = pos(lvl + 1, j >> 1);
    g.beginPath();
    g.moveTo(child.x, child.y);
    g.lineTo(parent.x, parent.y);
    g.stroke();
    lvl += 1;
    j >>= 1;
  }
  g.lineWidth = lineW(1);
}

/** The caption under the label: the verifier's step at this moment of the cycle. */
function stepText(c: number): string {
  if (c < AUTH_AT) return 'leaves: hash of each secret';
  if (c < HASH_START) return 'reveal leaf + auth path';
  if (c < ROOT_AT) return 'verifier hashes up: H(l || r)';
  if (c < MATCH_AT) return 'root reached';
  return 'root matches the public key';
}

/** The inspect line for a node. */
function nodeText(n: Hot): string {
  if (n.lvl === DEPTH) return "Root: the verifier's hash chain must end here, at the public key's root.";
  if (n.lvl > 0) return `Level ${n.lvl} node: H(left ‖ right) of the two nodes under it. Its path to the root is lit.`;
  const which = n.j === PATH_LEAF ? 'the leaf this signature reveals' : 'the hash of a one-time key';
  return `Leaf ${n.j + 1} of ${LEAVES}: ${which}. Its path to the root is lit.`;
}

/** SLH-DSA: a revealed leaf and its authentication path hash up to the public root. */
export function makeTree(label: string): Region {
  return {
    draw(g, r, c, _t, ui: Ui) {
      // Leaves at the bottom of the band, the root just under the chip rows: no node sits on a label.
      const top = r.y + CHIP_ZONE + TOP_GAP;
      const bottom = Math.max(top, r.y + r.h - BOTTOM_GAP);
      const pos = (lvl: number, j: number): Pt => {
        const span = (r.w - PAD * 2) / (LEAVES >> lvl);
        return { x: r.x + PAD + span * (j + 0.5), y: bottom - ((bottom - top) * lvl) / DEPTH };
      };
      const hot = nearestNode(pos, ui.hover);

      // Edges: a hairline for each child-to-parent link; the revealed path's links carry a hashing dot.
      g.lineWidth = lineW(1);
      for (let lvl = 1; lvl <= DEPTH; lvl++) {
        for (let j = 0; j < LEAVES >> lvl; j++) {
          const parent = pos(lvl, j);
          for (const ch of [2 * j, 2 * j + 1]) {
            const child = pos(lvl - 1, ch);
            const onPath = ch === pathAt(lvl - 1);
            const lit = c >= hashedAt(lvl - 1, ch);
            g.strokeStyle = onPath && c >= AUTH_AT ? P.ice : tint('cyan', lit ? 0.5 : 0.3);
            g.beginPath();
            g.moveTo(child.x, child.y);
            g.lineTo(parent.x, parent.y);
            g.stroke();
            const start = HASH_START + (lvl - 1) * LEVEL_DELAY;
            if (onPath && c >= start && c < start + LEVEL_DELAY) {
              const u = clamp01((c - start) / LEVEL_DELAY);
              g.fillStyle = P.cyan;
              g.beginPath();
              g.arc(child.x + (parent.x - child.x) * u, child.y + (parent.y - child.y) * u, 2.4, 0, Math.PI * 2);
              g.fill();
            }
          }
        }
      }

      if (hot) drawPathToRoot(g, pos, hot);

      // Nodes: a teal node is known; the revealed leaf and its siblings ring in ice.
      for (let lvl = 0; lvl <= DEPTH; lvl++) {
        for (let j = 0; j < LEAVES >> lvl; j++) {
          const q = pos(lvl, j);
          const at = hashedAt(lvl, j);
          const known = c >= at;
          const flash = known ? clamp01(1 - (c - at) / 0.5) : 0;
          const isAuth = j === siblingAt(lvl) || j === pathAt(lvl);
          const size = lvl === DEPTH ? ROOT_R : NODE_R;
          g.fillStyle = known ? P.teal : tint('cyan', 0.38); // an unhashed node is still drawn, never a blank band
          g.beginPath();
          g.arc(q.x, q.y, size, 0, Math.PI * 2);
          g.fill();
          if (flash > 0) {
            g.strokeStyle = `rgb(${txt()} / ${0.8 * flash})`;
            g.beginPath();
            g.arc(q.x, q.y, size + 4, 0, Math.PI * 2);
            g.stroke();
          }
          if (isAuth && c >= AUTH_AT && c < ROOT_AT + 0.5) {
            g.strokeStyle = stroke('cyan', 0.9);
            g.beginPath();
            g.arc(q.x, q.y, size + 2.5, 0, Math.PI * 2);
            g.stroke();
          }
        }
      }

      // Hashing: a node that has just hashed streams its digest in hex beside itself.
      g.font = ROUND_FONT;
      for (let lvl = 0; lvl <= DEPTH; lvl++) {
        for (let j = 0; j < LEAVES >> lvl; j++) {
          const age = c - hashedAt(lvl, j);
          if (lvl === 0 || age < 0 || age >= ROUND_S) continue;
          const q = pos(lvl, j);
          const digest = hex(lvl * 97 + j * 13 + Math.floor(age * ROUND_TICKS), ROUND_DIGITS);
          g.fillStyle = tint('azure', 0.8 * (1 - age / ROUND_S));
          g.fillText(digest, q.x + 9, q.y - 5);
        }
      }

      // The root is compared with the public key: a ring that holds once the two agree.
      const root = pos(DEPTH, 0);
      if (c >= MATCH_AT) {
        g.strokeStyle = P.ice;
        g.lineWidth = lineW(1.5);
        g.beginPath();
        g.arc(root.x, root.y, ROOT_R + 9, 0, Math.PI * 2);
        g.stroke();
        g.lineWidth = lineW(1);
      }

      chip(g, label, r.x + 16, r.y + chipY(0), ink(0.9));
      chip(g, stepText(c), r.x + 16, r.y + LABEL_Y, ink(0.95));
      const spots: Spot[] = [];
      for (let lvl = DEPTH; lvl >= 0; lvl--) {
        for (let j = 0; j < LEAVES >> lvl; j++) {
          const name = lvl === DEPTH ? 'hash tree root' : lvl === 0 ? `hash tree leaf ${j + 1}` : `hash tree node, level ${lvl}`;
          spots.push({ ...pos(lvl, j), label: name });
        }
      }
      return { anchor: root, spots, hot: hot ? nodeText(hot) : null };
    },
  };
}

