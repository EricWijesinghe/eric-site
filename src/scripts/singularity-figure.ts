// The figure, read once on the CPU: his silhouette (alpha), the head halo, the points where vapour rises off his
// body, the places on his body a release leaves from, and his glow (the light theme's field, which hugs him).
import { FIG } from './singularity-config';
import { buildHalo, type Halo } from './singularity-gl';
import { clamp, rng, smooth } from './singularity-math';

export interface Vapour { uv: number[]; r: number[] }
/**
 * His glow as a texture; `rect` maps figure px to it (origin x, y and size w, h). Red is his whole silhouette,
 * blurred tight: the dark theme's absorbed glow along his outline. Green is his body below the head, blurred far
 * sideways: the light theme's streams to his left and right. Blue is his silhouette blurred wide: the light
 * theme's field, which thins over a few hundred px (and the dark theme's outer absorbed glow).
 * Every edge of the texture is 0, so nothing clamps into a streak.
 */
export interface Aura { image: ImageData; rect: [number, number, number, number] }
/** Where a release leaves his body: flat [x, y, nx, ny] per site (figure px, outward normal), his left side then his right. */
export type Sites = [number[], number[]];
export interface Figure {
  alphaAt: (x: number, y: number) => number;
  halo: Halo;
  vapour: Vapour;
  sites: Sites;
  aura: Aura;
}

const SOLID = 128; // figure alpha (0..255) that counts as his body
const VAPOUR_STEP = 9;
// Vapour rises from the shoulders and below only: from the head it would stand as a column above him at idle.
const VAPOUR_MIN_Y = 520;

// A release leaves from the outline of his shoulders and arms, never from his head or from empty space (Eric
// round 10). A site sits just inside that outline, clear of the head's halo, where the mesh draws him in full
// (its left, right and bottom fades are skipped: a glyph leaving a faded shoulder would come from nowhere).
const SITE_STEP = 10;
const SITE_EDGE = 22; // figure px: a site is this close to the outline, and the normal is read across this span
const SITE_BOX = { x0: 290, x1: FIG.w - 25, y0: VAPOUR_MIN_Y, y1: 1100 };

// His glow (light theme, Eric round 10: "my image to feel like a flow to other sides"). Blurs, not distances: a
// blurred silhouette has no facets and no contour of its own, so the field has no shape but his.
const AURA_STEP = 8; // figure px per cell
const AURA_PAD_X = 1024; // room either side of him: the widest blur dies inside it
const AURA_PAD_Y = 256;
const BLUR_PASSES = 3; // three box blurs are close to a Gaussian
const HUG_R = 7; // cells: about a 60 px Gaussian around his whole outline
const FLOW_RX = 48; // cells: about 390 px sideways from his body, so the streams reach far toward the page's edges
const FLOW_RY = 12; // tall enough that a stream has no hard top or bottom
const HALO_R = 20; // cells: about a 165 px Gaussian: the light theme's field thins over a few hundred px, not a band
const HUG_ARM = 2.2; // the glow holds on his left arm this much longer than the mesh's own fade, so the arm keeps its field
const FLOW_Y = [640, 900] as const; // the flow starts below his chin, at his shoulders: nothing streams from his head
// The mesh fades him out at his left, right and bottom (FS_MESH's cov): the glow follows what is drawn, not the file.
const MESH_FADE = { left: [110, 470], right: 50, bottom: [1040, 1195] } as const;

function bodySites(alphaAt: Figure['alphaAt'], halo: Halo): Sites {
  const sites: Sites = [[], []];
  for (let y = SITE_BOX.y0; y < SITE_BOX.y1; y += SITE_STEP) {
    for (let x = SITE_BOX.x0; x < SITE_BOX.x1; x += SITE_STEP) {
      if (alphaAt(x, y) < SOLID || halo.at(x, y) > 0) continue;
      const gx = alphaAt(x + SITE_EDGE, y) - alphaAt(x - SITE_EDGE, y), gy = alphaAt(x, y + SITE_EDGE) - alphaAt(x, y - SITE_EDGE);
      const g = Math.hypot(gx, gy);
      if (g < SOLID) continue; // deep inside him: no outline within reach
      sites[x < FIG.axisX ? 0 : 1].push(x, y, -gx / g, -gy / g);
    }
  }
  return sites;
}

/** One box blur of radius `r` cells along x (or y), zero beyond the grid. */
function boxPass(a: Float32Array, w: number, h: number, r: number, alongX: boolean): Float32Array {
  const out = new Float32Array(a.length), n = alongX ? w : h, lines = alongX ? h : w, step = alongX ? 1 : w;
  for (let l = 0; l < lines; l++) {
    const base = alongX ? l * w : l;
    let sum = 0;
    for (let i = 0; i <= r && i < n; i++) sum += a[base + i * step];
    for (let i = 0; i < n; i++) {
      out[base + i * step] = sum / (2 * r + 1);
      if (i + r + 1 < n) sum += a[base + (i + r + 1) * step];
      if (i - r >= 0) sum -= a[base + (i - r) * step];
    }
  }
  return out;
}

function blur(a: Float32Array, w: number, h: number, rx: number, ry: number): Float32Array {
  let b = a;
  for (let i = 0; i < BLUR_PASSES; i++) b = boxPass(boxPass(b, w, h, rx, true), w, h, ry, false);
  return b;
}

function buildAura(alphaAt: Figure['alphaAt']): Aura {
  const w = Math.ceil((FIG.w + 2 * AURA_PAD_X) / AURA_STEP), h = Math.ceil((FIG.h + 2 * AURA_PAD_Y) / AURA_STEP);
  const all = new Float32Array(w * h), body = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
    const x = (q + 0.5) * AURA_STEP - AURA_PAD_X, y = (r + 0.5) * AURA_STEP - AURA_PAD_Y;
    if (x < 0 || x >= FIG.w || y < 0 || y >= FIG.h) continue;
    const left = smooth(MESH_FADE.left[0], MESH_FADE.left[1], x);
    const rest = (alphaAt(x, y) / 255) * smooth(FIG.w, FIG.w - MESH_FADE.right, x) * (1 - smooth(MESH_FADE.bottom[0], MESH_FADE.bottom[1], y));
    all[r * w + q] = rest * Math.min(1, left * HUG_ARM);
    body[r * w + q] = all[r * w + q] * smooth(FLOW_Y[0], FLOW_Y[1], y);
  }
  const hug = blur(all, w, h, HUG_R, HUG_R), flow = blur(body, w, h, FLOW_RX, FLOW_RY), halo = blur(all, w, h, HALO_R, HALO_R);
  const image = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) image.data.set([hug[i] * 255, flow[i] * 255, halo[i] * 255, 255], i * 4);
  return { image, rect: [-AURA_PAD_X, -AURA_PAD_Y, w * AURA_STEP, h * AURA_STEP] };
}

export function prepareFigure(figImg: HTMLImageElement, trImg: HTMLImageElement, seed: number): Figure {
  const c3 = document.createElement('canvas');
  c3.width = FIG.w; c3.height = FIG.h;
  const x3 = c3.getContext('2d', { willReadFrequently: true })!;
  x3.drawImage(figImg, 0, 0);
  const px = x3.getImageData(0, 0, FIG.w, FIG.h).data;
  const alphaAt = (x: number, y: number): number =>
    px[(Math.round(clamp(y, 0, FIG.h - 1)) * FIG.w + Math.round(clamp(x, 0, FIG.w - 1))) * 4 + 3];
  const halo = buildHalo(trImg, FIG.w, FIG.h);

  const rnd = rng(seed);
  const uv: number[] = [], r: number[] = [];
  for (let y = VAPOUR_MIN_Y; y < FIG.h; y += VAPOUR_STEP) {
    for (let x = 0; x < FIG.w; x += VAPOUR_STEP) {
      const jx = x + (rnd() - 0.5) * 8, jy = y + (rnd() - 0.5) * 8;
      if (alphaAt(jx, jy) < 90) continue;
      uv.push(jx / FIG.w, jy / FIG.h);
      r.push(rnd(), rnd(), rnd(), rnd());
    }
  }
  return { alphaAt, halo, vapour: { uv, r }, sites: bodySites(alphaAt, halo), aura: buildAura(alphaAt) };
}
