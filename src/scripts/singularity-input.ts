// Pointer, touch and keyboard input for the hero. Mouse: hold to charge, release to pulse. Touch: a
// press held CONFIG.pressMs charges, a quick tap pulses, and any drift past the slop is a scroll that
// never fires. Every release gives a short haptic tick unless the visitor asked for reduced motion.
import { CONFIG } from './singularity-config';
import { clamp } from './singularity-math';

export interface Mouse { x: number; y: number; nx: number; ny: number; last: number; on: number }
export interface Input {
  mouse: Mouse; // device px, and -1..1 across the hero
  pressAt: number | null; // performance.now() when charging began
  lastInput: number; // performance.now() of the last pointer or key
}

const TICK_MS = 12;
const TAP_K = 1.0;

/** Wires the hero's input. `fire` receives the pulse strength; the caller decides what a pulse does. */
export function attachInput(root: HTMLElement, fire: (k: number) => void, reduce: boolean, dpr: () => number): Input {
  const inp: Input = { mouse: { x: -1e4, y: -1e4, nx: 0, ny: 0, last: -1e9, on: 0 }, pressAt: null, lastInput: -1e9 };
  let touch: { x0: number; y0: number; timer: number } | null = null; // a touch that may still become a long press
  let mouseDown = false;

  const point = (e: PointerEvent): void => {
    const r = root.getBoundingClientRect(), now = performance.now();
    inp.mouse.x = (e.clientX - r.left) * dpr();
    inp.mouse.y = (e.clientY - r.top) * dpr();
    inp.mouse.nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    inp.mouse.ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    inp.mouse.last = now;
    inp.lastInput = now;
  };

  const tick = (): void => { if (!reduce) navigator.vibrate?.(TICK_MS); };
  const releaseCharge = (): void => {
    const k = 0.6 + 1.6 * chargeOf(inp);
    inp.pressAt = null;
    fire(k);
    tick();
  };
  const cancelTouch = (): void => {
    if (touch) clearTimeout(touch.timer);
    touch = null;
    inp.pressAt = null;
  };

  root.addEventListener('pointermove', (e) => {
    point(e);
    if (touch && Math.hypot(e.clientX - touch.x0, e.clientY - touch.y0) > CONFIG.moveSlopPx) cancelTouch();
  }, { passive: true });
  root.addEventListener('pointerdown', (e) => {
    point(e);
    if (e.pointerType === 'touch') {
      const timer = window.setTimeout(() => { inp.pressAt = performance.now(); }, CONFIG.pressMs);
      touch = { x0: e.clientX, y0: e.clientY, timer };
      return;
    }
    mouseDown = true;
    inp.pressAt = performance.now();
  });
  root.addEventListener('pointerleave', () => {
    if (mouseDown) { mouseDown = false; releaseCharge(); }
  });
  root.addEventListener('pointercancel', (e) => { if (e.pointerType === 'touch') cancelTouch(); });
  addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') {
      if (!touch) return;
      const charged = inp.pressAt !== null;
      clearTimeout(touch.timer);
      touch = null;
      if (charged) { releaseCharge(); return; }
      inp.pressAt = null;
      fire(TAP_K);
      tick();
      return;
    }
    if (mouseDown) { mouseDown = false; releaseCharge(); }
  });
  addEventListener('pointercancel', (e) => {
    if (e.pointerType !== 'touch' && mouseDown) { mouseDown = false; releaseCharge(); }
  });
  root.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    inp.lastInput = performance.now();
    fire(1.2);
  });
  return inp;
}

/** How far a press has charged, 0..1. */
export function chargeOf(inp: Input): number {
  return inp.pressAt === null ? 0 : clamp((performance.now() - inp.pressAt) / CONFIG.chargeMs, 0, 1);
}
