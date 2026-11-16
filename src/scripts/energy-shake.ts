// Eric (2026-11-17): "everything around needs to be a little shaky when energizing". While he charges, the page
// around him trembles, harder as the charge rises, and he stays perfectly still: the calm centre is the power.
// The hero's own canvas (.m2c-sing) is never a target. A release settles it at once and leaves one short jolt that
// pushes everything away from him, as hard as the release was strong. The press itself answers at once with one
// short inward breath, and the tremor keeps growing with what he holds ('m2c:absorb' k) after the charge is full.
// Offsets are custom properties (CSSOM, so the CSP holds) that src/styles/energy.css
// turns into a translate. It runs only while there is charge or a jolt; reduced motion never mounts it.
// Measured on the last build: the name, the body text and the nav links jumped up to 5.4 px forty times a second,
// and on a phone the nav jolted twice as far as the copy (the tremor's last step was still on it). So words get a
// smaller tremor than scenery, every offset is capped by its length (not per axis), each new step is blended with
// the last so it reads as a tremor rather than a glitch, and a release clears the tremor before the jolt.

import type { Box } from './energy-orbit';

// Not .flow-field (fixed to the viewport) and not the .nav box (its band is opaque): moving either bared a strip of
// page at the screen edge. The nav's contents move instead; .m2c-field is scaled up a little while it moves (energy.css).
const TEXT = '.m2c-copy, .nav-inner'; // words being read: a tremor you feel, not one that blurs them
const SCENERY = '.m2c-field, .conduit, main > section:not(.m2c-stage), .site-foot';
const ON = 'm2c-shake';
const AMP_LOW = 0.5; // px at the first touch
const AMP = { text: [1.2, 0.8], scenery: [2, 2] } as const; // px added at full charge, then by what he holds (max 2 / 4)
const SMOOTH = 0.5; // each new offset is blended this much with the last
const AMP_CURVE = 1.6; // the tremor stays small for the first half of the charge, then climbs
const STEP_MS = 22, STEP_MASS = 0.3; // a new offset about 45 times a second, up to 30 % more often as he fills
const JOLT_PX = [2, 12] as const, PHONE_W = 600, PHONE_JOLT = 1 / 3; // px at the weakest and strongest release; at most 4 on a phone
const JOLT_S = 0.42, JOLT_TAU_S = 0.09, JOLT_HZ = 2.5; // pushed out, one small swing back, settled in about 0.4 s
const INHALE_PX = 2.5, INHALE_S = 0.1; // the press: everything leans toward him for a tenth of a second
const MIN_LEVEL = 0.02;

interface Item { el: HTMLElement; text: boolean; nx: number; ny: number; dx: number; dy: number }
export interface Shake { jolt(power: number): void }

export function mountShake(figure: () => Box | null): Shake {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { jolt: () => undefined };
  const stage = document.querySelector<HTMLElement>('.m2c-stage');
  let items: Item[] = [];
  let level = 0, mass = 0, armed = true, raf = 0, lastStep = 0, joltT0 = -1, joltPx = 0, inhaleT0 = -1;

  /** Only what is on screen takes part, and each piece learns which way "away from him" is for the jolt. */
  function gather(): void {
    const s = stage?.getBoundingClientRect(), f = figure();
    const hx = s && f ? s.left + f.x + f.w / 2 : innerWidth / 2, hy = s && f ? s.top + f.y + f.h / 2 : innerHeight / 2;
    items = [];
    document.querySelectorAll<HTMLElement>(`${TEXT}, ${SCENERY}`).forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.bottom <= 0 || b.top >= innerHeight || !b.width) return;
      // the visible part's centre: a section below the fold is pushed down, the copy to the left, the nav up
      const cx = (Math.max(0, b.left) + Math.min(innerWidth, b.right)) / 2, cy = (Math.max(0, b.top) + Math.min(innerHeight, b.bottom)) / 2;
      const d = Math.hypot(cx - hx, cy - hy) || 1;
      el.classList.add(ON);
      items.push({ el, text: el.matches(TEXT), nx: 0, ny: 0, dx: (cx - hx) / d, dy: (cy - hy) / d });
    });
  }
  function settle(): void {
    for (const it of items) {
      it.el.classList.remove(ON);
      it.el.style.removeProperty('--shk-x');
      it.el.style.removeProperty('--shk-y');
    }
    items = [];
    raf = 0;
  }

  function frame(now: number): void {
    const on = armed && level > MIN_LEVEL, rise = level ** AMP_CURVE;
    const amp = (a: readonly [number, number]): number => (on ? AMP_LOW + (a[0] - AMP_LOW) * rise + a[1] * mass * level : 0);
    let kick = 0;
    if (inhaleT0 >= 0) {
      const it = (now - inhaleT0) / 1000;
      if (it < INHALE_S) kick -= INHALE_PX * Math.sin((Math.PI * it) / INHALE_S);
      else inhaleT0 = -1;
    }
    if (joltT0 >= 0) {
      const jt = (now - joltT0) / 1000;
      if (jt < JOLT_S) kick = joltPx * Math.exp(-jt / JOLT_TAU_S) * Math.cos(2 * Math.PI * JOLT_HZ * jt);
      else joltT0 = -1;
    }
    if (!on && joltT0 < 0 && inhaleT0 < 0) { settle(); return; }
    const step = now - lastStep >= STEP_MS / (1 + STEP_MASS * mass);
    if (step) lastStep = now;
    for (const it of items) {
      if (step) { // a random offset no longer than the amplitude, blended with the last one
        const a = amp(it.text ? AMP.text : AMP.scenery), ang = Math.random() * 2 * Math.PI, r = a * Math.sqrt(Math.random());
        it.nx += (Math.cos(ang) * r - it.nx) * SMOOTH; it.ny += (Math.sin(ang) * r - it.ny) * SMOOTH;
      }
      it.el.style.setProperty('--shk-x', `${(it.nx + it.dx * kick).toFixed(2)}px`);
      it.el.style.setProperty('--shk-y', `${(it.ny + it.dy * kick).toFixed(2)}px`);
    }
    raf = requestAnimationFrame(frame);
  }
  const wake = (): void => {
    if (raf || document.hidden) return;
    gather();
    raf = requestAnimationFrame(frame);
  };

  addEventListener('m2c:charge', (e) => {
    const was = level;
    level = Math.max(0, Math.min(1, (e as CustomEvent<{ level: number }>).detail.level));
    if (level <= MIN_LEVEL) { armed = true; return; } // the spent charge has drained: the next hold may shake again
    if (!armed) return;
    if (was <= MIN_LEVEL) inhaleT0 = performance.now();
    wake();
  });
  addEventListener('m2c:absorb', (e) => { mass = Math.max(0, Math.min(1, (e as CustomEvent<{ k: number }>).detail.k)); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && raf) { cancelAnimationFrame(raf); settle(); } });

  return {
    jolt(power) {
      armed = level <= MIN_LEVEL; // settles at once: what is left of the charge only drains (a quick tap leaves none)
      for (const it of items) { it.nx = 0; it.ny = 0; }
      const pk = Math.max(0, Math.min(1, (power - 0.35) / 1.65)); // the overlay's power runs 0.35 (a tap) .. 2 (all he can hold)
      joltPx = (JOLT_PX[0] + (JOLT_PX[1] - JOLT_PX[0]) * pk) * (innerWidth < PHONE_W ? PHONE_JOLT : 1);
      joltT0 = performance.now();
      wake();
    },
  };
}
