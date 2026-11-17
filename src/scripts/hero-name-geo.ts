// Outline geometry for the energised name: the glyph mask, its boundary, the outline strands the current
// runs along, and the micro arcs. Pure canvas and array work; the name module owns timing and drawing.
import { devicePixelRatioCapped } from './hero-loop';
import { inkNow } from './hero-theme';

export const WAVE_BAND = 0.12; // wave half-width as a fraction of the name width
const STRAND_MIN = 12; // shorter outline fragments read as noise
const MIN_STRAND_SPAN = 0.035; // share of the name width: smaller loops are the i and j dots
const extent = (vs: number[]): number => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of vs) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return hi - lo;
};
const NEAR_DEV_PX = 2.8; // device px: the outline walk links touching pixels only
const CELL_DEV_PX = 4; // grid bucket for the outline walk
// A tight rim, not a cloud: a wide blur smudged the letter edges on pearl (critic round 2).
const GLOW_BLUR_DEV_PX = 3;
const ARC_LIFE_MIN_MS = 160;
const ARC_LIFE_SPAN_MS = 180;
const ARC_STEPS = 16; // polyline samples per arc: smooth at every size
const ARC_BOW = 0.28; // bow as a share of the chord length
const ARC_WOBBLE = 0.05; // ripple along the arc, as a share of the chord length
export interface Strand { xs: number[]; ys: number[]; cx: number; teal: boolean }
export interface Arc { xs: number[]; ys: number[]; born: number; life: number; strength: number }
export interface Geo {
  w: number; // CSS px
  h: number;
  dpr: number;
  glow: HTMLCanvasElement;
  inner: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  strands: Strand[];
}
export const rnd = (): number => Math.random();
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
export function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Paints each `.m2c-word` in white at its rendered position, relative to the overlay's box. */
function drawWords(ctx: CanvasRenderingContext2D, h1: HTMLElement, origin: DOMRect, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#fff';
  for (const word of h1.querySelectorAll<HTMLElement>('.m2c-word')) {
    const text = word.textContent ?? '';
    const box = document.createRange();
    box.selectNodeContents(word);
    const r = box.getBoundingClientRect();
    const st = getComputedStyle(word);
    ctx.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
    Object.assign(ctx, { letterSpacing: st.letterSpacing === 'normal' ? '0px' : st.letterSpacing });
    // The DOM box top is the em-box top; the canvas baseline sits one font ascent below it.
    const ascent = ctx.measureText(text).fontBoundingBoxAscent ?? parseFloat(st.fontSize) * 0.8;
    ctx.fillText(text, r.left - origin.left, r.top - origin.top + ascent);
  }
}

/** Device-pixel coordinates of every pixel on the boundary of the filled glyphs, interleaved x,y. */
function edgePoints(mask: HTMLCanvasElement): number[] {
  const ctx = mask.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  const { width: W, height: H } = mask;
  const a = ctx.getImageData(0, 0, W, H).data;
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < H && a[(y * W + x) * 4 + 3] > 127;
  const out: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (solid(x, y) && (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1))) {
        out.push(x, y);
      }
    }
  }
  return out;
}

/**
 * Chains boundary pixels into outline strands with a greedy nearest-neighbour walk over a bucket
 * grid. Closed contours come out as loops, which is what the current needs to run around.
 */
function buildStrands(pts: number[], W: number, dpr: number): Strand[] {
  const n = pts.length / 2;
  const cols = Math.ceil(W / CELL_DEV_PX) + 1;
  const cellOf = (x: number, y: number): number =>
    Math.floor(y / CELL_DEV_PX) * cols + Math.floor(x / CELL_DEV_PX);
  const grid = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const key = cellOf(pts[i * 2], pts[i * 2 + 1]);
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  }
  const used = new Uint8Array(n);
  const nearest = (cur: number): number => {
    const x = pts[cur * 2];
    const y = pts[cur * 2 + 1];
    const cx = Math.floor(x / CELL_DEV_PX);
    const cy = Math.floor(y / CELL_DEV_PX);
    let best = -1;
    let bestD = NEAR_DEV_PX * NEAR_DEV_PX;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of grid.get((cy + dy) * cols + cx + dx) ?? []) {
          if (used[j]) continue;
          const ex = pts[j * 2] - x;
          const ey = pts[j * 2 + 1] - y;
          const d = ex * ex + ey * ey;
          if (d <= bestD) {
            bestD = d;
            best = j;
          }
        }
      }
    }
    return best;
  };
  const strands: Strand[] = [];
  for (let start = 0; start < n; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const chain = [start];
    for (let next = nearest(start); next >= 0; next = nearest(next)) {
      used[next] = 1;
      chain.push(next);
    }
    if (chain.length < STRAND_MIN) continue;
    const xs = chain.map((i) => pts[i * 2] / dpr);
    const ys = chain.map((i) => pts[i * 2 + 1] / dpr);
    const cx = xs.reduce((s, v) => s + v, 0) / xs.length;
    // Tittles (the dots of i and j) are too small to carry a packet: their loops read as hard squares.
    const span = Math.max(extent(xs), extent(ys));
    if (span < (W / dpr) * MIN_STRAND_SPAN) continue;
    strands.push({ xs, ys, cx, teal: strands.length % 3 === 0 });
  }
  return strands;
}

/** Glow: the glyphs, blurred and tinted cyan. Inner: the glyphs filled with a white-to-teal plasma. */
function glowLayers(mask: HTMLCanvasElement, dpr: number, light: boolean): { glow: HTMLCanvasElement; inner: HTMLCanvasElement } {
  const glow = canvasOf(mask.width, mask.height);
  const g = glow.getContext('2d');
  if (g) {
    if ('filter' in g) g.filter = `blur(${GLOW_BLUR_DEV_PX * dpr}px)`;
    g.drawImage(mask, 0, 0);
    g.filter = 'none';
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = light ? '#008cff' : '#38e1ff'; // light: electric blue, never navy (round 12b: navy read as a shadow)
    g.fillRect(0, 0, glow.width, glow.height);
  }
  const inner = canvasOf(mask.width, mask.height);
  const i = inner.getContext('2d');
  if (i) {
    i.drawImage(mask, 0, 0);
    i.globalCompositeOperation = 'source-in';
    const grad = i.createLinearGradient(0, 0, 0, inner.height);
    grad.addColorStop(0, light ? '#1f6fd1' : '#f3fbff');
    grad.addColorStop(0.45, light ? '#4b3cff' : '#bff4ff');
    grad.addColorStop(1, light ? '#0a7d78' : '#19d3c5');
    i.fillStyle = grad;
    i.fillRect(0, 0, inner.width, inner.height);
  }
  return { glow, inner };
}

export function buildGeometry(h1: HTMLElement, fx: HTMLCanvasElement): Geo | null {
  const rect = fx.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const dpr = devicePixelRatioCapped();
  const mask = canvasOf(rect.width * dpr, rect.height * dpr);
  const mctx = mask.getContext('2d');
  if (!mctx) return null;
  drawWords(mctx, h1, rect, dpr);
  const { glow, inner } = glowLayers(mask, dpr, inkNow().light);
  const strands = buildStrands(edgePoints(mask), mask.width, dpr);
  return { w: rect.width, h: rect.height, dpr, glow, inner, mask, strands };
}

/** A curved arc from a to b: the chord bows to one side with a gentle wobble. Never a straight segment. */
function makeArc(a: [number, number], b: [number, number], now: number, strength: number): Arc {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bow = (rnd() - 0.5) * 2 * len * ARC_BOW;
  const phase = rnd() * Math.PI * 2;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const u = i / ARC_STEPS;
    const s = Math.sin(Math.PI * u); // zero at both ends, so the arc meets its two glyph edges
    const off = bow * s + Math.sin(u * Math.PI * 3 + phase) * len * ARC_WOBBLE * s;
    xs.push(a[0] + dx * u + nx * off);
    ys.push(a[1] + dy * u + ny * off);
  }
  return { xs, ys, born: now, life: ARC_LIFE_MIN_MS + rnd() * ARC_LIFE_SPAN_MS, strength };
}

/** A strand near `frontX` (when given), so the release wave throws arcs where it passes. */
function pickStrand(geo: Geo, frontX: number | null): Strand {
  let s = pick(geo.strands);
  for (let tries = 0; tries < 10 && frontX !== null && Math.abs(s.cx - frontX) > geo.w * WAVE_BAND; tries++) {
    s = pick(geo.strands);
  }
  return s;
}

/** Two outline points one to three letters apart: a micro arc jumps between neighbouring glyphs. */
export function pickArc(geo: Geo, now: number, strength: number, frontX: number | null): Arc | null {
  if (geo.strands.length < 2) return null;
  const s1 = pickStrand(geo, frontX);
  const i1 = Math.floor(rnd() * s1.xs.length);
  const a: [number, number] = [s1.xs[i1], s1.ys[i1]];
  for (let tries = 0; tries < 16; tries++) {
    const s2 = pick(geo.strands);
    const i = Math.floor(rnd() * s2.xs.length);
    const b: [number, number] = [s2.xs[i], s2.ys[i]];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > 14 && d < 52 && Math.abs(b[0] - a[0]) > 6) return makeArc(a, b, now, strength);
  }
  return null;
}

