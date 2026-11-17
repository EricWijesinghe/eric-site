// Colour and light for the page-wide energy (energy-overlay.ts). Eric (2026-11-17): it must look premium, not like
// a toy, and the horizon must never become a drawn ring. So the inks are his own light (cyan and ice in dark), deep
// navy and azure in light (light is first-class: ice on a pale page measured 1.77:1), glyphs over him are light with
// a fine dark edge, and the glow of the swarm is stamped glyph by glyph into a half-resolution layer laid on with a
// capped alpha, so it rises with what he holds but never closes into a band. Round 12b: the hot glow read milky grey
// in dark and as navy smoke bands in light, so it heats toward a luminous cyan (dark) and an electric blue (light).

type Ink = readonly [share: number, rgb: string];
export interface Pal {
  ink: readonly Ink[];
  /** The swarm moves toward this as he holds more: ice in dark, deeper navy in light ('r g b'). */
  hot: string;
  /** A released glyph's first moments: white-hot in dark, the deepest ink in light. */
  flash: string;
  /** The ink of a glyph over him, drawn at onA, with an optional 1 px dark copy under it so it reads on his light. */
  on: string; onA: number; onEdge: string | null;
  glow: string; glowHot: string; // the swarm's haze, cool at the first touch and hot at full mass
  glowA: readonly [number, number]; // the haze's alpha at k = 0 and k = 1
  hazeR: number; // px at the reference radius: tight beads of light in dark, a soft weight under the arc in light
  farA: number; // a glyph's alpha on the orbit's far side (1 on the near side): light ink needs more to hold 3:1
  blend: GlobalCompositeOperation;
  edge: string; // the screen's edges while he charges: darker in dark (the light gathers in him), azure in light
  edgeA: number;
  pulse: { rgb: string; to: string; px: readonly [number, number]; s: number; a: number; op: GlobalCompositeOperation };
}
export const DARK: Pal = {
  ink: [[0.75, '56 225 255'], [0.2, '191 244 255'], [0.05, '139 92 246']],
  hot: '232 251 255', flash: '244 253 255', on: '232 251 255', onA: 0.8, onEdge: null,
  glow: '56 225 255', glowHot: '110 232 255', glowA: [0.38, 0.85], hazeR: 26, farA: 0.4,
  blend: 'lighter', edge: '2 5 11', edgeA: 0.35,
  pulse: { rgb: '56 225 255', to: '56 225 255', px: [20, 30], s: 0.2, a: 0.55, op: 'lighter' }, // a 40-60 px bloom
};
export const LIGHT: Pal = {
  ink: [[0.7, '11 42 107'], [0.25, '31 111 209'], [0.05, '91 43 214']],
  hot: '6 24 66', flash: '6 24 66', on: '255 255 255', onA: 0.95, onEdge: '11 42 107 / 0.6',
  glow: '31 111 209', glowHot: '0 140 255', glowA: [0.22, 0.42], hazeR: 34, farA: 0.55,
  blend: 'source-over', edge: '11 95 191', edgeA: 0.22,
  pulse: { rgb: '31 111 209', to: '255 255 255', px: [3, 5], s: 0.12, a: 0.9, op: 'source-over' }, // small and crisp
};
const HOT_MAX = 0.6; // at full mass the swarm is this far from its inks toward `hot`: past that it read milky, not cyan
export const HEAT = 4; // a released glyph cools from `flash` to its ink through this many steps

const mix = (a: string, b: string, t: number): string => {
  const x = a.split(' ').map(Number), y = b.split(' ').map(Number);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(' ')})`;
};
/** This frame's fill styles: [heat][ink]. Heat 0 is the ink moved toward `hot` by the mass he holds (k). */
export function inks(pal: Pal, k: number): string[][] {
  const base = pal.ink.map(([, rgb]) => mix(rgb, pal.hot, HOT_MAX * k).slice(4, -1));
  return Array.from({ length: HEAT }, (_, h) => base.map((rgb) => mix(rgb, pal.flash, h / (HEAT - 1))));
}
const GLOW_STEPS = 8; // the hot glow moves in steps, so its sprite is drawn a handful of times, not every frame
export const glowOf = (pal: Pal, k: number): string => mix(pal.glow, pal.glowHot, Math.round(k * GLOW_STEPS) / GLOW_STEPS).slice(4, -1);
/** A glyph keeps one random number for life; it picks its ink by the theme's shares, so a theme switch recolours it. */
export function inkOf(pal: Pal, u: number): number {
  for (let i = 0, acc = 0; i < pal.ink.length; i++) if (u < (acc += pal.ink[i][0])) return i;
  return 0;
}

const SPRITE_PX = 64;
const RES = 0.5; // the haze is soft by nature: half resolution is invisible and a quarter of the fill cost

/** The haze layer: glows are stamped into it during a frame, then laid onto the page canvas once, capped. */
export function glowLayer(): {
  size(w: number, h: number): void;
  clear(): void;
  add(rgb: string, x: number, y: number, r: number, a: number): void;
  paint(ctx: CanvasRenderingContext2D, pal: Pal, w: number, h: number, alpha: number): void;
  sprite(rgb: string): HTMLCanvasElement;
} {
  const layer = document.createElement('canvas'), g = layer.getContext('2d');
  const sprites = new Map<string, HTMLCanvasElement>();
  let used = false;
  const sprite = (rgb: string): HTMLCanvasElement => {
    let c = sprites.get(rgb);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = SPRITE_PX;
    const s = c.getContext('2d'), h = SPRITE_PX / 2;
    if (s) {
      const grad = s.createRadialGradient(h, h, 0, h, h, h);
      grad.addColorStop(0, `rgb(${rgb} / 1)`); grad.addColorStop(0.45, `rgb(${rgb} / 0.4)`); grad.addColorStop(1, `rgb(${rgb} / 0)`);
      s.fillStyle = grad; s.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
    }
    if (sprites.size > 16) sprites.clear(); // the hot glow changes with k: keep only a handful
    sprites.set(rgb, c);
    return c;
  };
  return {
    sprite,
    size(w, h) { layer.width = Math.max(1, Math.ceil(w * RES)); layer.height = Math.max(1, Math.ceil(h * RES)); },
    clear() { if (used && g) { g.globalAlpha = 1; g.clearRect(0, 0, layer.width, layer.height); } used = false; },
    add(rgb, x, y, r, a) {
      if (!g || a < 0.01) return;
      used = true;
      g.globalAlpha = Math.min(1, a);
      g.drawImage(sprite(rgb), (x - r) * RES, (y - r) * RES, 2 * r * RES, 2 * r * RES);
    },
    paint(ctx, pal, w, h, alpha) {
      if (!used) return;
      ctx.globalAlpha = Math.min(1, alpha);
      // light theme: the haze goes UNDER the glyphs already drawn, so the deep ink stays crisp on it
      ctx.globalCompositeOperation = pal.blend === 'lighter' ? 'lighter' : 'destination-over';
      ctx.drawImage(layer, 0, 0, w, h);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = pal.blend;
    },
  };
}

const QUIET_FADE_PX = 140; // the edge tint fades back in over this far beyond the words' column

/** While he charges the screen's edges answer: in dark they fall back so the light gathers in him; in light they
    tint. Never over the words: the column keeps its contrast. */
export function edges(ctx: CanvasRenderingContext2D, pal: Pal, live: number, cx: number, cy: number, w: number, h: number, col: DOMRect | null): void {
  const e = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.4, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  e.addColorStop(0, `rgb(${pal.edge} / 0)`); e.addColorStop(1, `rgb(${pal.edge} / ${(pal.edgeA * live).toFixed(3)})`);
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = e; ctx.fillRect(0, 0, w, h);
  if (col) {
    const x = Math.max(0, col.right + QUIET_FADE_PX), g = ctx.createLinearGradient(col.right, 0, x, 0);
    g.addColorStop(0, '#000'); g.addColorStop(1, 'rgb(0 0 0 / 0)');
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = g; ctx.fillRect(0, 0, x, h);
  }
  ctx.globalCompositeOperation = pal.blend;
}

/** Where a falling glyph touches him (f: 0..1 of the pulse): a soft bloom in dark, a small azure-to-white point in light. */
export function pulse(ctx: CanvasRenderingContext2D, sprite: (rgb: string) => HTMLCanvasElement, pal: Pal, x: number, y: number, f: number): void {
  const pu = pal.pulse, r = pu.px[0] + (pu.px[1] - pu.px[0]) * f;
  ctx.globalCompositeOperation = pu.op;
  ctx.globalAlpha = pu.a * (1 - f) * (1 - f);
  ctx.drawImage(sprite(f < 0.5 ? pu.rgb : pu.to), x - r, y - r, 2 * r, 2 * r);
  ctx.globalCompositeOperation = pal.blend;
}

/** Room on screen, per frame: a glyph whose box (scaled by `spacing`) overlaps one already claimed is not drawn. */
export function roomGrid(spacing: number): { clear(cell: number): void; claim(x: number, y: number, w: number, h: number): boolean } {
  const taken = new Set<number>();
  let cell = 1;
  return {
    clear(c) { taken.clear(); cell = c; },
    claim(x, y, w, h) {
      const hw = (w * spacing) / 2, hh = (h * spacing) / 2;
      const r0 = Math.floor((y - hh) / cell), r1 = Math.floor((y + hh) / cell), c0 = Math.floor((x - hw) / cell), c1 = Math.floor((x + hw) / cell);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (taken.has(r * 8192 + c)) return false;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) taken.add(r * 8192 + c);
      return true;
    },
  };
}
