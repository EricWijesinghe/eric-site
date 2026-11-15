// The figure, read once on the CPU: his silhouette (alpha), the head halo, and the points where vapour rises off
// his body.
import { FIG } from './singularity-config';
import { buildHalo, type Halo } from './singularity-gl';
import { clamp, rng } from './singularity-math';

export interface Vapour { uv: number[]; r: number[] }
export interface Figure {
  alphaAt: (x: number, y: number) => number;
  halo: Halo;
  vapour: Vapour;
}

const VAPOUR_STEP = 9;
// Vapour rises from the shoulders and below only: from the head it would stand as a column above him at idle.
const VAPOUR_MIN_Y = 520;

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
  return { alphaAt, halo, vapour: { uv, r } };
}
