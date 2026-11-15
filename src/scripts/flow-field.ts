// The page's living background: one fixed canvas behind every section (Conduit.astro). Nebula washes
// and depth motes drift, binary and code columns fall at depth (flow-streams.ts), colour walks the spectrum
// as you scroll, a soft light follows the pointer and clicks send ripples. Painting lives in flow-paint.ts
// and flow-streams.ts. The loop pauses while the tab is hidden; reduced
// motion draws one still frame and never animates.
import {
  RIPPLE_LIFE_MS,
  makeMotes,
  mulberry32,
  paintGlow,
  paintNebula,
  paintMotes,
  paintRipples,
  colorAt,
  stepMotes,
  type Mote,
  type Ripple,
} from './flow-paint';
import { makeStreams, paintStreams, type Stream } from './flow-streams';

const SEED = 20261116;
const MAX_DPR = 1.5;
const MAX_STEP_S = 0.05;
// The field is atmosphere, not a cursor: 30 fps is smooth enough and halves the paint cost on phones.
const FRAME_MS = 1000 / 30;
const FRAME_SLACK_MS = 2;
const PHONE_MAX_PX = 720;
const MOTE_AREA_PX = 16000;
const MAX_MOTES = 150;
const PHONE_MAX_MOTES = 60;
// Code and binary columns: one per STREAM_SPACING_PX of width, clamped so wide screens stay light.
const STREAM_SPACING_PX = 90;
const MIN_STREAMS = 8;
const MAX_STREAMS = 20;
const PHONE_STREAMS = 6;
// Spectrum cycles across the whole page, and the colour also drifts slowly in time (cycles per second).
const SCROLL_CYCLES = 2;
const COLOR_DRIFT = 0.012;
const GLOW_RADIUS_PX = 360;
const GLOW_EASE = 0.12;
const POINTER_EASE = 0.2;
const POINTER_IDLE_MS = 2500;
const GLOW_ALPHA = 0.22;
const GLOW_ALPHA_LIGHT = 0.25;
const GLOW_HUE_OFFSET = 0.55;
const MAX_RIPPLES = 6;
const RIPPLE_HUE_STEP = 0.13;

interface Pos {
  x: number;
  y: number;
}

function mount(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let motes: Mote[] = [];
  let streams: Stream[] = [];
  let ripples: Ripple[] = [];
  let pointer: Pos | null = null;
  let glowAt: Pos | null = null;
  let glow = 0;
  let lastMove = -Infinity;
  let t = 0;
  let last = 0;
  let raf = 0;
  let covered = false;
  const hero = document.querySelector<HTMLElement>('.m2c-stage');
  const nav = document.querySelector<HTMLElement>('.nav');

  // The hero stage is opaque and fills the viewport, so the field under it is never seen: stop painting
  // until the stage moves off the screen (its top may sit under the sticky nav).
  const updateCover = (): void => {
    const r = hero?.getBoundingClientRect();
    const navBottom = nav?.getBoundingClientRect().height ?? 0;
    const was = covered;
    covered = !!r && r.top <= navBottom && r.bottom >= window.innerHeight;
    if (was && !covered && !raf && !document.hidden) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  };

  const isLight = (): boolean => {
    const theme = document.documentElement.dataset.theme;
    return theme ? theme === 'light' : window.matchMedia('(prefers-color-scheme: light)').matches;
  };

  const size = (): void => {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const phone = w <= PHONE_MAX_PX;
    const count = Math.min(phone ? PHONE_MAX_MOTES : MAX_MOTES, Math.round((w * h) / MOTE_AREA_PX));
    motes = makeMotes(count, mulberry32(SEED + 1));
    const streamCount = phone ? PHONE_STREAMS : Math.min(MAX_STREAMS, Math.max(MIN_STREAMS, Math.round(w / STREAM_SPACING_PX)));
    streams = makeStreams(streamCount, mulberry32(SEED + 2));
  };

  // The page's scroll position is the colour position: each section lands on a new part of the wheel.
  const scrollShift = (): { scroll: number; shift: number } => {
    const max = Math.max(1, document.documentElement.scrollHeight - h);
    return { scroll: window.scrollY, shift: (window.scrollY / max) * SCROLL_CYCLES };
  };

  const draw = (now: number): void => {
    const light = isLight();
    const { scroll, shift } = scrollShift();
    const colourShift = shift + t * COLOR_DRIFT;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    paintNebula(ctx, w, h, t, scroll, colourShift, light);
    paintMotes(ctx, w, h, scroll, motes, light);
    paintStreams(ctx, w, h, t, scroll, streams, colourShift, light);
    if (glowAt && glow > 0.01) {
      const alpha = glow * (light ? GLOW_ALPHA_LIGHT : GLOW_ALPHA);
      paintGlow(ctx, glowAt.x, glowAt.y, colorAt(colourShift + GLOW_HUE_OFFSET), GLOW_RADIUS_PX, alpha);
    }
    paintRipples(ctx, now, ripples, light);
    ctx.globalCompositeOperation = 'source-over';
  };

  const frame = (now: number): void => {
    raf = 0;
    if (document.hidden || covered) return;
    const elapsed = last ? now - last : FRAME_MS;
    if (elapsed < FRAME_MS - FRAME_SLACK_MS) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = last ? Math.min(MAX_STEP_S, elapsed / 1000) : 0;
    last = now;
    t += dt;
    stepMotes(motes, dt);
    ripples = ripples.filter((rp) => now - rp.t0 < RIPPLE_LIFE_MS);
    const target = pointer && now - lastMove < POINTER_IDLE_MS ? 1 : 0;
    glow += (target - glow) * GLOW_EASE;
    if (pointer) {
      const g = glowAt ?? pointer;
      glowAt = { x: g.x + (pointer.x - g.x) * POINTER_EASE, y: g.y + (pointer.y - g.y) * POINTER_EASE };
    }
    draw(now);
    raf = requestAnimationFrame(frame);
  };

  size();
  if (reduce) {
    // Still frame only: the field is decoration, so it is drawn once and kept at rest.
    draw(performance.now());
    new MutationObserver(() => draw(performance.now())).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    window.addEventListener('resize', () => {
      size();
      draw(performance.now());
    });
    return;
  }

  window.addEventListener(
    'pointermove',
    (e) => {
      pointer = { x: e.clientX, y: e.clientY };
      lastMove = performance.now();
    },
    { passive: true },
  );
  window.addEventListener(
    'pointerdown',
    (e) => {
      const hue = scrollShift().shift + ripples.length * RIPPLE_HUE_STEP;
      ripples = [...ripples, { x: e.clientX, y: e.clientY, t0: performance.now(), hue }].slice(-MAX_RIPPLES);
    },
    { passive: true },
  );
  window.addEventListener(
    'resize',
    () => {
      size();
      updateCover();
    },
    { passive: true },
  );
  window.addEventListener('scroll', updateCover, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !raf && !covered) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  });
  updateCover();
  if (!covered) raf = requestAnimationFrame(frame);
}

const canvas = document.querySelector<HTMLCanvasElement>('canvas.flow-field');
const context = canvas?.getContext('2d');
if (canvas && context) mount(canvas, context);
