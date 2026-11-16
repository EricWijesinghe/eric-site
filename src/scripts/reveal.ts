// Scroll reveals (the data-reveal API every section uses) and the top progress bar. Content stays visible unless
// JS adds js-reveal to <html>, and reduced motion never hides anything.
//
// Each section is split into units: unit 0 starts at the section, and a new unit starts at [data-reveal-unit] or
// at a top-level [data-reveal] 320 px or more below the current unit's top (so Projects' chapters arrive one by
// one with no markup change). One trigger per unit, and revealing unit n first settles every earlier unit with no
// delay, so a nav jump, a reload mid-page or scrolling back never shows late pop-in. Delays grow with the
// distance from the river (setRevealOrigin, flow-field.ts), so the wave seen in the glyphs reaches each element
// as it appears. Every arrival is announced as window 'm2c:arrive'.

export interface ArriveDetail {
  id: string;
  unit: number;
  major: boolean;
  /** Origin of the wave, in page px. */
  x: number;
  y: number;
  instant: boolean;
}

type Origin = (sectionId: string, y: number) => { x: number; y: number } | null;

interface Unit {
  section: HTMLElement;
  index: number;
  trigger: HTMLElement;
  els: HTMLElement[];
  done: boolean;
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const NEW_UNIT_PX = 320;
// Pulses leave the pool at 1600 px/s, so 1.6 px per ms keeps each element in step with the wave.
const WAVE_PX_PER_MS = 1.6;
const MIN_DELAY_MS = 90;
const MAX_DELAY_MS = 720;
const TRIGGER_MARGIN = '0px 0px -28% 0px';
// How long the page must rest before on-screen units below the trigger line arrive anyway.
const SETTLE_MS = 600;
const LEAD = '.section-label, .section-title';

let origin: Origin | null = null;

/** The river tells reveal where each wave starts; without it (404 page) the wave starts at the unit's corner. */
export function setRevealOrigin(fn: Origin): void {
  origin = fn;
}

const pageBox = (el: Element): DOMRect => {
  const r = el.getBoundingClientRect();
  return new DOMRect(r.left + window.scrollX, r.top + window.scrollY, r.width, r.height);
};

function originFor(section: HTMLElement, at: DOMRect): { x: number; y: number } {
  return origin?.(section.id, at.top) ?? { x: at.left, y: at.top };
}

/** Sets each element's delay from its distance to the origin (labels and titles start at once) and shows it. */
function show(els: readonly HTMLElement[], from: { x: number; y: number } | null): void {
  for (const el of els) {
    if (el.classList.contains('is-in')) continue;
    let d = 0;
    if (from && !el.matches(LEAD)) {
      const b = pageBox(el);
      const dist = Math.hypot(b.left + b.width / 2 - from.x, b.top + b.height / 2 - from.y);
      d = Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, dist / WAVE_PX_PER_MS));
    }
    el.style.setProperty('--d', d.toFixed(0));
    el.classList.add('is-in');
  }
}

/** Reveals the root (if it is itself data-reveal) and its pending data-reveal descendants (one-argument API kept). */
export function revealGroup(root: Element): void {
  const els: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches('[data-reveal]')) els.push(root);
  root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => els.push(el));
  const section = root.closest<HTMLElement>('main > section');
  show(els, section ? originFor(section, pageBox(root)) : pageBox(root));
}

function splitUnits(section: HTMLElement): Unit[] {
  const units: Unit[] = [];
  const owner = new Map<Element, Unit>();
  // Unit 0's reference is its first element, not the section edge: the section's top padding alone is ~160 px.
  let top = Infinity;
  for (const el of section.querySelectorAll<HTMLElement>('[data-reveal], [data-reveal-unit]')) {
    const outer = el.parentElement?.closest('[data-reveal], [data-reveal-unit]');
    const inherited = outer && section.contains(outer) ? owner.get(outer) : undefined;
    const elTop = pageBox(el).top;
    let unit = inherited ?? units[units.length - 1];
    if (top === Infinity) top = elTop;
    const starts = el.hasAttribute('data-reveal-unit') || (!inherited && unit && elTop - top >= NEW_UNIT_PX);
    if (!unit || (starts && unit.els.length > 0)) {
      unit = { section, index: units.length, trigger: el, els: [], done: false };
      units.push(unit);
      if (units.length > 1) top = elTop;
    }
    owner.set(el, unit);
    if (el.hasAttribute('data-reveal')) unit.els.push(el);
  }
  return units;
}

function announce(u: Unit, from: { x: number; y: number }, instant: boolean): void {
  const detail: ArriveDetail = { id: u.section.id, unit: u.index, major: u.index === 0, x: from.x, y: from.y, instant };
  window.dispatchEvent(new CustomEvent<ArriveDetail>('m2c:arrive', { detail }));
}

function arrive(all: readonly Unit[], u: Unit, instant: boolean): void {
  for (const prev of all) {
    if (prev === u) break;
    if (prev.done) continue;
    prev.done = true;
    show(prev.els, null);
    announce(prev, originFor(prev.section, pageBox(prev.trigger)), true);
  }
  if (u.done) return;
  u.done = true;
  const from = originFor(u.section, pageBox(u.trigger));
  show(u.els, instant ? null : from);
  announce(u, from, instant);
}

function mountUnits(): void {
  const units = [...document.querySelectorAll<HTMLElement>('main > section')].flatMap(splitUnits);
  if (units.length === 0) return;
  const byTrigger = new Map(units.map((u) => [u.trigger, u]));
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const u = byTrigger.get(entry.target as HTMLElement);
        if (!u) continue;
        // Above the viewport already (reload mid-page, a jump): settle it without a wave.
        const above = entry.boundingClientRect.bottom < 0;
        if (!entry.isIntersecting && !above) continue;
        arrive(units, u, reduceMotion || above);
        io.unobserve(entry.target);
      }
    },
    { rootMargin: TRIGGER_MARGIN, threshold: 0 },
  );
  units.forEach((u) => io.observe(u.trigger));

  // The trigger margin leaves the bottom band hidden; once the page rests (a scroll ends, a load, a hash jump),
  // anything on screen arrives, so nothing waits there for a scroll that may never come.
  let timer = 0;
  const settle = (): void => {
    for (const u of units) {
      if (u.done) continue;
      const r = u.trigger.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
      arrive(units, u, reduceMotion);
      io.unobserve(u.trigger);
    }
  };
  const later = (): void => {
    clearTimeout(timer);
    timer = window.setTimeout(settle, SETTLE_MS);
  };
  window.addEventListener('scroll', later, { passive: true });
  window.addEventListener('hashchange', later);
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
}

const bar = document.querySelector<HTMLElement>('[data-progress]');
if (bar && !reduceMotion) {
  let queued = false;
  const paint = (): void => {
    queued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? window.scrollY / max : 0;
    bar.style.transform = `scaleX(${ratio.toFixed(4)})`;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(paint);
      }
    },
    { passive: true },
  );
}

if ('IntersectionObserver' in window) {
  if (!reduceMotion) document.documentElement.classList.add('js-reveal');
  mountUnits();
}
