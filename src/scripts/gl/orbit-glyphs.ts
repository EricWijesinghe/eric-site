// Binary and code glyphs riding each orbit: the constellation's trails read as data in flight rather
// than blank rings. Each glyph is one canvas texture, drawn once and tinted by the palette, so no text
// is ever laid out at runtime and the glyphs stay decoration (no words, no labels).
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Group, Points, PointsMaterial } from './three';

export const GLYPHS = ['0', '1', '0x3F', 'fn', '::', '->'] as const;
// Glyphs per orbit: every glyph type takes every GLYPHS.length-th slot around the ring.
const SLOTS = 48;
const GLYPH_PX = 96;
const GLYPH_SIZE = 1.1;
export const GLYPH_OPACITY = 0.5;
const TRAIL_SPIN = 0.25;

export interface Trails {
  points: Points[];
  mats: PointsMaterial[];
  /** Turns each glyph type at its own pace, so the trail shimmers instead of sitting still. */
  spin(t: number): void;
}

function glyphTexture(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = GLYPH_PX;
  canvas.height = GLYPH_PX;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${GLYPH_PX * 0.5}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, GLYPH_PX / 2, GLYPH_PX / 2);
  }
  return new CanvasTexture(canvas);
}

/** Adds the glyph trails of one ring to its group. Ring points sit in the ring's own plane, so the tilt carries them. */
export function glyphTrails(ring: Group, radius: number, dir: number): Trails {
  const points: Points[] = [];
  const mats: PointsMaterial[] = [];
  GLYPHS.forEach((text, g) => {
    const coords: number[] = [];
    for (let k = g; k < SLOTS; k += GLYPHS.length) {
      const a = (k / SLOTS) * Math.PI * 2;
      coords.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(coords, 3));
    const mat = new PointsMaterial({
      map: glyphTexture(text),
      size: GLYPH_SIZE,
      transparent: true,
      opacity: GLYPH_OPACITY,
      depthWrite: false,
    });
    const p = new Points(geo, mat);
    ring.add(p);
    points.push(p);
    mats.push(mat);
  });
  return {
    points,
    mats,
    spin: (t) => points.forEach((p, i) => (p.rotation.z = t * TRAIL_SPIN * dir * (1 + i * 0.07))),
  };
}
