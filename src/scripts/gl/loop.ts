// Shared render loop for every WebGL canvas on the page. It caps the pixel ratio, sizes the
// renderer to its canvas, and runs only while the canvas is on screen and the tab is visible.
import { WebGLRenderer, type PerspectiveCamera, type Scene } from './three';

const MAX_DPR = 2;

export interface Frame {
  /** Seconds since mount. */
  t: number;
  /** Seconds since the previous frame, clamped so a resumed tab does not jump. */
  dt: number;
}

export interface LoopOptions {
  canvas: HTMLCanvasElement;
  scene: Scene;
  camera: PerspectiveCamera;
  onFrame: (f: Frame) => void;
  onResize?: (width: number, height: number, dpr: number) => void;
}

export interface Loop {
  renderer: WebGLRenderer;
  dispose: () => void;
}

/** Throws when WebGL is unavailable; callers keep their CSS fallback in that case. */
export function startLoop(opts: LoopOptions): Loop {
  const { canvas, scene, camera, onFrame, onResize } = opts;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  renderer.setPixelRatio(dpr);

  let visible = false;
  let raf = 0;
  const t0 = performance.now();
  let last = t0;

  const draw = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    onFrame({ t: (now - t0) / 1000, dt });
    renderer.render(scene, camera);
  };
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    draw(now);
  };
  const shouldRun = (): boolean => visible && !document.hidden;
  const sync = (): void => {
    cancelAnimationFrame(raf);
    raf = 0;
    if (shouldRun()) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };

  const resize = (): void => {
    const w = Math.max(canvas.clientWidth, 1);
    const h = Math.max(canvas.clientHeight, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    onResize?.(w, h, dpr);
    if (!raf) draw(performance.now());
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    sync();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', sync);

  const dispose = (): void => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', sync);
    renderer.dispose();
  };
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    dispose();
    canvas.closest('[data-gl]')?.classList.remove('gl-on');
  });

  resize();
  canvas.closest('[data-gl]')?.classList.add('gl-on');
  return { renderer, dispose };
}

/** Reads a CSS custom property as a three-friendly hex string, so scenes follow the theme. */
export function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ffffff';
}

/** Calls back whenever the light/dark theme changes. */
export function onThemeChange(cb: () => void): void {
  new MutationObserver(cb).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
