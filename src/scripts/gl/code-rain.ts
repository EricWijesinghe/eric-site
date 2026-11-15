// Code arriving at the finale: columns of binary and code tokens fall toward the receiver. Canvas 2D,
// not WebGL, so it costs no extra GL context. It draws only while the section is on screen and the tab
// is visible, and holds one still frame under reduced motion. Tokens are decoration, never sentences.
const TOKENS = ['0', '1', '01', '10', '0x9F', 'fn', 'let', '::', '->', '{}', '0xFF', 'impl', '1101'] as const;
const COLUMN_PX = 22;
const ROW_PX = 16;
const ROWS = 9;
const FONT_PX = 12;
const MIN_SPEED = 22;
const SPEED_RANGE = 48;
const MAX_FRAME_S = 0.05;
const DPR_CAP = 2;
const DARK_ALPHA = 0.42;
const LIGHT_ALPHA = 0.3;
const HEAD_BOOST = 1.8;
const RESET_SPAN = 0.4;

interface Column {
  x: number;
  head: number;
  speed: number;
  seed: number;
}

interface Ink {
  head: string;
  tail: string;
  alpha: number;
}

const rand = (span: number): number => Math.random() * span;

function newColumn(x: number, height: number, scatter: boolean): Column {
  return {
    x,
    head: scatter ? rand(height) : -rand(height * RESET_SPAN),
    speed: MIN_SPEED + rand(SPEED_RANGE),
    seed: Math.floor(rand(TOKENS.length)),
  };
}

export function mountCodeRain(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cols: Column[] = [];
  let width = 0;
  let height = 0;
  let ink: Ink = { head: '#bff4ff', tail: '#38e1ff', alpha: DARK_ALPHA };
  let visible = false;
  let raf = 0;
  let last = 0;

  // Re-read on every theme change: the section redefines its tokens for light, so the rain follows.
  const readInk = (): void => {
    const s = getComputedStyle(canvas);
    const light = document.documentElement.dataset.theme === 'light';
    ink = {
      head: s.getPropertyValue('--sig-ice').trim() || ink.head,
      tail: s.getPropertyValue('--sig-cyan').trim() || ink.tail,
      alpha: light ? LIGHT_ALPHA : DARK_ALPHA,
    };
  };

  const draw = (): void => {
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${FONT_PX}px ui-monospace, Consolas, monospace`;
    ctx.textBaseline = 'top';
    for (const c of cols) {
      const top = Math.floor(c.head / ROW_PX);
      for (let k = 0; k < ROWS; k++) {
        const row = top - k;
        const y = row * ROW_PX;
        if (y < -ROW_PX || y > height) continue;
        const idx = ((c.seed + row) % TOKENS.length + TOKENS.length) % TOKENS.length;
        ctx.globalAlpha = k === 0 ? Math.min(1, ink.alpha * HEAD_BOOST) : ink.alpha * (1 - k / ROWS);
        ctx.fillStyle = k === 0 ? ink.head : ink.tail;
        ctx.fillText(TOKENS[idx] ?? '0', c.x, y);
      }
    }
    ctx.globalAlpha = 1;
  };

  const advance = (dt: number): void => {
    for (const c of cols) {
      c.head += c.speed * dt;
      if (c.head - ROWS * ROW_PX > height) Object.assign(c, newColumn(c.x, height, false));
    }
  };

  const tick = (now: number): void => {
    const dt = Math.min((now - last) / 1000, MAX_FRAME_S);
    last = now;
    advance(dt);
    draw();
    raf = requestAnimationFrame(tick);
  };

  const shouldRun = (): boolean => visible && !document.hidden && !reduce;
  const sync = (): void => {
    cancelAnimationFrame(raf);
    raf = 0;
    if (!shouldRun()) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Array.from({ length: Math.ceil(width / COLUMN_PX) }, (_, i) => newColumn(i * COLUMN_PX, height, true));
    readInk();
    draw();
  };

  resize();
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    sync();
  }).observe(canvas);
  document.addEventListener('visibilitychange', sync);
  new MutationObserver(() => {
    readInk();
    draw();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
