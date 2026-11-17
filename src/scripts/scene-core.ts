import { codeRain } from './scene-glyphs';

// Shared plumbing for the Projects scenes. Each scene is one Canvas2D surface sized to its box at a
// capped DPR. The ground fills the whole box, and the scene draws inside a SAFE inset so no detail
// sits under the rounded corner or the rim. It draws only while on screen and the tab is visible.
// Under reduced motion it freezes on a settled frame (STILL_T) and runs one bounded burst after
// each interaction. Scenes learn about the chain only through 'm2c:chain', which the poller in
// scene-chain.ts sends.

export const MAX_DPR = 2;
const WIDE_CANVAS = 900; // px: a stage this wide fills many pixels, so it takes a lower DPR cap
const WIDE_DPR = 1.5;
export const STILL_T = 10; // seconds: a settled frame (every proof finished, the seal locked)
/** Px kept clear between the box edge and every drawn detail: the crisp rim never cuts a label. */
export const SAFE = 22;
const SAFE_NARROW = 16; // a phone stage keeps more of its width for the drawing
const NARROW_BOX = 640; // px: below this box width the inset is SAFE_NARROW
const SPOT_EVERY = 20; // frames between hotspot refreshes (the DAG slides; everything else holds still)
const MAX_DT = 0.05; // after a stalled tab, resume without a jump
const POKE_MS = 2500; // reduced motion: how long one interaction may animate
const VIEW_MARGIN = '160px 0px'; // start a little before the scene scrolls into view
const GRID_STEP = 40;
const PROBE_STEP = 18; // px a keyboard probe moves per arrow key
const PROBE_R = 9; // the probe's ring radius
const PROBE_ARM = 14; // half-length of its cross hairs
const ARROWS: ReadonlyMap<string, Pt> = new Map([
  ['ArrowLeft', { x: -1, y: 0 }],
  ['ArrowRight', { x: 1, y: 0 }],
  ['ArrowUp', { x: 0, y: -1 }],
  ['ArrowDown', { x: 0, y: 1 }],
]);

import { glass, hair, isLight, lineW, MONO, onThemeChange, PALETTE, rgbOf, stroke, txt, type Pt, type RgbKey } from './scene-palette';
import { makeSpots, type Spot, type SpotPool } from './scene-spots';
export * from './scene-palette';
export type { Spot } from './scene-spots';

export type PointerKind = 'down' | 'move' | 'up' | 'leave';

/**
 * A scene. `draw` gets the inner box (the safe inset already applied, origin at its top-left):
 * every coordinate a painter uses is inside the rim. Pointer coordinates use the same frame.
 */
export interface Painter {
  draw(g: CanvasRenderingContext2D, w: number, h: number, t: number): void;
  resize?(w: number, h: number): void;
  /** Pointer in CSS px relative to the inner box. `t` is the scene clock. */
  pointer?(kind: PointerKind, x: number, y: number, t: number): void;
  /** The scene's keyboard control (its "interact" button) was activated. */
  act?(t: number): void;
  /** Hotspots that get a focusable button each (stages only; see scene-spots). */
  spots?(): readonly Spot[];
  /** One line about what the pointer or focus is on, shown under the stage; null = the stage's hint. */
  inspect?(): string | null;
}

/** `reduce` tells the scene to skip its big motion (a burst may still run, see POKE_MS). */
export type MakeFn = (host: HTMLElement, reduce: boolean) => Painter;

export interface ChainDetail {
  height: number | null;
  blockTime: string | null;
  state: string;
  live: boolean;
}

type ChainFn = (d: ChainDetail) => void;
const chainSubs = new Set<ChainFn>();
let lastChain: ChainDetail | null = null;

// Bound once, at module load, so a poll answer that arrives before a scene mounts is kept.
window.addEventListener('m2c:chain', (e) => {
  lastChain = (e as CustomEvent<ChainDetail>).detail;
  chainSubs.forEach((fn) => fn(lastChain as ChainDetail));
});

/** Subscribes to chain updates; the latest one is replayed at once. Returns an unsubscribe. */
export function onChain(fn: ChainFn): () => void {
  chainSubs.add(fn);
  if (lastChain) fn(lastChain);
  return () => chainSubs.delete(fn);
}

/** Mounts one scene. `make` runs on first sight, so offscreen scenes cost nothing. */
export function mountScene(host: HTMLElement, make: MakeFn): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'scene-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  const g = canvas.getContext('2d');
  if (!g) return; // no canvas: the figure's aria-label still describes the scene

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let painter: Painter | null = null;
  let w = 0; // whole box, CSS px
  let h = 0;
  let visible = false;
  let raf = 0;
  let last = 0;
  let pokeUntil = 0;
  // Reduced motion starts on the settled frame; otherwise the loop starts at the beginning.
  let clock = reduce ? STILL_T : 0;
  // Keyboard probe, in the inner box's frame: the arrow keys move it, and it acts as a pointer does.
  let probe: Pt | null = null;
  let safe = SAFE;
  let frames = 0;
  let pool: SpotPool | null = null;
  // The inspect line under a stage: fed by hover, focus and tap; its data-hint is the resting text.
  const line = host.closest('.stage')?.querySelector<HTMLElement>('.stage-inspect') ?? null;
  const say = (): void => {
    if (!line || !painter?.inspect) return;
    const text = painter.inspect() ?? line.dataset.hint ?? '';
    if (line.textContent !== text) line.textContent = text;
  };

  const running = (): boolean => visible && !document.hidden && (!reduce || performance.now() < pokeUntil);
  const paint = (): void => {
    if (!painter || w === 0) return;
    g.clearRect(0, 0, w, h);
    backdrop(g, w, h, GRID_STEP, clock);
    g.save();
    g.translate(safe, safe);
    painter.draw(g, w - safe * 2, h - safe * 2, clock);
    drawProbe(g, probe);
    g.restore();
    if (pool && painter.spots && frames++ % SPOT_EVERY === 0) pool.sync(painter.spots(), safe);
    say();
  };
  const frame = (now: number): void => {
    clock += Math.min(MAX_DT, (now - last) / 1000);
    last = now;
    paint();
    raf = running() ? requestAnimationFrame(frame) : 0;
  };
  const sync = (): void => {
    if (running()) {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  const poke = (): void => {
    if (!reduce) return;
    pokeUntil = performance.now() + POKE_MS;
    sync();
  };
  const fit = (): void => {
    const r = host.getBoundingClientRect();
    w = r.width;
    h = r.height;
    safe = w < NARROW_BOX ? SAFE_NARROW : SAFE;
    frames = 0; // re-place the hotspots on the next paint
    const dpr = Math.min(window.devicePixelRatio || 1, w > WIDE_CANVAS ? WIDE_DPR : MAX_DPR);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    painter?.resize?.(Math.max(0, w - safe * 2), Math.max(0, h - safe * 2));
    paint();
  };

  // Pointer input arrives in the inner box's frame, the same one the painter draws in.
  const forward = (kind: PointerKind) => (e: PointerEvent): void => {
    if (!painter) return;
    const r = host.getBoundingClientRect();
    painter.pointer?.(kind, e.clientX - r.left - safe, e.clientY - r.top - safe, clock);
    if (kind === 'down') poke();
    if (!running()) paint();
  };
  host.addEventListener('pointermove', forward('move'));
  host.addEventListener('pointerdown', (e) => {
    host.setPointerCapture(e.pointerId);
    forward('down')(e);
  });
  host.addEventListener('pointerup', forward('up'));
  host.addEventListener('pointercancel', forward('up'));
  // A finger lifting fires pointerleave, so a tap's reading holds until a touch lands outside the scene.
  host.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') forward('leave')(e); });
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !host.contains(e.target as Node)) forward('leave')(e); });

  // The scene's keyboard control sits beside the viewport, never inside it (a role=img has no
  // interactive children), and works the same way as a pointer press. Enter or Space runs the action;
  // the arrow keys move the probe over the scene (hover to inspect); Shift with an arrow also presses,
  // drags one step and releases, which is how a drag turns an object.
  // A bench scene's control is in its figure; a stage's control sits in the explainer of its act.
  const control = host.closest('figure, .act')?.querySelector<HTMLButtonElement>('.scene-act');
  control?.addEventListener('click', () => {
    if (!painter) return;
    painter.act?.(clock);
    poke();
    if (!running()) paint();
  });
  control?.addEventListener('keydown', (e) => {
    const dir = ARROWS.get(e.key);
    if (!dir || !painter) return;
    e.preventDefault();
    const inner = { w: Math.max(0, w - safe * 2), h: Math.max(0, h - safe * 2) };
    const from = probe ?? { x: inner.w / 2, y: inner.h / 2 };
    probe = {
      x: Math.min(inner.w, Math.max(0, from.x + dir.x * PROBE_STEP)),
      y: Math.min(inner.h, Math.max(0, from.y + dir.y * PROBE_STEP)),
    };
    if (e.shiftKey) {
      painter.pointer?.('down', from.x, from.y, clock);
      painter.pointer?.('move', probe.x, probe.y, clock);
      painter.pointer?.('up', probe.x, probe.y, clock);
    } else {
      painter.pointer?.('move', probe.x, probe.y, clock);
    }
    poke();
    if (!running()) paint();
  });
  control?.addEventListener('blur', () => {
    probe = null;
    painter?.pointer?.('leave', 0, 0, clock);
    if (!running()) paint();
  });

  // A focused hotspot acts as the pointer resting on it; Enter presses it, as a tap would.
  const spotHandlers = {
    focus(s: Spot): void {
      painter?.pointer?.('move', s.x, s.y, clock);
      if (!running()) paint();
    },
    blur(): void {
      painter?.pointer?.('leave', 0, 0, clock);
      if (!running()) paint();
    },
    press(s: Spot): void {
      painter?.pointer?.('down', s.x, s.y, clock);
      painter?.pointer?.('up', s.x, s.y, clock);
      painter?.pointer?.('move', s.x, s.y, clock);
      poke();
      if (!running()) paint();
    },
  };

  new ResizeObserver(fit).observe(host);
  new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible && !painter) {
        painter = make(host, reduce);
        if (painter.spots) pool = makeSpots(host, `${host.closest('.stage')?.getAttribute('aria-label') ?? 'scene'}: inspect points`, spotHandlers);
        fit();
      }
      sync();
    },
    { rootMargin: VIEW_MARGIN },
  ).observe(host);
  document.addEventListener('visibilitychange', sync);
  onThemeChange(paint);
}

/** The keyboard probe: a ring with cross hairs, so a keyboard user can see where the pointer would be. */
function drawProbe(g: CanvasRenderingContext2D, p: Pt | null): void {
  if (!p) return;
  g.strokeStyle = stroke('cyan', 0.9);
  g.lineWidth = lineW(1.5);
  g.beginPath();
  g.arc(p.x, p.y, PROBE_R, 0, Math.PI * 2);
  g.moveTo(p.x - PROBE_ARM, p.y);
  g.lineTo(p.x + PROBE_ARM, p.y);
  g.moveTo(p.x, p.y - PROBE_ARM);
  g.lineTo(p.x, p.y + PROBE_ARM);
  g.stroke();
  g.lineWidth = lineW(1);
}

/** Seeded PRNG (mulberry32): the same scene looks the same on every visit. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const easeOut = (x: number): number => 1 - (1 - clamp01(x)) ** 3;
export const easeInOut = (x: number): number => {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};

/** A rounded-rectangle path (soft corners, no hard box). Built by hand: the corner radius is clamped. */
export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

/** Chip box height and the gap between stacked chips: a stack never overlaps, at any width. */
export const CHIP_H = 20;
export const CHIP_GAP = 8;
/** Baseline of stacked chip `row` (0 = first), measured from the top of its region. */
export const chipY = (row: number): number => 26 + row * (CHIP_H + CHIP_GAP);
/** Height of the two chip rows at the top of a region: nothing else is drawn in it. */
export const CHIP_ZONE = chipY(1) + CHIP_H / 2 + 4;

/**
 * A caption that stays legible over any graphic behind it. Dark: on a soft glass chip. Pearl: ink straight on
 * the surface with a soft page-colour halo, so no pill or box is drawn around the words.
 */
export function chip(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  g.font = MONO;
  if (isLight()) {
    g.strokeStyle = PEARL_HALO;
    g.lineWidth = HALO_W;
    g.lineJoin = 'round';
    g.strokeText(text, x, y);
    caption(g, text, x, y, color);
    return;
  }
  const w = g.measureText(text).width;
  rrect(g, x - 6, y - 14, w + 12, CHIP_H, 6);
  g.fillStyle = `rgb(${glass()} / 0.6)`;
  g.fill();
  caption(g, text, x, y, color);
}
const PEARL_HALO = 'rgb(246 250 253 / 0.85)';
const HALO_W = 4;

/** A small mono caption in canvas (decorative label; the page carries the real text). */
export function caption(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  g.font = MONO;
  g.fillStyle = color;
  g.textBaseline = 'alphabetic';
  g.fillText(text, x, y);
}

// Keys, not triplets: the colour is looked up per draw, so a theme switch takes effect.
const AURORA: readonly { c: RgbKey; x: number; y: number; r: number; a: number; ph: number }[] = [
  { c: 'indigo', x: 0.2, y: 0.25, r: 0.6, a: 0.2, ph: 0 },
  { c: 'azure', x: 0.85, y: 0.2, r: 0.55, a: 0.16, ph: 1.3 },
  { c: 'violet', x: 0.55, y: 0.95, r: 0.5, a: 0.14, ph: 2.1 },
  { c: 'magenta', x: 0.95, y: 0.8, r: 0.4, a: 0.1, ph: 3.2 },
  { c: 'emerald', x: 0.05, y: 0.9, r: 0.38, a: 0.07, ph: 4.4 },
];
const DRIFT_X = 0.06;
const DRIFT_Y = 0.05;

/** Drifting aurora: soft coloured light in the wider spectrum, never a hard shape. */
export function aurora(g: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const span = Math.max(w, h);
  for (const b of AURORA) {
    const x = (b.x + DRIFT_X * Math.sin(t * 0.11 + b.ph)) * w;
    const y = (b.y + DRIFT_Y * Math.cos(t * 0.09 + b.ph)) * h;
    const grad = g.createRadialGradient(x, y, 0, x, y, b.r * span);
    grad.addColorStop(0, rgbOf(b.c, isLight() ? b.a * PEARL_AURORA : b.a));
    grad.addColorStop(1, rgbOf(b.c, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
}

/** Light-theme grid paint: faint at the centre, gone at the edges, so the grid never frames the scene. */
function gridFade(g: CanvasRenderingContext2D, w: number, h: number): CanvasGradient {
  const cx = w / 2;
  const cy = h / 2;
  const fade = g.createRadialGradient(cx, cy, Math.min(w, h) * 0.2, cx, cy, Math.max(w, h) * 0.62);
  fade.addColorStop(0, `rgb(${hair()} / 0.42)`);
  fade.addColorStop(1, `rgb(${hair()} / 0)`);
  return fade;
}

/** Void ground, drifting aurora, code rain and a faint grid, over the whole box. */
export function backdrop(g: CanvasRenderingContext2D, w: number, h: number, step: number, t: number): void {
  g.fillStyle = PALETTE.void;
  // A veil, so the page's light shows through the scene; pearl keeps it thin so the stage is no lavender card.
  g.globalAlpha = isLight() ? PEARL_VEIL : 0.7;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 1;
  aurora(g, w, h, t);
  codeRain(g, w, h, t, txt());
  // A faint dot lattice instead of graph paper: one point per grid crossing, so nothing reads as a blueprint.
  // Pearl dots fade toward the edges, so the lattice never frames the scene.
  g.fillStyle = isLight() ? gridFade(g, w, h) : `rgb(${txt()} / ${DOT_A})`;
  g.beginPath();
  for (let x = step / 2; x < w; x += step) {
    for (let y = step / 2; y < h; y += step) g.rect(x - DOT / 2, y - DOT / 2, DOT, DOT);
  }
  g.fill();
}
const DOT = 1.5; // px side of a lattice dot
const PEARL_VEIL = 0.3;
const PEARL_AURORA = 0.35; // pearl: the aurora is a hint of colour, not a lavender wash
const DOT_A = 0.1; // dark: ice dots at a tenth, as quiet as the old grid lines
