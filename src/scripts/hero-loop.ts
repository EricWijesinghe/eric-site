// Shared plumbing for the hero's Canvas2D layers (name current, layered field). Each layer runs only
// while its anchor is on screen and the tab is visible, and reduced motion draws one still frame.
// The event payloads are the engine's contract (DESIGN-SIGNAL.md); values are clamped because any
// window listener can receive a malformed CustomEvent.

export const DPR_CAP = 2;
const MAX_LEVEL = 1;
const MAX_K = 2.2;

export interface ChargeDetail { level: number }
export interface ReleaseDetail { k: number; x: number; y: number; auto: boolean }

export const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

export const devicePixelRatioCapped = (): number => clamp(window.devicePixelRatio || 1, 1, DPR_CAP);

export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Reads a charge event as a 0..1 level; anything else is treated as no charge. */
export function chargeLevel(e: Event): number {
  const level = (e as CustomEvent<Partial<ChargeDetail>>).detail?.level;
  return typeof level === 'number' && Number.isFinite(level) ? clamp(level, 0, MAX_LEVEL) : 0;
}

/** Reads a release event as a strength in 0..1 (the engine's k runs up to about 2.8). */
export function releaseStrength(e: Event): number {
  const k = (e as CustomEvent<Partial<ReleaseDetail>>).detail?.k;
  return typeof k === 'number' && Number.isFinite(k) ? clamp(k / MAX_K, 0.3, 1) : 0.6;
}

export interface Loop {
  /** Asks for a frame (one still frame when reduced motion is on). */
  request(): void;
  stop(): void;
}

/**
 * Drives `step(now)` each animation frame while `anchor` is on screen and the document is visible.
 * With reduced motion, `step` runs once per request() and never reschedules itself.
 */
export function createLoop(anchor: Element, step: (now: number) => void): Loop {
  const animate = !prefersReducedMotion();
  let raf = 0;
  let onScreen = false;
  let visible = !document.hidden;

  const frame = (now: number): void => {
    raf = 0;
    step(now);
    if (animate && onScreen && visible) raf = requestAnimationFrame(frame);
  };
  const request = (): void => {
    if (raf || !visible) return;
    if (animate && !onScreen) return;
    raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1]?.isIntersecting ?? false;
    if (onScreen) request();
  });
  const onVisibility = (): void => {
    visible = !document.hidden;
    request();
  };
  io.observe(anchor);
  document.addEventListener('visibilitychange', onVisibility);
  return {
    request,
    stop: (): void => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

/** Calls `fn` when `el` changes size (and once now). Returns the disconnect function. */
export function onResize(el: Element, fn: () => void): () => void {
  const ro = new ResizeObserver(() => fn());
  ro.observe(el);
  fn();
  return () => ro.disconnect();
}
