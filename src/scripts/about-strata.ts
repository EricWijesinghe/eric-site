// The Stack (About): ARIA tabs on the rail, plane clicks, drag to turn, the break buttons, the phase
// scheduler and the scroll-built stack. This file only sets classes, data attributes and custom
// properties; sections-signal-about-strata.css draws every state, so theming and reduced motion stay in CSS.
import { whenIdle } from './idle';

const PHASES = 4;
const PHASE_MS = 1600;
const BREACH_MS = 1800;
/** A pointer that travels less than this is a click on a plane, not a drag. */
const DRAG_PX = 6;
const YAW_MIN = -58;
const YAW_MAX = -22;
const YAW_DEFAULT = -38;
const YAW_PRESETS = [-58, -38, -22];
const DEG_PER_PX = 0.12;
/** The stack starts opening when the stage top passes this fraction of the viewport... */
const BUILD_START = 0.95;
/** ...and is fully open after the stage has risen this fraction further. */
const BUILD_SPAN = 0.55;
/** Phones: the stack's top stays this far below the screen top when a break button brings it into view... */
const VIEW_EDGE = 16;
/** ...and this much room stays under the button for the verdict lines, when both fit. */
const VERDICT_ROOM = 64;
/** A smooth scroll that never fires 'scrollend' (older Safari) still runs the break after this. */
const SCROLL_WAIT_MS = 900;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function initStrata(): void {
  const root = document.querySelector<HTMLElement>('[data-strata]');
  const stage = root?.querySelector<HTMLElement>('.st-stage');
  const world = root?.querySelector<HTMLElement>('.st-world');
  const rail = root?.querySelector<HTMLElement>('.st-rail');
  if (!root || !stage || !world || !rail) return;
  const tabs = [...rail.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = [...root.querySelectorAll<HTMLElement>('.st-panel')];
  const planes = [...world.querySelectorAll<HTMLElement>('.st-plane')];
  const layered = [...world.querySelectorAll<HTMLElement>('[data-layer]'), ...tabs, ...panels];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const wide = matchMedia('(min-width: 900px)');
  const count = tabs.length;

  let active = clamp(Number(root.dataset.active) || count, 1, count);
  let phase = 0;
  let phaseTimer = 0;
  let breachTimer = 0;
  let visible = false;
  let started = false;
  let running = false;
  let yaw = YAW_DEFAULT;

  const layerOf = (el: HTMLElement) => Number(el.dataset.layer);
  const planeOf = (n: number) => planes.find((p) => layerOf(p) === n);
  const panelOf = (n: number) => panels.find((p) => layerOf(p) === n);

  // --- phases: a setTimeout chain; CSS transitions keyed on [data-phase] draw each step ---
  function clearPhase() {
    root?.querySelectorAll('[data-phase]').forEach((el) => el.removeAttribute('data-phase'));
  }
  function setPhase(p: number) {
    phase = p;
    for (const el of [planeOf(active), panelOf(active)]) el?.setAttribute('data-phase', String(p));
  }
  function tick() {
    setPhase((phase + 1) % PHASES);
    phaseTimer = window.setTimeout(tick, PHASE_MS);
  }
  function restartPhases() {
    window.clearTimeout(phaseTimer);
    clearPhase();
    if (!running || reduce.matches || !panelOf(active)?.querySelector('.st-phases')) return;
    setPhase(0);
    phaseTimer = window.setTimeout(tick, PHASE_MS);
  }

  function endBreach() {
    window.clearTimeout(breachTimer);
    planes.forEach((p) => p.removeAttribute('data-breach'));
  }

  function select(n: number, user: boolean, focus = false) {
    active = n;
    root!.dataset.active = String(n);
    if (user) root!.classList.add('is-engaged');
    for (const el of layered) {
      const k = layerOf(el);
      el.classList.toggle('is-active', k === n);
      el.classList.toggle('is-above', k > n);
      el.classList.toggle('is-below', k < n);
    }
    for (const t of tabs) {
      const on = layerOf(t) === n;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    endBreach();
    root!.querySelectorAll('.st-verdict').forEach((v) => v.replaceChildren());
    restartPhases();
  }

  // --- break buttons: one shot of the failure, the verdict stays until the tab changes ---
  function breach(btn: HTMLButtonElement) {
    const plane = planeOf(active);
    const status = btn.parentElement?.querySelector<HTMLElement>('.st-verdict');
    if (!plane || !status) return;
    let lines: unknown;
    try {
      lines = JSON.parse(btn.dataset.verdict ?? '[]');
    } catch {
      lines = [];
    }
    root!.classList.add('is-engaged');
    endBreach();
    window.clearTimeout(phaseTimer);
    clearPhase();
    void plane.offsetWidth; // restart the CSS one-shot when the button is pressed again
    plane.dataset.breach = 'true';
    // Emptied first so a repeated verdict is announced again.
    status.replaceChildren();
    requestAnimationFrame(() => {
      const spans = (Array.isArray(lines) ? lines : []).map((l) => {
        const s = document.createElement('span');
        s.textContent = String(l);
        return s;
      });
      status.replaceChildren(...spans);
    });
    breachTimer = window.setTimeout(() => {
      plane.removeAttribute('data-breach');
      restartPhases();
    }, BREACH_MS);
  }

  // Below 900px the button sits under the stack, a screen away: show the stack (and the verdict, when both fit)
  // first, then break it, so the failure is seen and not only read.
  function inView(btn: HTMLButtonElement, run: () => void) {
    if (wide.matches) return run();
    const s = stage!.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const least = b.bottom + VERDICT_ROOM - innerHeight;
    const most = s.top - VIEW_EDGE;
    const dy = least <= most ? clamp(0, least, most) : most;
    if (Math.abs(dy) < 2) return run();
    if (reduce.matches) {
      scrollBy({ top: dy, behavior: 'instant' });
      return run();
    }
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      window.clearTimeout(wait);
      removeEventListener('scrollend', go);
      run();
    };
    const wait = window.setTimeout(go, SCROLL_WAIT_MS);
    addEventListener('scrollend', go);
    scrollBy({ top: dy, behavior: 'smooth' });
  }

  // --- drag to turn, click to select (told apart by DRAG_PX) ---
  function setYaw(v: number) {
    yaw = clamp(v, YAW_MIN, YAW_MAX);
    stage!.style.setProperty('--yaw', `${yaw}deg`);
  }
  let pointer = -1;
  let downX = 0;
  let downYaw = 0;
  let dragging = false;
  let swallowClick = false;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pointer = e.pointerId;
    downX = e.clientX;
    downYaw = yaw;
    dragging = false;
    swallowClick = false;
  });
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointer) return;
    const dx = e.clientX - downX;
    if (!dragging && Math.abs(dx) > DRAG_PX) {
      dragging = true;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-dragging');
      root.classList.add('is-engaged');
    }
    if (dragging) setYaw(downYaw + dx * DEG_PER_PX);
  });
  const endDrag = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    swallowClick = dragging;
    dragging = false;
    stage.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('click', (e) => {
    if (swallowClick) return void (swallowClick = false);
    const plane = (e.target as Element).closest<HTMLElement>('.st-plane');
    if (plane) select(layerOf(plane), true);
  });
  root.querySelector('.st-turn')?.addEventListener('click', () => {
    setYaw(YAW_PRESETS.find((p) => p > yaw + 0.5) ?? YAW_PRESETS[0]);
    root.classList.add('is-engaged');
  });

  // --- hover preview: brightens the rim only, never moves geometry ---
  const preview = (n: number) => {
    for (const el of [...planes, ...tabs]) el.classList.toggle('is-preview', layerOf(el) === n);
  };
  const previewFrom = (e: Event) => {
    if (dragging) return;
    const hit = (e.target as Element).closest<HTMLElement>('.st-plane, .st-tab');
    preview(hit ? layerOf(hit) : 0);
  };
  for (const zone of [world, rail]) {
    zone.addEventListener('pointerover', previewFrom);
    zone.addEventListener('pointerleave', () => preview(0));
  }
  root.querySelector('.st-stagewrap')?.addEventListener('pointerenter', () => root.classList.add('is-engaged'));
  rail.addEventListener('focusin', () => root.classList.add('is-engaged'));

  // --- ARIA tabs: roving tabindex, automatic activation; up/right climbs the stack ---
  const STEP: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };
  rail.addEventListener('keydown', (e) => {
    let n: number;
    if (e.key in STEP) n = ((active - 1 + STEP[e.key] + count) % count) + 1;
    else if (e.key === 'Home') n = 1;
    else if (e.key === 'End') n = count;
    else return;
    e.preventDefault();
    select(n, true, true);
  });
  tabs.forEach((t) => t.addEventListener('click', () => select(layerOf(t), true)));
  root
    .querySelectorAll<HTMLButtonElement>('.st-break')
    .forEach((b) => b.addEventListener('click', () => inView(b, () => breach(b))));
  const orient = () => rail.setAttribute('aria-orientation', wide.matches ? 'vertical' : 'horizontal');
  wide.addEventListener('change', orient);
  orient();

  // --- scroll build: --build 0..1 from section progress, rAF only while intersecting ---
  function build() {
    if (reduce.matches) return void stage!.style.removeProperty('--build');
    const top = stage!.getBoundingClientRect().top;
    const h = window.innerHeight;
    const p = clamp((h * BUILD_START - top) / (h * BUILD_SPAN), 0, 1);
    stage!.style.setProperty('--build', easeOut(p).toFixed(3));
  }
  let raf = 0;
  const onScroll = () => {
    if (!visible || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      build();
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);

  // --- pause offscreen and on hidden tabs; motion starts when idle after the first sighting ---
  function sync() {
    const run = started && visible && !document.hidden;
    root!.classList.toggle('is-paused', !run);
    if (run !== running) {
      running = run;
      restartPhases();
    }
    if (run) build();
  }
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    // A jump (anchor link, restored scroll) can land before any scroll event: place the stack now.
    if (visible) onScroll();
    if (visible && !started) whenIdle(() => ((started = true), sync()));
    else sync();
  }).observe(stage);
  document.addEventListener('visibilitychange', sync);
  reduce.addEventListener('change', () => (build(), restartPhases()));

  root.classList.add('is-live', 'is-paused');
  select(active, false);
  build();
}
