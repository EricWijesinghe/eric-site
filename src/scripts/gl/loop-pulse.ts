// One change travelling the loop. The pulse is a comet on the track; in each phase it changes shape to
// show the real mechanism (shape and behaviour, never colour), with at most a handful of glyphs alive:
// WRITE gathers code, CHECK stops a second &mut at the gate, RUN takes turns on three strands, TRACE
// sends the handshake as header|payload packets, BREAK flips bits and strikes the core. A phase without
// a morph (or reduced motion) falls back to the plain comet.
import { PHASE_ARC, PHASES, RING } from '../../data/spectrum';
import { coreCentre, depthK, edgeFade, FONT_PX, MONO, starPos, CORE_EDGE_COUNT, type Frame, type Label } from './loop-draw';
import { lift, project3, projectRing, TAU, type Projected } from './loop-geom';
import { rgba } from './loop-palette';

/** One full loop of the pulse, in ms: about 4 s per phase. Tuned by eye. */
export const LOOP_MS = 20000;
const COMET_LEN = 0.42;
const COMET_STEPS = 22;
const STRAND_K = 0.055;
const RUN_SLOTS = 12;
const ALIGN_HOLD_MS = 7000;

const WRITE = 0;
const CHECK = 1;
const RUN = 2;
const TRACE = 3;
const BREAK = 4;
const WRITE_GAP = 10;

export const headAngle = (clock: number): number => ((clock % LOOP_MS) / LOOP_MS) * TAU;

const tmp: Projected = { x: 0, y: 0, s: 1, z: 0 };
const tmpC: Projected = { x: 0, y: 0, s: 1, z: 0 };
const ease = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
const window01 = (u: number, a: number, b: number): number => ease((u - a) / (b - a));
const at = (f: Frame, theta: number, k = 1, h = 0, out: Projected = tmp): Projected =>
  projectRing(theta, lift(theta, f.t, f.plucks) + h, f.v, k, out);

/** Glyphs sit on the inner side of the track (toward the core), so they never collide with the names outside it. */
const INWARD_PX = 16;
/** Glyphs read only on the front arc; on the sides and far half they would be small clutter over the names. */
let glyphK = 1;
/** Skill names on screen this frame: a glyph never lands within AVOID_PX of one. */
let avoid: readonly Label[] = [];
/** Glyphs drawn this frame, so the core's caption can step aside for them. */
const drawn: { x: number; y: number; hw: number; hh: number }[] = [];
const AVOID_PX = 8;
const VISIBLE_A = 0.05;

function glyph(f: Frame, text: string, x0: number, y0: number, a: number, hollow = false): void {
  const { g, pal } = f;
  const c = project3(0, 0, 0, f.v, tmpC);
  const len = Math.hypot(c.x - x0, c.y - y0) || 1;
  const x = x0 + ((c.x - x0) / len) * INWARD_PX;
  const y = y0 + ((c.y - y0) / len) * INWARD_PX;
  const k = a * glyphK * edgeFade(f, x, y);
  if (k <= 0.01) return;
  g.font = MONO;
  const hw = g.measureText(text).width / 2 + AVOID_PX;
  const hh = FONT_PX / 2 + AVOID_PX;
  if (avoid.some((b) => b.a > VISIBLE_A && Math.abs(b.x - x) < b.hw + hw && Math.abs(b.y - y) < b.hh + hh)) return;
  drawn.push({ x, y, hw, hh });
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (hollow) {
    g.strokeStyle = rgba(pal.caption, k);
    g.lineWidth = 1;
    g.strokeText(text, x, y);
    return;
  }
  g.lineWidth = 3;
  g.strokeStyle = rgba(pal.knock, 0.85 * k);
  g.strokeText(text, x, y);
  g.fillStyle = rgba(pal.label, k);
  g.fillText(text, x, y);
}

/** The plain comet: a tapering stroke behind a bright head, riding the plucked track. */
function comet(f: Frame, theta: number, k = 1, len = COMET_LEN, headPx = 3.4): void {
  const { g, pal } = f;
  let px = 0;
  let py = 0;
  for (let i = 0; i <= COMET_STEPS; i++) {
    const p = at(f, theta - (len * i) / COMET_STEPS, k);
    const w = 1 - i / COMET_STEPS;
    if (i) {
      g.strokeStyle = rgba(pal.core, w ** 1.4 * depthK(f, p.z) * edgeFade(f, p.x, p.y));
      g.lineWidth = 0.6 + 2.2 * w * p.s;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(p.x, p.y);
      g.stroke();
    }
    px = p.x;
    py = p.y;
  }
  const h = at(f, theta, k);
  const a = edgeFade(f, h.x, h.y);
  const r = 16 * h.s;
  const grad = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, r);
  grad.addColorStop(0, rgba(pal.core, (0.22 + 0.48 * pal.glow) * a));
  grad.addColorStop(1, rgba(pal.core, 0));
  g.globalCompositeOperation = pal.glow > 0.5 ? 'lighter' : 'source-over';
  g.fillStyle = grad;
  g.fillRect(h.x - r, h.y - r, r * 2, r * 2);
  g.globalCompositeOperation = 'source-over';
  g.beginPath();
  g.arc(h.x, h.y, headPx * h.s, 0, TAU);
  g.fillStyle = rgba(pal.glow > 0.5 ? [255, 255, 255] : pal.core, a);
  g.fill();
}

/* ---------- the five morphs; u is progress through the phase, 0..1 ---------- */

function write(f: Frame, theta: number, u: number): void {
  comet(f, theta);
  const h = at(f, theta);
  const hx = h.x;
  const hy = h.y;
  const gl = PHASES[WRITE].glyphs;
  // The tokens gather toward the head but stop where neighbours would touch: on an ellipse rx = 1.4r,
  // ry = 0.7r, adjacent tokens sit about rx * TAU / n apart across and ry * TAU / n apart down.
  f.g.font = MONO;
  const widest = Math.max(...gl.map((t) => f.g.measureText(t).width));
  const step = TAU / gl.length;
  const rMin = Math.max((widest + WRITE_GAP) / (1.4 * step), (FONT_PX + WRITE_GAP) / (0.7 * step));
  gl.forEach((t, i) => {
    const a0 = i * step + f.t * 0.0006;
    const r = Math.max(rMin, 8 + 38 * (1 - ease(u * 1.15)));
    const alpha = window01(u, i * 0.06, i * 0.06 + 0.2) * (1 - window01(u, 0.82, 1));
    glyph(f, t, hx + Math.cos(a0) * r * 1.4, hy + Math.sin(a0) * r * 0.7 - 14, 0.9 * alpha);
  });
}

function check(f: Frame, theta: number, u: number): void {
  const gate = CHECK * PHASE_ARC;
  const h = at(f, theta);
  const hx = h.x;
  const hy = h.y;
  // The cluster that arrives at the gate: one &mut plus shared borrows, and a second &mut behind it.
  const fuse = window01(u, 0.32, 0.5);
  const cluster = ['&', '&mut', "'a"];
  cluster.forEach((t, i) => {
    const a0 = (i / cluster.length) * TAU + 0.6;
    const r = 18 * (1 - fuse);
    glyph(f, t, hx + Math.cos(a0) * r * 1.5, hy + Math.sin(a0) * r - 4, 0.95 * (1 - fuse));
  });
  // The second &mut is stopped at the gate: it goes hollow and falls away below the track.
  const stop = at(f, Math.min(theta - 0.05, gate + 0.04), 1, 0, { x: 0, y: 0, s: 1, z: 0 });
  const fall = window01(u, 0.18, 0.75);
  if (u < 0.8) glyph(f, '&mut', stop.x, stop.y - 16 + fall * 46, (1 - fall) * 0.95, u > 0.14);
  if (fuse > 0) shard(f, hx, hy, fuse, theta);
  else comet(f, theta, 1, COMET_LEN * 0.6);
}

/** The checked change: a crisp diamond shard riding the head. */
function shard(f: Frame, x: number, y: number, k: number, theta: number): void {
  const { g, pal } = f;
  const n = at(f, theta + 0.03, 1, 0, { x: 0, y: 0, s: 1, z: 0 });
  const tx = n.x - x;
  const ty = n.y - y;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const L = 11 * k;
  const W = 5 * k;
  const a = edgeFade(f, x, y);
  g.beginPath();
  g.moveTo(x + ux * L, y + uy * L);
  g.lineTo(x - uy * W, y + ux * W);
  g.lineTo(x - ux * L * 0.8, y - uy * L * 0.8);
  g.lineTo(x + uy * W, y - ux * W);
  g.closePath();
  g.fillStyle = rgba(pal.core, 0.35 * a);
  g.fill();
  g.strokeStyle = rgba(pal.glow > 0.5 ? [255, 255, 255] : pal.core, 0.95 * a);
  g.lineWidth = 1.3;
  g.stroke();
  comet(f, theta, 1, COMET_LEN * 0.5, 1.4);
}

function run(f: Frame, theta: number, u: number): void {
  const start = RUN * PHASE_ARC;
  const split = window01(u, 0, 0.12) * (1 - window01(u, 0.86, 1));
  const slot = Math.min(RUN_SLOTS - 1, Math.floor(u * RUN_SLOTS));
  const active = slot % 3;
  const per = RUN_SLOTS / 3;
  for (let s = 0; s < 3; s++) {
    // Cooperative turns: a strand advances only in its own slot, so the three move one after another.
    const done = Math.floor(slot / 3) + (s < active ? 1 : 0);
    const part = s === active ? u * RUN_SLOTS - slot : 0;
    const a = start + (PHASE_ARC * Math.min(per, done + part)) / per;
    const k = 1 + (s - 1) * STRAND_K * split;
    comet(f, a, k, 0.18 + 0.1 * split, s === active ? 3.2 : 2.4);
    if (split > 0.5 && u < 0.86) {
      const p = at(f, a, k);
      const off = (s - 1) * 15 - 15;
      if (s === active) glyph(f, 'poll', p.x, p.y + off, 0.85);
      else if (s === (active + 1) % 3) glyph(f, '.await', p.x, p.y + off, 0.5);
    }
  }
  if (u > 0.86) {
    const p = at(f, theta);
    glyph(f, 'join', p.x, p.y - 18, window01(u, 0.86, 0.92) * (1 - window01(u, 0.95, 1)));
  }
}

const WIRESHARK = RING.findIndex((s) => s.name === 'Wireshark') + 1;
const PACKETS = 5;
const PACKET_GAP = 0.085;
const HANDSHAKE = ['SYN', 'SYN-ACK', 'ACK'] as const;

function packet(f: Frame, theta: number, alpha: number, ghost = false, at2?: Projected): Projected {
  const { g, pal } = f;
  const p = at2 ?? at(f, theta, 1, 0, { x: 0, y: 0, s: 1, z: 0 });
  const n = at(f, theta + 0.02);
  const ang = Math.atan2(n.y - p.y, n.x - p.x);
  const a = alpha * edgeFade(f, p.x, p.y) * depthK(f, p.z);
  const hw = 6 * p.s;
  const pw = 10 * p.s;
  const ht = 4.5 * p.s;
  g.save();
  g.translate(p.x, p.y);
  g.rotate(ang);
  g.lineWidth = 1;
  g.strokeStyle = rgba(pal.core, a);
  // header | payload: the header (leading, solid) and the payload behind it (open).
  const x0 = -(hw + pw) / 2;
  g.strokeRect(x0, -ht, pw, ht * 2);
  if (ghost) g.strokeRect(x0 + pw, -ht, hw, ht * 2);
  else {
    g.fillStyle = rgba(pal.core, a);
    g.fillRect(x0 + pw, -ht, hw, ht * 2);
  }
  g.restore();
  return p;
}

function trace(f: Frame, theta: number, u: number): void {
  const start = TRACE * PHASE_ARC;
  for (let i = 0; i < PACKETS; i++) {
    const a = theta - i * PACKET_GAP;
    if (a < start - 0.02) continue;
    const show = window01(u, i * 0.05, i * 0.05 + 0.08);
    const p = packet(f, a, show);
    // The leading packet left first: SYN, then SYN-ACK, then ACK; the long middle label rides a row higher.
    const label = HANDSHAKE[i];
    if (label && u < 0.7) glyph(f, label, p.x, p.y - (i % 2 ? 30 : 12), show * (1 - window01(u, 0.55, 0.7)) * 0.95);
  }
  // Ghost copies peel off to the capture: Wireshark sees a copy, the stream carries on untouched.
  const target = starPos(f, WIRESHARK, { x: 0, y: 0, s: 1, z: 0 });
  for (let k = 0; k < 2; k++) {
    const g0 = 0.3 + k * 0.22;
    const m = window01(u, g0, g0 + 0.3);
    if (m <= 0 || m >= 1) continue;
    const src = at(f, theta - k * PACKET_GAP, 1, 0, { x: 0, y: 0, s: 1, z: 0 });
    const arcUp = Math.sin(m * Math.PI) * 26;
    const pt: Projected = { x: src.x + (target.x - src.x) * m, y: src.y + (target.y - src.y) * m - arcUp, s: src.s, z: src.z };
    packet(f, theta, 0.7 * (1 - m), true, pt);
  }
}

function breakIt(f: Frame, theta: number, u: number): void {
  comet(f, theta, 1, COMET_LEN * 0.8);
  const h = at(f, theta);
  const hx = h.x;
  const hy = h.y;
  const flip = Math.floor(f.t / 170) % 2;
  const mut = window01(u, 0, 0.1) * (1 - window01(u, 0.5, 0.62));
  glyph(f, flip ? '0111' : '0110', hx, hy - 18, 0.95 * mut);
  glyph(f, '0xFF', hx - 36, hy - 4, 0.6 * mut);
  glyph(f, '\\x00', hx + 36, hy - 4, 0.6 * mut);
  const c = coreCentre(f, { x: 0, y: 0, s: 1, z: 0 });
  // One mutated input strikes the core ...
  const go = window01(u, 0.3, 0.55);
  if (go > 0 && go < 1) {
    const x = hx + (c.x - hx) * go;
    const y = hy + (c.y - hy) * go - Math.sin(go * Math.PI) * 30;
    packet(f, theta, 0.95, false, { x, y, s: 1, z: 0 });
  }
  // ... and a spark returns to the track as the next change.
  const back = window01(u, 0.62, 0.95);
  if (back > 0 && back < 1) {
    const end = at(f, theta + 0.12);
    glyph(f, '+/-', c.x + (end.x - c.x) * back, c.y + (end.y - c.y) * back - Math.sin(back * Math.PI) * 24, 0.95 * Math.sin(back * Math.PI));
  }
}

const MORPHS = [write, check, run, trace, breakIt];

/** Core reactions tied to the pulse: the shell snaps at CHECK, the strike damages, the next CHECK heals. */
function effects(f: Frame, prev: number, theta: number, cycle: number): void {
  const core = f.core;
  const crossed = (a: number): boolean => prev < a && theta >= a;
  if (crossed(CHECK * PHASE_ARC + PHASE_ARC * 0.45)) {
    core.alignT = f.t;
    if (core.damaged >= 0) {
      core.healed = core.damaged;
      core.healT = f.t;
      core.damaged = -1;
    }
  }
  if (crossed(BREAK * PHASE_ARC + PHASE_ARC * 0.55)) {
    core.damaged = (cycle * 7 + 3) % CORE_EDGE_COUNT;
    core.damageT = f.t;
  }
  core.align = core.alignT < 0 ? 0 : 1 - window01(f.t - core.alignT, ALIGN_HOLD_MS * 0.6, ALIGN_HOLD_MS);
}

/** Draws the pulse at loop clock `clock` (ms), given the previous frame's clock for crossings. */
export function drawPulse(f: Frame, clock: number, prevClock: number, morphs: boolean, labels: readonly Label[] = []): void {
  avoid = labels;
  const theta = headAngle(clock);
  const prev = headAngle(prevClock);
  const cycle = Math.floor(clock / LOOP_MS);
  effects(f, prev <= theta ? prev : prev - TAU, theta, cycle);
  const p = Math.min(PHASES.length - 1, Math.floor(theta / PHASE_ARC));
  const u = (theta - p * PHASE_ARC) / PHASE_ARC;
  glyphK = ease((-0.05 - at(f, theta).z) / 0.45);
  const morph = morphs ? MORPHS[p] : undefined;
  if (morph) morph(f, theta, u);
  else comet(f, theta);
}

/** Ring stars the head passed between two clocks: each flashes and shows its name (G2). */
export function passedStars(clock: number, prevClock: number): number[] {
  const theta = headAngle(clock);
  let prev = headAngle(prevClock);
  if (prev > theta) prev -= TAU;
  const hits: number[] = [];
  RING.forEach((s, i) => {
    const a = s.angle > theta ? s.angle - TAU : s.angle;
    if (a > prev && a <= theta) hits.push(i + 1);
  });
  return hits;
}

/* ---------- the core's caption: the crystal is named on the graphic, and the name is part of its target ---------- */

const CORE_CAPTION = 'RUST · CORE';
/** Below the lock ring (0.3 r, loop-draw.ts drawLock) that circles the core when Rust is picked. */
const CORE_CAPTION_R = 0.3;
const CAPTION_MIN_A = 0.85;
/** Per-frame easing of the caption's alpha, so a glyph passing over it does not make it blink. */
const CAPTION_EASE = 0.25;
/** Hit box padding around the caption text: the target reaches about 28 px tall. */
const CAPTION_HIT_PAD = 8;
let captionK = 1;

/** Last drawn box of the core caption (on = visible); loop-scene.ts picks the core inside it. */
export const coreCaption = { x: 0, y: 0, hw: 0, hh: 0, on: false };

export function drawCoreCaption(f: Frame, labels: readonly Label[]): void {
  const { g, pal } = f;
  const c = coreCentre(f, tmp);
  g.font = MONO;
  const x = c.x;
  const y = c.y + f.v.r * CORE_CAPTION_R + FONT_PX;
  const hw = g.measureText(CORE_CAPTION).width / 2;
  const hh = FONT_PX / 2;
  const hit = (b: { x: number; y: number; hw: number; hh: number }): boolean => Math.abs(b.x - x) < b.hw + hw && Math.abs(b.y - y) < b.hh + hh;
  const blocked = drawn.some(hit) || labels.some((l) => l.a > VISIBLE_A && hit(l));
  drawn.length = 0;
  captionK += ((blocked ? 0 : 1) - captionK) * CAPTION_EASE;
  const a = captionK * (f.sel === 0 || f.hover === 0 ? 1 : CAPTION_MIN_A) * edgeFade(f, x, y) * ease((f.sweep - 0.2) / 0.8);
  Object.assign(coreCaption, { x, y, hw: hw + CAPTION_HIT_PAD, hh: hh + CAPTION_HIT_PAD, on: a > VISIBLE_A });
  if (a <= 0.01) return;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = rgba(pal.caption, a);
  g.fillText(CORE_CAPTION, x, y);
}
