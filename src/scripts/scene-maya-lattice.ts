// ML-DSA as Fiat-Shamir with aborts. The signer samples a masking vector y, forms w = A·y, derives
// a challenge c, and returns z = y + c·s with its secret short vector s. z is released only when it
// lies inside the norm bound; otherwise the signer aborts and retries with a fresh y. The drawing
// runs that same test on the same numbers, so the accepted z is the one the bound let through.
import { CHIP_ZONE, chip, chipY, clamp01, easeOut, ink, isLight, PALETTE as P, rgbOf, rng, stroke, tint, type Pt } from './scene-core';
import { lineW } from './scene-core';
import { within, type Region } from './scene-maya-types';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}
interface Attempt {
  y: Vec3;
  z: Vec3;
  sign: 1 | -1;
  accept: boolean;
}

// A skewed basis, so the lattice reads as lattice and not as a cube.
const BASIS: Vec3[] = [
  { x: 1, y: 0.25, z: 0 },
  { x: 0.12, y: 1, z: 0.3 },
  { x: 0.25, y: 0.1, z: 1 },
];
const RANGE = 2; // coefficients run -RANGE..RANGE on each basis vector
const SHORT: [number, number, number] = [1, -1, 1]; // the secret short vector, in basis coordinates
const SECRET_SCALE = 0.5;
const BOUND = 1.9; // radius of the norm bound z must fall inside
const SHELL_MIN = 1.7; // masking vectors are drawn from this shell, so many of them overshoot
const SHELL_SPAN = 1.1;
const REJECTS = 2; // aborted attempts shown before the accepted one
const MAX_TRIES = 400;
export const ATTEMPT_S = 2.4; // seconds per attempt
// Stage ends within an attempt: sample y | w = A·y and c | z = y + c·s | norm check; then the result.
const STAGE_END = [0.5, 1.0, 1.6, 2.0] as const;
const ARROW_FROM = 1.0;
const ARROW_S = 0.6;
const NOISE_COUNT = 70;
const CAM_K = 5; // camera distance in lattice radii: mild perspective, and no point ever behind the camera
const FIT = 0.5; // the visible lattice (radius R_OUT) stays within this share of the band's smaller side
// The lattice is a window: points fade out between R_IN and R_OUT (lattice radii), so the cloud fills the band
// at any rotation and nothing is cut by its edge. Radius is rotation-invariant, so the weights are computed once.
const R_IN = 2.3;
const R_OUT = 3;
const FADE_FLOOR = 0.35; // before the first attempt starts the lattice is already drawn, never a blank band
const EDGE_BUCKETS = 4; // edges are stroked in a few alpha groups, not one by one
const BAND_PAD = 8; // px under the drawing band
const PEARL_EDGE_A = 0.16; // pearl: edges are faint hairlines, the points carry the shape
const HOT_TEXT =
  'ML-DSA: z = y + c·s is released only inside the norm bound; otherwise the signer aborts and retries. Drag to turn it.';
const TILT_X = -0.42;
const TILT_SPEED = 0.2;
const TILT_LIMIT = 0.9; // radians: a drag may not flip the lattice over
const RING_SEG = 36;
const LABEL_Y = chipY(1); // the stage chip sits under the title chip, with its 8px gap

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const norm = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

function combine(c: readonly number[]): Vec3 {
  const out = { x: 0, y: 0, z: 0 };
  BASIS.forEach((b, i) => {
    out.x += b.x * c[i];
    out.y += b.y * c[i];
    out.z += b.z * c[i];
  });
  return out;
}

function rotate(p: Vec3, ry: number, rx: number): Vec3 {
  const x1 = p.x * Math.cos(ry) + p.z * Math.sin(ry);
  const z1 = -p.x * Math.sin(ry) + p.z * Math.cos(ry);
  const y2 = p.y * Math.cos(rx) - z1 * Math.sin(rx);
  const z2 = p.y * Math.sin(rx) + z1 * Math.cos(rx);
  return { x: x1, y: y2, z: z2 };
}

function project(p: Vec3, cx: number, cy: number, s: number, cam: number): { x: number; y: number; d: number } {
  const k = cam / (cam + p.z);
  return { x: cx + p.x * s * k, y: cy + p.y * s * k, d: p.z };
}

function buildPoints(): { pts: Vec3[]; edges: [number, number][] } {
  const side = 2 * RANGE + 1;
  const idx = (i: number, j: number, k: number): number => ((i + RANGE) * side + (j + RANGE)) * side + (k + RANGE);
  const pts: Vec3[] = [];
  for (let i = -RANGE; i <= RANGE; i++) {
    for (let j = -RANGE; j <= RANGE; j++) {
      for (let k = -RANGE; k <= RANGE; k++) pts.push(combine([i, j, k]));
    }
  }
  const edges: [number, number][] = [];
  for (let i = -RANGE; i <= RANGE; i++) {
    for (let j = -RANGE; j <= RANGE; j++) {
      for (let k = -RANGE; k <= RANGE; k++) {
        if (i < RANGE) edges.push([idx(i, j, k), idx(i + 1, j, k)]);
        if (j < RANGE) edges.push([idx(i, j, k), idx(i, j + 1, k)]);
        if (k < RANGE) edges.push([idx(i, j, k), idx(i, j, k + 1)]);
      }
    }
  }
  return { pts, edges };
}

/** A masking vector, uniform over a spherical shell. */
function sampleShell(rand: () => number): Vec3 {
  const u = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const rr = SHELL_MIN + rand() * SHELL_SPAN;
  const s = Math.sqrt(1 - u * u);
  return { x: rr * s * Math.cos(a), y: rr * u, z: rr * s * Math.sin(a) };
}

/**
 * The signing attempts for one cycle: the first REJECTS that overshoot the bound (aborted), then the
 * first that lands inside it. The norm test here is the one the drawing shows, not a script.
 */
function plan(): Attempt[] {
  const rand = rng(0x51a7);
  const s = scale(combine(SHORT), SECRET_SCALE);
  const rejects: Attempt[] = [];
  for (let k = 0; k < MAX_TRIES; k++) {
    const y = sampleShell(rand);
    const sign: 1 | -1 = k % 2 === 0 ? 1 : -1;
    const z = add(y, scale(s, sign));
    const accept = norm(z) <= BOUND;
    if (accept) return [...rejects, { y, z, sign, accept }];
    if (rejects.length < REJECTS) rejects.push({ y, z, sign, accept });
  }
  throw new Error('ML-DSA plan: no attempt passed the norm bound');
}

/** Three great circles of the norm bound, in lattice space: a shell, drawn as wire. */
function boundRings(): Vec3[][] {
  const ring = (f: (a: number) => Vec3): Vec3[] =>
    Array.from({ length: RING_SEG + 1 }, (_, i) => f((i / RING_SEG) * Math.PI * 2));
  return [
    ring((a) => ({ x: BOUND * Math.cos(a), y: BOUND * Math.sin(a), z: 0 })),
    ring((a) => ({ x: BOUND * Math.cos(a), y: 0, z: BOUND * Math.sin(a) })),
    ring((a) => ({ x: 0, y: BOUND * Math.cos(a), z: BOUND * Math.sin(a) })),
  ];
}

/** The caption of the attempt's current stage: the signing steps, in words. */
function stageText(local: number, accept: boolean): string {
  if (local < STAGE_END[0]) return 'sample a masking vector y';
  if (local < STAGE_END[1]) return 'w = A·y, challenge c';
  if (local < STAGE_END[2]) return 'z = y + c·s';
  if (local < STAGE_END[3]) return '‖z‖ inside the norm bound?';
  return accept ? 'accept: signature (c, z, h)' : 'abort: ‖z‖ too large, retry';
}

/** ML-DSA: rejection sampling drawn as lattice geometry; the accepted z is the short vector released. */
export function makeLattice(label: string): Region {
  const { pts, edges } = buildPoints();
  const att = plan();
  const secret = scale(combine(SHORT), SECRET_SCALE);
  const rings = boundRings();
  const rand = rng(0x0b5e);
  // Noise: the other lattice points a signer could have hit, a shell of cloud around the lattice.
  const noise: Vec3[] = Array.from({ length: NOISE_COUNT }, () => sampleShell(rand));
  const last = att[att.length - 1];
  const weight = (p: Vec3): number => clamp01((R_OUT - norm(p)) / (R_OUT - R_IN));
  const ptW = pts.map(weight);
  const buckets: [number, number][][] = Array.from({ length: EDGE_BUCKETS }, () => []);
  for (const e of edges) {
    const k = Math.ceil(Math.min(ptW[e[0]], ptW[e[1]]) * EDGE_BUCKETS) - 1;
    if (k >= 0) buckets[k].push(e);
  }
  const cam = R_OUT * CAM_K;
  const nearK = cam / (cam - R_OUT);

  return {
    draw(g, r, c, t, ui) {
      // The drawing band sits under the two chip rows and is clipped to itself: nothing reaches a label or the rim.
      const band = { x: r.x, y: r.y + CHIP_ZONE, w: r.w, h: Math.max(0, r.h - CHIP_ZONE - BAND_PAD) };
      const cx = band.x + band.w / 2;
      const cy = band.y + band.h / 2;
      const s = (FIT * Math.min(band.w, band.h)) / (R_OUT * nearK);
      const ry = t * TILT_SPEED + ui.spin;
      const rx = TILT_X + 0.06 * Math.sin(t * 0.3) + Math.min(TILT_LIMIT, Math.max(-TILT_LIMIT, ui.tilt));
      const at = (p: Vec3): Pt => {
        const q = project(rotate(p, ry, rx), cx, cy, s, cam);
        return { x: q.x, y: q.y };
      };
      const idx = Math.min(att.length - 1, Math.floor(c / ATTEMPT_S));
      const a = att[idx];
      const local = Math.min(ATTEMPT_S, c - idx * ATTEMPT_S);
      const shown = local >= STAGE_END[3];
      const fade = FADE_FLOOR + (1 - FADE_FLOOR) * easeOut(c / 1.5);

      g.save();
      g.beginPath();
      g.rect(band.x, band.y, band.w, band.h);
      g.clip();
      g.lineWidth = isLight() ? 1 : lineW(1);
      buckets.forEach((group, k) => {
        const w = (k + 1) / EDGE_BUCKETS;
        g.strokeStyle = isLight() ? rgbOf('indigo', PEARL_EDGE_A * fade * w) : stroke('indigo', 0.2 * fade * w);
        g.beginPath();
        for (const [p, q] of group) {
          const pa = at(pts[p]);
          const pb = at(pts[q]);
          g.moveTo(pa.x, pa.y);
          g.lineTo(pb.x, pb.y);
        }
        g.stroke();
      });
      g.lineWidth = lineW(1);

      // The norm bound: brighter while the test runs, a faint shell otherwise.
      const testing = local >= STAGE_END[2] && !shown;
      // Pearl: thin rings at a set alpha; the floored line ink made the bound a dark scribble over the points.
      g.strokeStyle = isLight() ? rgbOf('cyan', testing ? 0.75 : 0.35) : stroke('cyan', testing ? 0.5 : 0.18 * fade);
      if (isLight()) g.lineWidth = 1;
      for (const ring of rings) {
        g.beginPath();
        ring.forEach((p, i) => {
          const q = at(p);
          if (i === 0) g.moveTo(q.x, q.y);
          else g.lineTo(q.x, q.y);
        });
        g.stroke();
      }

      for (const n of noise) {
        const q = at(n);
        const flick = 0.5 + 0.5 * Math.sin(t * 1.7 + n.x * 3);
        g.fillStyle = tint('magenta', (0.06 + 0.12 * flick) * fade);
        g.fillRect(q.x, q.y, 1.5, 1.5);
      }
      pts.forEach((p, i) => {
        if (ptW[i] <= 0) return;
        const q = at(p);
        const near = clamp01(1 - (rotate(p, ry, rx).z + 2) / 4);
        g.fillStyle = ink((0.2 + 0.55 * near) * fade * ptW[i]);
        g.beginPath();
        g.arc(q.x, q.y, 1.6 + 1.2 * near, 0, Math.PI * 2);
        g.fill();
      });

      // The secret short vector, from the origin: the signer knows it, the bound is what keeps it hidden.
      const origin = at({ x: 0, y: 0, z: 0 });
      const sTip = at(secret);
      g.setLineDash([3, 4]);
      g.strokeStyle = stroke('azure', 0.7 * fade);
      g.beginPath();
      g.moveTo(origin.x, origin.y);
      g.lineTo(sTip.x, sTip.y);
      g.stroke();
      g.setLineDash([]);

      // The masking vector y, then the arrow from it to z as the signer forms z = y + c·s.
      const yp = at(a.y);
      const zp = at(a.z);
      const grow = clamp01((local - ARROW_FROM) / ARROW_S);
      const hit = local >= STAGE_END[3];
      const outcome = a.accept ? P.ice : tint('magenta', 0.95);
      const zEnd = { x: yp.x + (zp.x - yp.x) * grow, y: yp.y + (zp.y - yp.y) * grow };
      const yFade = easeOut(local / STAGE_END[0]);
      if (yFade > 0) {
        g.fillStyle = tint('cyan', 0.9 * yFade);
        g.beginPath();
        g.arc(yp.x, yp.y, 3, 0, Math.PI * 2);
        g.fill();
      }
      if (grow > 0) {
        g.strokeStyle = hit ? outcome : tint('cyan', 0.6);
        g.lineWidth = lineW(hit && a.accept ? 2 : 1.5);
        g.beginPath();
        g.moveTo(yp.x, yp.y);
        g.lineTo(zEnd.x, zEnd.y);
        g.stroke();
        g.lineWidth = lineW(1);
      }
      if (hit) {
        g.fillStyle = outcome;
        g.beginPath();
        g.arc(zp.x, zp.y, a.accept ? 4 : 3, 0, Math.PI * 2);
        g.fill();
      }

      // The released signature: the accepted z stays on screen after the cycle has made it.
      const lastZ = at(last.z);
      if (c >= ATTEMPT_S * att.length - 0.01) {
        g.fillStyle = P.white;
        g.beginPath();
        g.arc(lastZ.x, lastZ.y, 3.5, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();

      chip(g, label, r.x + 16, r.y + chipY(0), ink(0.9));
      chip(g, stageText(local, a.accept), r.x + 16, r.y + LABEL_Y, hit && !a.accept ? tint('magenta', 0.95) : ink(0.95));
      return {
        anchor: lastZ,
        spots: [{ x: cx, y: cy, label: 'ML-DSA lattice: signing with aborts' }],
        hot: within(ui.hover, band) ? HOT_TEXT : null,
      };
    },
  };
}
