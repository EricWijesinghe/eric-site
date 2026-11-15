// Quantum computing behind him, on the right of the stage: a dilution-refrigerator chandelier, Bloch
// spheres with precessing state vectors, a qubit chip, entanglement threads and circuit wires with gate
// pulses. Wireframe, low alpha and glyph-free (gate shapes only). Nothing rises from his head: every
// element sits to the right of his silhouette or below it.
import { clamp } from './hero-loop';
import { inkNow, type Ink } from './hero-theme';

const TAU = Math.PI * 2;
let ink: Ink = inkNow();
const BOW = 0.12; // wire bow as a share of the link length
const SPHERE_MIN_PX = 26;
const SPHERE_MAX_PX = 56;
const SPHERE_FRACTION = 0.035; // of the stage width
const CHIP_COLS = 5;
const CHIP_ROWS = 4;
const PLATES = 6;
const HELIX_STEPS = 64;

interface Sphere { x: number; y: number; phase: number; tilt: number }
interface Point { x: number; y: number }

// Canvas ignores colours whose alpha is out of range, so every alpha passes through here.
const col = (rgb: string, alpha: number): string => `rgba(${rgb},${clamp(alpha * ink.gain, 0, 1).toFixed(3)})`;

// Positions are ratios of the stage box, placed clear of his head (about x 0.62-0.82, y 0.12-0.45).
const SPHERES: readonly Sphere[] = [
  { x: 0.86, y: 0.14, phase: 0, tilt: 0.4 },
  { x: 0.6, y: 0.9, phase: 2.1, tilt: -0.3 },
];

/** Two glowing ellipse outlines of a Bloch sphere plus its precessing state vector. */
function drawSphere(ctx: CanvasRenderingContext2D, s: Sphere, cx: number, cy: number, r: number, t: number, a: number, flare: number): void {
  ctx.strokeStyle = col(ink.line, 0.16 * a);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();
  const turn = t * 0.25 + s.phase;
  ctx.strokeStyle = col(ink.accent, 0.2 * a);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.28, s.tilt, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.28, r, turn, 0, TAU);
  ctx.stroke();
  const theta = 0.9 + 0.5 * Math.sin(t * 0.6 + s.phase);
  const phi = t * 1.1 + s.phase;
  const vx = cx + r * Math.sin(theta) * Math.cos(phi);
  const vy = cy - r * Math.cos(theta) + r * 0.28 * Math.sin(theta) * Math.sin(phi) * 0.5;
  ctx.strokeStyle = col(ink.ice, (0.35 + 0.3 * flare) * a);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(vx, vy);
  ctx.stroke();
  ctx.fillStyle = col(ink.ice, (0.5 + 0.4 * flare) * a);
  ctx.beginPath();
  ctx.arc(vx, vy, 2 + 1.5 * flare, 0, TAU);
  ctx.fill();
}

/** Stacked plates, a central post and three turns of coaxial line: the fridge chandelier. */
function drawChandelier(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, a: number): void {
  const cx = 0.955 * w;
  const rx = clamp(0.045 * w, 22, 70);
  const ry = rx * 0.2;
  const top = h * 0.1;
  const bottom = h * 0.5;
  const plateY = (i: number): number => top + ((bottom - top) * i) / (PLATES - 1);
  // The post is a feathered S-curve, never a straight stem: a straight vertical line read as an antenna (critic r2).
  const post = ctx.createLinearGradient(0, top, 0, bottom);
  post.addColorStop(0, `rgba(${ink.line},0)`);
  post.addColorStop(0.5, col(ink.line, 0.1 * a));
  post.addColorStop(1, `rgba(${ink.line},0)`);
  ctx.lineWidth = 1;
  ctx.strokeStyle = post;
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.bezierCurveTo(cx - rx * 1.6, top + (bottom - top) * 0.33, cx + rx * 1.6, top + (bottom - top) * 0.66, cx, bottom);
  ctx.stroke();
  for (let i = 0; i < PLATES; i++) {
    ctx.strokeStyle = col(ink.teal, (0.16 + 0.04 * i) * a);
    ctx.beginPath();
    ctx.ellipse(cx, plateY(i), rx, ry, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.strokeStyle = col(ink.accent, 0.18 * a);
  ctx.beginPath();
  for (let k = 0; k <= HELIX_STEPS; k++) {
    const u = k / HELIX_STEPS;
    const y = top + (bottom - top) * u;
    const ang = u * TAU * 3 + t * 0.8;
    const x = cx + Math.cos(ang) * rx * 0.7;
    const yy = y + Math.sin(ang) * ry * 0.5;
    if (k === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();
}

/** Perspective qubit chip: a skewed grid of nodes that pulse, returned for the entanglement threads. */
function drawChip(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, a: number): Point[][] {
  const x0 = 0.7 * w;
  const y0 = 0.74 * h;
  const cw = 0.26 * w;
  const ch = 0.16 * h;
  const skew = cw * 0.12;
  const nodes: Point[][] = [];
  for (let j = 0; j < CHIP_ROWS; j++) {
    const row: Point[] = [];
    for (let i = 0; i < CHIP_COLS; i++) {
      row.push({ x: x0 + (i / (CHIP_COLS - 1)) * cw + (j / (CHIP_ROWS - 1)) * skew, y: y0 + (j / (CHIP_ROWS - 1)) * ch });
    }
    nodes.push(row);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = col(ink.line, 0.1 * a);
  for (let j = 0; j < CHIP_ROWS; j++) {
    for (let i = 0; i < CHIP_COLS; i++) {
      const p = nodes[j][i];
      // Curved links, never box edges: each one bows a little, alternating, so the chip reads as routed wire.
      if (i + 1 < CHIP_COLS) bowLink(ctx, p, nodes[j][i + 1], (i + j) % 2 ? 1 : -1);
      if (j + 1 < CHIP_ROWS) bowLink(ctx, p, nodes[j + 1][i], (i + j) % 2 ? -1 : 1);
      const pulse = Math.abs(Math.sin(t * 2 + i * 0.9 + j * 1.3));
      ctx.fillStyle = col(ink.ice, a * (0.18 + 0.3 * pulse));
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6, 0, TAU);
      ctx.fill();
    }
  }
  return nodes;
}

/** A curved wire between two nodes: the control point sits off the chord, so no straight box edge is drawn. */
function bowLink(ctx: CanvasRenderingContext2D, p: Point, q: Point, side: number): void {
  const mx = (p.x + q.x) / 2 - (q.y - p.y) * BOW * side;
  const my = (p.y + q.y) / 2 + (q.x - p.x) * BOW * side;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.quadraticCurveTo(mx, my, q.x, q.y);
  ctx.stroke();
}

/** A curved, flowing entanglement thread: the control point bows away from the straight chord. */
function drawThread(ctx: CanvasRenderingContext2D, p: Point, q: Point, bow: number, t: number, a: number): void {
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const cx = mx - dy * bow;
  const cy = my + dx * bow;
  ctx.save();
  ctx.setLineDash([3, 9]);
  ctx.lineDashOffset = -t * 40;
  ctx.lineWidth = 1;
  ctx.strokeStyle = col(ink.accent, 0.3 * a);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.quadraticCurveTo(cx, cy, q.x, q.y);
  ctx.stroke();
  ctx.restore();
}

/** Two circuit wires with gate pulses (rings only, no text). Sine waves were cut: they read as eels under him. */
function drawCircuit(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, a: number, flare: number): void {
  const x0 = 0.52 * w;
  for (let k = 0; k < 2; k++) {
    const y = (0.93 + k * 0.035) * h;
    // The wire fades in at its root and out at the edge, so it has no hard end to read as a box.
    const fade = ctx.createLinearGradient(x0, 0, w, 0);
    fade.addColorStop(0, col(ink.line, 0));
    fade.addColorStop(0.25, col(ink.line, 0.1 * a));
    fade.addColorStop(1, col(ink.line, 0));
    ctx.strokeStyle = fade;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    for (let g = 0; g < 3; g++) {
      const u = (t * 0.07 + g * 0.33 + k * 0.5) % 1;
      const gx = x0 + u * (w - x0);
      ctx.strokeStyle = col(ink.ice, a * (0.3 + 0.4 * flare) * (1 - u));
      ctx.beginPath();
      ctx.arc(gx, y, 4, 0, TAU);
      ctx.stroke();
    }
  }
}

/** Draws the quantum scene for box size (w, h) at time t (seconds). `c` is the charge, `flare` the release wave. */
export function drawQuantum(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, c: number, flare: number): void {
  ink = inkNow();
  const a = 2 + 0.6 * c + 0.5 * flare;
  const r = clamp(SPHERE_FRACTION * w, SPHERE_MIN_PX, SPHERE_MAX_PX);
  ctx.save();
  ctx.globalCompositeOperation = ink.blend;
  ctx.lineCap = 'round';
  drawChandelier(ctx, w, h, t, a);
  const chip = drawChip(ctx, w, h, t, a);
  drawCircuit(ctx, w, h, t, a, flare);
  const [s0, s1] = SPHERES.map((s) => ({ x: s.x * w, y: s.y * h }));
  // Portrait stacks the scene over the copy, where a thread would cross the name: threads are landscape-only.
  if (w >= h) {
    drawThread(ctx, s0, chip[0][CHIP_COLS - 1], 0.25, t, a);
    drawThread(ctx, s1, chip[CHIP_ROWS - 1][0], -0.2, t, a);
  }
  SPHERES.forEach((s, i) => drawSphere(ctx, s, i ? s1.x : s0.x, i ? s1.y : s0.y, r, t, a, flare));
  ctx.restore();
}
