// Keep-out for the field's glyphs (river and rain): section text and frames, collected by conduit.ts on every layout,
// cap any glyph near them to a faint ghost, so code never prints over words; the globe's disc is kept clear of rain.
import { smoothstep } from './conduit-geometry';

/** A page-space rectangle (CSS px). */
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** The globe's circle in page px. */
export interface Disc {
  x: number;
  y: number;
  r: number;
}

/** What one frame keeps clear: the boxes near the viewport and the disc. */
export interface Keep {
  boxes: Box[];
  disc: Disc | null;
}

// Every block of copy, every label and title, and the frames whose labels sit inside them.
const KEEP_SELECTOR = '.section-label, .section-title, [data-reveal], .fin-signal, .fin-status, .sk-stage, .sk-index';
const KEEP_ALPHA = 0.08;
// A clear margin before the feather starts: the acceptance probe is "no glyph above .15 within 16 px of text".
const CLEAR_PX = 16;
const FEATHER_PX = 24;
const DISC_FEATHER_PX = 48;
// Monospace advance as a fraction of the font size, for a glyph's half-width.
const ADVANCE_EM = 0.6;
const VIEW_PAD_PX = 120;

/**
 * An element's page box where it rests: its reveal `translate` (20 px down until it is revealed, reveal.ts) is taken
 * out, since revealing moves it without a resize that would rebuild the layout.
 */
export function restingBox(el: Element): Box {
  const r = el.getBoundingClientRect();
  const [tx = 0, ty = 0] = getComputedStyle(el).translate.split(' ').map((v) => parseFloat(v) || 0);
  const x = window.scrollX - tx;
  const y = window.scrollY - ty;
  return { l: r.left + x, t: r.top + y, r: r.right + x, b: r.bottom + y };
}

/** Page rects of the copy in every content section (the hero stage has its own rules and is skipped). */
export function collectKeep(sections: readonly HTMLElement[]): Box[] {
  const boxes: Box[] = [];
  for (const s of sections) {
    if (s.classList.contains('m2c-stage')) continue;
    for (const el of s.querySelectorAll(KEEP_SELECTOR)) {
      const b = restingBox(el);
      if (b.r > b.l && b.b > b.t) boxes.push(b);
    }
  }
  return boxes;
}

/** The boxes that can touch a glyph drawn between page y `top` and `bottom`. */
export const keepNear = (boxes: readonly Box[], disc: Disc | null, top: number, bottom: number): Keep => ({
  boxes: boxes.filter((b) => b.b > top - VIEW_PAD_PX && b.t < bottom + VIEW_PAD_PX),
  disc,
});

/** Half extents of a glyph box (CSS px). */
export const glyphHalf = (text: string, size: number): [number, number] => [(text.length * size * ADVANCE_EM) / 2, size / 2];

/** The alpha a glyph centred at page (x, y) with half extents (hx, hy) may have: faint near text, none in the disc. */
export function keepAlpha(k: Keep, alpha: number, x: number, y: number, hx: number, hy: number): number {
  let cap = 1;
  for (const b of k.boxes) {
    const dx = Math.max(0, b.l - x - hx, x - hx - b.r);
    const dy = Math.max(0, b.t - y - hy, y - hy - b.b);
    const c = KEEP_ALPHA + (1 - KEEP_ALPHA) * smoothstep(CLEAR_PX, CLEAR_PX + FEATHER_PX, Math.hypot(dx, dy));
    if (c < cap) cap = c;
  }
  const d = k.disc;
  const fade = d ? smoothstep(d.r, d.r + DISC_FEATHER_PX, Math.hypot(x - d.x, y - d.y)) : 1;
  return Math.min(alpha, cap) * fade;
}
