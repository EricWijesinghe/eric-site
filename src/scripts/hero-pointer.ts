// Pointer and touch over the hero stage, shared by the energised name and the layered field. Keyboard
// focus on the figure stands in for the pointer, so keyboard users see the same response as mouse users.
import { prefersReducedMotion } from './hero-loop';

const TOUCH_LIFT_MS = 1400; // a touch lets go this long after its last move
const EASE = 6; // per second: how fast presence follows the target
const PRESENCE_EPS = 0.002;
const EVENT = 'm2c:pointer';

export interface HeroPointer {
  /** Client coordinates of the pointer, or the figure's centre while it has keyboard focus. */
  x: number;
  y: number;
  /** 1 while a pointer hovers, drags or the figure has focus; 0 otherwise. */
  target: number;
  /** Eased 0..1 presence the scenes multiply their reaction by. */
  presence: number;
}

const pointers = new WeakMap<HTMLElement, HeroPointer>();

/** Moves presence toward its target. Returns true while it is still moving (the loop must keep running). */
export function easePointer(p: HeroPointer, dt: number): boolean {
  p.presence += (p.target - p.presence) * Math.min(1, dt * EASE);
  if (Math.abs(p.target - p.presence) < PRESENCE_EPS) p.presence = p.target;
  return p.presence !== p.target;
}

/** Subscribes `fn` to pointer changes on `stage`; returns the unsubscribe function. */
export function onPointerChange(stage: HTMLElement, fn: () => void): () => void {
  stage.addEventListener(EVENT, fn);
  return () => stage.removeEventListener(EVENT, fn);
}

/** Shared pointer state for one stage. The first caller wires the listeners; later callers get the same state. */
export function heroPointer(stage: HTMLElement): HeroPointer {
  const known = pointers.get(stage);
  if (known) return known;
  const p: HeroPointer = { x: 0, y: 0, target: 0, presence: 0 };
  pointers.set(stage, p);
  const reduce = prefersReducedMotion();
  let lift = 0;

  const publish = (): void => {
    // Reduced motion has no per-frame easing, so the reaction jumps straight to its target.
    if (reduce) p.presence = p.target;
    stage.dispatchEvent(new Event(EVENT));
  };
  const hold = (x: number, y: number, target: number): void => {
    p.x = x;
    p.y = y;
    p.target = target;
    publish();
  };
  const onPress = (e: PointerEvent): void => {
    window.clearTimeout(lift);
    hold(e.clientX, e.clientY, 1);
    if (e.pointerType !== 'mouse') {
      lift = window.setTimeout(() => hold(p.x, p.y, 0), TOUCH_LIFT_MS);
    }
  };
  const onLeave = (): void => hold(p.x, p.y, 0);
  const onFocusIn = (e: FocusEvent): void => {
    const sing = (e.target as Element | null)?.closest?.('.m2c-sing');
    if (!sing) return;
    const r = sing.getBoundingClientRect();
    hold(r.left + r.width / 2, r.top + r.height / 2, 1);
  };
  const onFocusOut = (e: FocusEvent): void => {
    const next = e.relatedTarget as Element | null;
    if (!next?.closest?.('.m2c-sing')) hold(p.x, p.y, 0);
  };

  stage.addEventListener('pointermove', onPress);
  stage.addEventListener('pointerdown', onPress);
  stage.addEventListener('pointerleave', onLeave);
  stage.addEventListener('focusin', onFocusIn);
  stage.addEventListener('focusout', onFocusOut);
  return p;
}
