// The page's living background: one fixed canvas behind every section (Conduit.astro). Nebula washes, depth motes and
// columns of falling code (flow-streams.ts) fill the page; the current (flow-river.ts) carries the data his figure
// dissolves into down through every section, pooling in the gaps and ending at the globe. The visitor stirs it (pointer
// wake and lens, tap pulses, scroll warp, flow-stir.ts); Eric's charge and release reach it through the hero's events;
// each section's arrival (reveal.ts 'm2c:arrive') flashes its pool and decrypts its title (flow-cipher.ts).
// 30 fps at rest, 60 while the visitor is active, 12 under the hero, stopped on hidden tabs; reduced motion draws still
// frames only, on scroll, resize and theme.
import { chordPos, layout, onLayout, poolCentre, spineAt, type Layout } from './conduit';
import { spineX } from './conduit-geometry';
import { Cipher } from './flow-cipher';
import { keepNear } from './flow-keep';
import { makeMotes, mulberry32, paintGlow, paintMotes, paintNebula, paintWash, stepMotes, type Mote } from './flow-paint';
import { makePalette, type Palette } from './flow-palette';
import { makeLanes, paintRiver, stepLanes, type Lane } from './flow-river';
import { Stir, POOL_SPEED } from './flow-stir';
import { makeStreams, paintStreams, type Stream } from './flow-streams';
import { whenIdle } from './idle';
import { setRevealOrigin, type ArriveDetail } from './reveal';

const SEED = 20261116;
const MAX_DPR = 1.5;
const MAX_STEP_S = 0.05;
const FPS_REST = 30;
const FPS_ACTIVE = 60;
// Under the hero only the nebula and the rain show (the river starts below the stage). Set to 0 for one still frame.
const FPS_HERO: number = 12;
const FRAME_SLACK_MS = 2;
const ACTIVE_MS = 1500;
const PHONE_MAX_PX = 720;
const MOTE_AREA_PX = 16000;
const MAX_MOTES = 90;
const PHONE_MAX_MOTES = 40;
const STREAM_SPACING_PX = 90;
const MIN_STREAMS = 8;
const MAX_STREAMS = 20;
const PHONE_STREAMS = 5;
const GLOW_RADIUS_PX = 360;
const GLOW_EASE = 0.12;
const GLOW_ALPHA = 0.11;
const GLOW_ALPHA_LIGHT = 0.125;
const WASH_RADIUS_VW = 0.55;
// A unit's trigger this close below its pool is the section's arrival; further down, the wave starts at the river.
const POOL_ORIGIN_PX = 400;
const AUTO_RELEASE = 0.5;
const CHAIN_SURGE = 0.25;
// Shake while he charges (round 10, O5): done inside the canvas so no transform ever lands on main.
const SHAKE_MIN_PX = 0.5;
const SHAKE_SPAN_PX = 2.5;
const SHAKE_CURVE = 1.6;
// Degrade ladder: if a frame's paint keeps costing more than this, drop rain columns, then lanes, then ghost copies.
const BUDGET_MS = 10;
const BUDGET_EASE = 0.05;
const DEGRADE_HOLD_FRAMES = 90;
const MAX_DEGRADE = 3;
const LANE_CUT = 0.6;

setRevealOrigin((id, y) => {
  const pool = poolCentre(id);
  return pool && y - pool.y < POOL_ORIGIN_PX ? pool : layout() ? spineAt(y) : null;
});

function mount(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stir = new Stir();
  const cipher = new Cipher();
  const stage = document.querySelector<HTMLElement>('.m2c-stage');
  let w = 0;
  let h = 0;
  let dpr = 1;
  let motes: Mote[] = [];
  let streams: Stream[] = [];
  let lanes: Lane[] = [];
  let t = 0;
  let last = 0;
  let raf = 0;
  let covered = false;
  let activeUntil = 0;
  let charge = 0;
  let glow = 0;
  let glowAt: { x: number; y: number } | null = null;
  let cost = 0;
  let degrade = 0;
  let sinceDegrade = 0;
  let lastHeight: number | null = null;

  const kick = (): void => {
    if (!raf && !document.hidden) raf = requestAnimationFrame(reduce ? still : frame);
  };
  const pal: Palette = makePalette(canvas, () => kick());

  const size = (): void => {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const phone = w <= PHONE_MAX_PX;
    motes = makeMotes(Math.min(phone ? PHONE_MAX_MOTES : MAX_MOTES, Math.round((w * h) / MOTE_AREA_PX)), mulberry32(SEED + 1));
    const count = phone ? PHONE_STREAMS : Math.min(MAX_STREAMS, Math.max(MIN_STREAMS, Math.round(w / STREAM_SPACING_PX)));
    streams = makeStreams(degrade >= 1 ? Math.ceil(count / 2) : count, mulberry32(SEED + 2));
  };

  const setLanes = (l: Layout): void => {
    const n = degrade >= 2 ? Math.max(3, Math.round(l.lanes * LANE_CUT)) : l.lanes;
    if (lanes.length !== n) lanes = makeLanes(n, mulberry32(SEED + 3));
  };

  // The hero stage fills the viewport: only the nebula and the rain can be seen through its dissolve.
  const updateCover = (): void => {
    const r = stage?.getBoundingClientRect();
    covered = !!r && r.top <= 0 && r.bottom >= window.innerHeight;
  };

  const chordAt = (y: number) => pal.at(chordPos(y));
  const rainHit = { dx: 0, dy: 0, flash: 0, lens: 0 };
  const hitAt = (x: number, y: number) => stir.at(x, y, performance.now(), window.scrollY, rainHit);

  const paintPools = (l: Layout, now: number, scroll: number): void => {
    const r = WASH_RADIUS_VW * w;
    for (const gap of l.gaps) {
      if (gap.y < scroll - r || gap.y > scroll + h + r) continue;
      const c = pal.at(gap.below - 0.5).w;
      paintWash(ctx, spineX(l.spine, gap.y), gap.y - scroll, r, c, stir.poolFlash(gap.y, now, l.source.y), pal.light);
    }
  };

  const draw = (now: number): void => {
    const scroll = window.scrollY;
    const l = layout();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const amp = charge > 0 && !reduce ? SHAKE_MIN_PX + SHAKE_SPAN_PX * charge ** SHAKE_CURVE : 0;
    const jx = amp ? (Math.random() * 2 - 1) * amp : 0;
    const jy = amp ? (Math.random() * 2 - 1) * amp : 0;
    ctx.setTransform(dpr, 0, 0, dpr, jx * dpr, jy * dpr);
    ctx.globalCompositeOperation = pal.light ? 'source-over' : 'lighter';
    const live = stir.busy() ? hitAt : null;
    const keep = l ? keepNear(l.keep, l.disc, scroll, scroll + h) : null;
    paintNebula(ctx, w, h, t, scroll, chordAt, pal.light);
    paintMotes(ctx, w, h, scroll, motes, chordAt, pal.light);
    paintStreams(ctx, w, h, t, scroll, streams, (y) => chordAt(y).a, pal.light, live, keep);
    if (l && keep && !covered) {
      setLanes(l);
      paintPools(l, now, scroll);
      paintRiver(ctx, { l, lanes, t, now, scroll, vh: h, pal, stir, ghosts: degrade < MAX_DEGRADE, keep });
      cipher.paint(ctx, now, scroll, pal);
    }
    if (glowAt && glow > 0.01) {
      paintGlow(ctx, glowAt.x, glowAt.y, chordAt(scroll + glowAt.y).b, GLOW_RADIUS_PX, glow * (pal.light ? GLOW_ALPHA_LIGHT : GLOW_ALPHA));
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  const budget = (ms: number): void => {
    cost += (ms - cost) * BUDGET_EASE;
    sinceDegrade++;
    if (cost > BUDGET_MS && sinceDegrade > DEGRADE_HOLD_FRAMES && degrade < MAX_DEGRADE) {
      degrade++;
      sinceDegrade = 0;
      cost = 0;
      size();
    }
  };

  const frame = (now: number): void => {
    raf = 0;
    if (document.hidden) return;
    const fps = covered ? FPS_HERO : now < activeUntil || stir.busy() || cipher.busy() || charge > 0 ? FPS_ACTIVE : FPS_REST;
    const elapsed = last ? now - last : Infinity;
    if (fps > 0 && elapsed < 1000 / fps - FRAME_SLACK_MS) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = Number.isFinite(elapsed) ? Math.min(MAX_STEP_S, elapsed / 1000) : 0;
    last = now;
    t += dt;
    stepMotes(motes, dt);
    stepLanes(lanes, dt, charge, stir.scrollV, h);
    stir.step(now, document.documentElement.scrollHeight);
    pal.step(now);
    const target = stir.pointer && now < activeUntil ? 1 : 0;
    glow += (target - glow) * GLOW_EASE;
    if (stir.pointer) {
      const g = glowAt ?? stir.pointer;
      glowAt = { x: g.x + (stir.pointer.x - g.x) * GLOW_EASE * 2, y: g.y + (stir.pointer.y - g.y) * GLOW_EASE * 2 };
    }
    const t0 = performance.now();
    draw(now);
    budget(performance.now() - t0);
    if (fps === 0) return;
    raf = requestAnimationFrame(frame);
  };

  // Reduced motion: the phase is frozen and a frame is drawn only when something it shows has changed.
  const still = (now: number): void => {
    raf = 0;
    updateCover();
    pal.step(Infinity);
    draw(now);
  };

  size();
  updateCover();
  onLayout((l) => {
    setLanes(l);
    kick();
  });
  window.addEventListener('resize', () => { size(); updateCover(); kick(); }, { passive: true });
  window.addEventListener('scroll', () => {
    const now = performance.now();
    stir.scrolled(window.scrollY, now);
    activeUntil = now + ACTIVE_MS;
    const was = covered;
    updateCover();
    if (was !== covered) last = 0;
    kick();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    last = 0;
    kick();
  });
  if (reduce) {
    kick();
    return;
  }

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const now = performance.now();
    stir.move(e.clientX, e.clientY, window.scrollY, now, true);
    activeUntil = now + ACTIVE_MS;
    kick();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { stir.pointer = null; });
  window.addEventListener('pointerdown', (e) => {
    stir.pulse(e.clientX, e.clientY + window.scrollY, performance.now());
    kick();
  }, { passive: true });
  window.addEventListener('m2c:charge', (e) => {
    charge = Math.max(0, Math.min(1, (e as CustomEvent<{ level: number }>).detail.level || 0));
    kick();
  });
  window.addEventListener('m2c:release', (e) => {
    const d = (e as CustomEvent<{ k: number; auto: boolean }>).detail;
    charge = 0;
    stir.surge(performance.now(), Math.max(0, (d.k || 0) * (d.auto ? AUTO_RELEASE : 1)));
    kick();
  });
  window.addEventListener('m2c:arrive', (e) => {
    const d = (e as CustomEvent<ArriveDetail>).detail;
    if (!d.major || d.instant) return;
    const now = performance.now();
    const pool = poolCentre(d.id);
    if (pool) {
      stir.flashPool(pool.y, now);
      stir.pulse(pool.x, pool.y, now, POOL_SPEED);
    }
    const title = document.getElementById(d.id)?.querySelector('.section-title');
    if (title) cipher.start(title, now);
    kick();
  });
  // One real new block = one small surge; the poller is the projects lane's, this only listens.
  window.addEventListener('m2c:chain', (e) => {
    const d = (e as CustomEvent<{ height: number | null; live: boolean }>).detail;
    if (d.live && d.height !== null && lastHeight !== null && d.height > lastHeight) stir.surge(performance.now(), CHAIN_SURGE);
    if (d.height !== null) lastHeight = Math.max(lastHeight ?? d.height, d.height);
  });
  kick();
}

const canvas = document.querySelector<HTMLCanvasElement>('canvas.flow-field');
const context = canvas?.getContext('2d');
if (canvas && context) whenIdle(() => mount(canvas, context));
