// The current's layout: where the river of glyphs runs on the page. A pure reader of the DOM (it writes nothing):
// the source under his figure (desktop) or under the hero copy (stacked), one waypoint per gap between sections on
// alternating sides, extra waypoints in tall sections, and the end at the globe in Contact. Rebuilt whenever main
// resizes, fonts land, or the hero reports a new layout. Geometry maths: conduit-geometry.ts.
import { bump, sampleSpine, smoothstep, spineX, type Anchor, type Spine } from './conduit-geometry';
import { collectKeep, restingBox, type Box, type Disc } from './flow-keep';

export interface Gap {
  /** Centre of the empty space between two sections, page px. */
  y: number;
  /** Half-width of the pool envelope: inside the empty space, clear of both sections' copy. */
  hw: number;
  /** Index of the section below the gap. */
  below: number;
}

export interface Layout {
  w: number;
  stacked: boolean;
  lanes: number;
  base: number;
  ghost: number;
  source: Anchor;
  end: Anchor;
  /** Page y where the river has faded out (the globe's top edge). */
  endTop: number;
  spine: Spine;
  gaps: Gap[];
  ids: string[];
  /** Copy and frames the glyphs keep clear of (flow-keep.ts). */
  keep: Box[];
  /** The globe's circle: no glyph is drawn inside it. */
  disc: Disc | null;
}

// Same breakpoint as the hero's stacked layout (hero.css): copy sits under the figure there.
const STACKED_QUERY = '(max-width: 1023px), (orientation: portrait)';
const WIDE_PX = 1280;
const TABLET_PX = 720;
const LANES = { wide: 9, tablet: 7, phone: 6 } as const;
// Eel gate (spec step 3): at 110/84/64 px with .18 swing the current read as a dense diagonal tube, so it runs
// wider (x1.5), straighter and sparser.
// Phone keeps a narrow pool (~140 px) so nothing reaches the screen edge.
const BASE_PX = { wide: 165, tablet: 126, phone: 72 } as const;
const AMP = { desktop: 0.1, stacked: 0.12 } as const;
// Inside sections the current is a ghost: at .22 it competed with the copy it crossed (measured on screenshots).
const GHOST = { desktop: 0.1, stacked: 0.05 } as const;
const DEFAULT_FIG_X = 0.7;
const COPY_DROP_PX = 24;
// The pool fills the real void between one section's last copy and the next section's label, never reaching
// into either: its envelope stops this far short of both (padding maths put the core on the Support disclosure).
const POOL_INSET_PX = 12;
const TALL_SECTION_PX = 1400;
const EXTRA_EVERY_PX = 1100;
const EXTRA_END_GUARD_PX = 400;
const END_GUARD_PX = 40;
const END_FALLBACK_PX = 24;
const POOL_GROW = 0.9;
const FAN_GROW = 1.6;
const FAN_PX = 420;
const SOURCE_RAMP_PX = 160;
const END_RAMP_PX = 220;
// Colour hand-off across a gap: the chord changes over this fraction of the pool's half-width.
const CHORD_SPAN = 0.6;

let current: Layout | null = null;
const subscribers: ((l: Layout) => void)[] = [];

const pageRect = (el: Element): DOMRect => {
  const r = el.getBoundingClientRect();
  return new DOMRect(r.left + window.scrollX, r.top + window.scrollY, r.width, r.height);
};
const px = (v: string): number => parseFloat(v) || 0;

function sourceOf(stacked: boolean, w: number): Anchor {
  const stage = document.querySelector<HTMLElement>('.m2c-stage');
  if (!stage) return { x: w * DEFAULT_FIG_X, y: 0 };
  const sr = pageRect(stage);
  const copy = stage.querySelector('.m2c-copy');
  if (stacked && copy) return { x: w / 2, y: pageRect(copy).bottom + COPY_DROP_PX };
  const sing = stage.querySelector<HTMLElement>('.m2c-sing') ?? stage;
  const raw = parseFloat(getComputedStyle(sing).getPropertyValue('--fig-x'));
  const box = pageRect(sing);
  return { x: box.left + (Number.isFinite(raw) ? raw : DEFAULT_FIG_X) * box.width, y: sr.bottom };
}

/** Bottom of a section's last visible copy (its .wrap children), or its padding edge when it has none. */
function contentBottom(s: HTMLElement): number {
  let lo = -Infinity;
  for (const el of s.querySelectorAll(':scope > .wrap > *')) {
    const b = restingBox(el);
    if (b.b > b.t) lo = Math.max(lo, b.b);
  }
  return Number.isFinite(lo) ? lo : pageRect(s).bottom - px(getComputedStyle(s).paddingBottom);
}

/** Top of a section's label (its first line of copy), or its padding edge. */
function contentTop(s: HTMLElement): number {
  const label = s.querySelector('.section-label');
  return label ? restingBox(label).t : pageRect(s).top + px(getComputedStyle(s).paddingTop);
}

function gapsOf(sections: readonly HTMLElement[]): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i];
    const b = sections[i + 1];
    if (!a || !b) continue;
    const lo = contentBottom(a);
    const hi = contentTop(b);
    // hw >= 1: a zero width would make the bump divide by zero.
    gaps.push({ y: (lo + hi) / 2, hw: Math.max(1, (hi - lo) / 2 - POOL_INSET_PX), below: i + 1 });
  }
  return gaps;
}

/** Waypoints after the source: every gap but the first (the source is that pool), plus one every ~1100 px in tall sections. */
function waypoints(sections: readonly HTMLElement[], gaps: readonly Gap[], w: number, amp: number, endY: number): Anchor[] {
  const ys: number[] = [];
  sections.forEach((s, i) => {
    if (i === 0) return;
    const r = pageRect(s);
    if (r.height > TALL_SECTION_PX) {
      for (let y = r.top + EXTRA_EVERY_PX; y < r.bottom - EXTRA_END_GUARD_PX; y += EXTRA_EVERY_PX) ys.push(y);
    }
    const gap = gaps[i];
    if (gap) ys.push(gap.y);
  });
  // The first waypoint sits opposite the source, then the sides alternate.
  return ys
    .filter((y) => y < endY - END_GUARD_PX)
    .sort((a, b) => a - b)
    .map((y, k) => ({ x: w * (0.5 + (k % 2 === 0 ? -amp : amp)), y }));
}

function build(): Layout | null {
  const main = document.getElementById('main');
  if (!main) return null;
  const sections = [...main.querySelectorAll<HTMLElement>(':scope > section')];
  const w = document.documentElement.clientWidth;
  const stacked = window.matchMedia(STACKED_QUERY).matches;
  const size = w >= WIDE_PX ? 'wide' : w >= TABLET_PX ? 'tablet' : 'phone';
  const amp = stacked ? AMP.stacked : AMP.desktop;
  const source = sourceOf(stacked, w);
  // The globe's hit button is exactly its circle's box (finale lane).
  const globe = document.querySelector('#contact .globe-hit');
  const last = sections[sections.length - 1];
  const gr = globe ? pageRect(globe) : null;
  const end = gr
    ? { x: gr.left + gr.width / 2, y: gr.top + gr.height / 2 }
    : { x: w / 2, y: (last ? pageRect(last).bottom : source.y + 1) - END_FALLBACK_PX };
  const gaps = gapsOf(sections);
  const pts = [source, ...waypoints(sections, gaps, w, amp, end.y), end].filter((p, i, all) => i === 0 || p.y > (all[i - 1]?.y ?? -Infinity));
  return {
    w,
    stacked,
    lanes: LANES[size],
    base: BASE_PX[size],
    ghost: stacked ? GHOST.stacked : GHOST.desktop,
    source,
    end,
    endTop: gr ? gr.top : end.y,
    spine: sampleSpine(pts),
    gaps,
    ids: sections.map((s) => s.id),
    keep: collectKeep(sections),
    disc: gr ? { x: end.x, y: end.y, r: gr.width / 2 } : null,
  };
}

export const layout = (): Layout | null => current;

/** The pool envelope G(y): 1 at a gap centre, falling to 0 inside the sections. */
/** Index of the gap whose pool covers page y most, or -1. */
export function poolIndexAt(y: number, l: Layout): number {
  let best = -1;
  let g = 0;
  l.gaps.forEach((gap, i) => {
    const v = bump((y - gap.y) / gap.hw);
    if (v > g) [g, best] = [v, i];
  });
  return best;
}

export function poolAt(y: number, l = current): number {
  if (!l) return 0;
  let g = 0;
  for (const gap of l.gaps) g = Math.max(g, bump((y - gap.y) / gap.hw));
  return g;
}

/** River brightness at page y: a ghost inside sections, full in the pools. */
export const envAt = (y: number, l = current): number => (l ? l.ghost + (1 - l.ghost) * poolAt(y, l) : 0);

/** River width at page y: wider in the pools, and a wide sparse fan right under his figure. */
export function widthAt(y: number, g: number, l: Layout): number {
  const fan = 1 + FAN_GROW * (1 - smoothstep(0, FAN_PX, y - l.source.y));
  return l.base * (1 + POOL_GROW * g) * fan;
}

/** 0 at the stage bottom rising over 160 px (never on his figure), and 0 again at the globe's edge (never over it). */
export const rampAt = (y: number, l: Layout): number =>
  smoothstep(l.source.y, l.source.y + SOURCE_RAMP_PX, y) * (1 - smoothstep(l.endTop - END_RAMP_PX, l.endTop, y));

export function spineAt(y: number): Anchor {
  return { x: current ? spineX(current.spine, y) : window.innerWidth / 2, y };
}

/** The pool a section is entered from (the gap above it), or null for the stage and unknown ids. */
export function poolCentre(sectionId: string): Anchor | null {
  const l = current;
  const i = l ? l.ids.indexOf(sectionId) : -1;
  const gap = l && i > 0 ? l.gaps[i - 1] : undefined;
  return gap ? spineAt(gap.y) : null;
}

/** Continuous section position at page y (0 = top .. n-1 = contact); `shift` moves the hand-off (the prism). */
export function chordPos(y: number, shift = 0, l = current): number {
  if (!l) return 0;
  let p = 0;
  for (const gap of l.gaps) p += smoothstep(gap.y - gap.hw * CHORD_SPAN, gap.y + gap.hw * CHORD_SPAN, y - shift);
  return p;
}

export function onLayout(fn: (l: Layout) => void): void {
  subscribers.push(fn);
  if (current) fn(current);
}

let queued = false;
function rebuild(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    const next = build();
    if (!next) return;
    current = next;
    subscribers.forEach((fn) => fn(next));
  });
}

const main = document.getElementById('main');
if (main) {
  current = build();
  new ResizeObserver(rebuild).observe(main);
  window.addEventListener('resize', rebuild, { passive: true });
  window.addEventListener('m2c:layout', rebuild);
  void document.fonts?.ready.then(rebuild);
}
