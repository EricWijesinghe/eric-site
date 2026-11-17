// Eric (round 12): "I should glow while all other objects get electric shocks". While he charges, short jagged arcs
// crackle along the edges of everything else on screen (the nav, the toggle, the buttons, the copy, the scenery and
// any section in view), more often and brighter as the charge rises; a release discharges every object at once.
// He is never touched: no arc point may fall inside his figure box or the column above his head (hard rule: nothing
// line-like on, around or leaving him), so an arc that would is dropped. One fixed canvas, pointer-events none and
// aria-hidden, made here and styled through the CSSOM (the CSP allows no inline style, and a CSS file would need its
// own import in EnergyOverlay.astro); it runs only while there is charge or a live arc, and reduced motion never mounts it.

import { FACE, type Box } from './energy-orbit';
import { bolt, boltPoints, strobe, strokeBolt, type Bolt } from './energy-shock-bolt';
import { inkNow } from './hero-theme';

// Things with a visible edge only: a container's box (the copy column, the field, a whole section) has none, so its
// arcs crackled on empty page and read as floating on nothing (round 12 review)
const TARGETS = [
  '.nav-inner .logo', '.nav-links a', '.theme-toggle', '.nav-menu',
  '.m2c-eyebrow', '.m2c-roles', '.m2c-bio', '.hero-actions .btn', '.m2c-chain',
  '.section-title', '.site-foot',
].join(', ');
const DPR_CAP = 1.5;
const MAX_ARCS = 70, MAX_BURST = 160; // live arcs while charging, and at a release's discharge
const RATE = [6, 120] as const; // arcs per second at the first touch and at full charge
const LIFE_MS = [260, 520] as const, BURST_LIFE_MS = [380, 720] as const;
const LEN_PX = [50, 190] as const; // along an edge: short sparks at first, long crawling arcs at full charge
const LEAP_P = 0.5, LEAP_PX = [10, 40] as const; // some arcs jump off their edge into the air
// px round his figure box; his head's half-width multiplier for the column above it (1.7 kept the outer nav links dark)
const FIG_PAD = 24, HEAD_PAD = 1.25;
const GATHER_MS = 300; // rects are re-read this often: the page scrolls and the tremor moves things
const MIN_LEVEL = 0.02;
const PALETTE = {
  dark: { glow: ['56,225,255', '139,92,246', '56,225,255'], core: '243,251,255' },
  // light: electric blue round an azure core, 1.6x wider (LIGHT_W): a navy hairline read as a crack in the page
  light: { glow: ['0,140,255', '75,60,255', '0,120,220'], core: '11,95,191' },
} as const;
const LIGHT_W = 1.6, LIGHT_AIR = 0.3; // the wide glow is ink on pearl: at full strength it read as blue smudges
const SPAWN_M = 10; // px
// ?debug: every drawn arc point is checked against his figure box and head column; the test asserts none ever is
const DEBUG = new URLSearchParams(location.search).has('debug');
const dbg = (): Record<string, number> | undefined => (window as unknown as { __m2c?: Record<string, number> }).__m2c;

interface Arc { ax: number; ay: number; bx: number; by: number; lx: number; ly: number; born: number; life: number; hue: number; burst: boolean; b: Bolt; lb: Bolt | null }

const Z = '120'; // above the nav (110), so its links can crackle; below the skip link and dialogs (200+)

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = 'energy-shock';
  c.setAttribute('aria-hidden', 'true');
  for (const [k, v] of [['position', 'fixed'], ['inset', '0'], ['width', '100vw'], ['height', '100vh'], ['z-index', Z], ['pointer-events', 'none']]) c.style.setProperty(k, v);
  document.body.append(c);
  return c;
}

export function mountShock(figure: () => Box | null): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = makeCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const stage = document.querySelector<HTMLElement>('.m2c-stage');
  let rects: DOMRect[] = [], arcs: Arc[] = [], level = 0, held = true, mass = 0, raf = 0, last = 0, spawn = 0, gathered = -1e9, dpr = 1;
  let keep = { x0: 0, y0: 0, x1: 0, y1: 0, hx0: 0, hx1: 0, hy1: 0 }; // his figure box and head column, viewport px

  function size(): void {
    dpr = Math.min(DPR_CAP, devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }
  function gather(now: number): void {
    gathered = now;
    const s = stage?.getBoundingClientRect(), f = figure();
    if (s && f) {
      const x = s.left + f.x, y = s.top + f.y, hx = x + FACE.x * f.w, hr = FACE.rx * f.w * HEAD_PAD;
      keep = { x0: x - FIG_PAD, y0: y - FIG_PAD, x1: x + f.w + FIG_PAD, y1: y + f.h + FIG_PAD, hx0: hx - hr, hx1: hx + hr, hy1: y + (FACE.y + FACE.ry) * f.h };
    }
    rects = [];
    document.querySelectorAll<HTMLElement>(TARGETS).forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width > 4 && b.height > 4 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth) rects.push(b);
    });
  }
  /** On him, or in the column over his head (up to the top of the screen): never drawn there. */
  /** `m` widens the keep-out: a new arc keeps SPAWN_M px more, so his tremor between gathers never carries him onto one. */
  const onHim = (x: number, y: number, m = 0): boolean =>
    (x > keep.x0 - m && x < keep.x1 + m && y > keep.y0 - m && y < keep.y1 + m) || (x > keep.hx0 - m && x < keep.hx1 + m && y < keep.hy1 + m);

  /** An arc crawling along one edge of an object, sometimes leaping off it. */
  function arcOn(r: DOMRect, now: number, burst: boolean): Arc | null {
    const horiz = Math.random() < r.width / (r.width + r.height);
    const span = horiz ? r.width : r.height;
    const len = Math.min(span * 0.7, LEN_PX[0] + (LEN_PX[1] - LEN_PX[0]) * Math.random() * (burst ? 1 : 0.3 + 0.7 * level));
    const t = r[horiz ? 'left' : 'top'] + Math.random() * Math.max(1, span - len);
    const far = Math.random() < 0.5; // which of the two parallel edges
    const e = horiz ? (far ? r.bottom : r.top) : (far ? r.right : r.left), out = far ? 1 : -1;
    const [ax, ay, bx, by] = horiz ? [t, e, t + len, e] : [e, t, e, t + len];
    const leap = Math.random() < LEAP_P ? out * (LEAP_PX[0] + Math.random() * (LEAP_PX[1] - LEAP_PX[0])) : 0;
    const lx = horiz ? 0 : leap, ly = horiz ? leap : 0, mx = (ax + bx) / 2, my = (ay + by) / 2;
    // the channel is built once and kept for the arc's life (real lightning re-strikes down the same path)
    const b = bolt(ax, ay, bx, by, 0.22), lb = lx || ly ? bolt(mx, my, mx + lx, my + ly, 0.35) : null;
    // every point of it, forks included, must stay clear of him
    for (const p of [...boltPoints(b), ...(lb ? boltPoints(lb) : [])]) if (p.xs.some((x, i) => onHim(x, p.ys[i], SPAWN_M))) return null;
    const L = burst ? BURST_LIFE_MS : LIFE_MS;
    return { ax, ay, bx, by, lx, ly, born: now, life: L[0] + Math.random() * (L[1] - L[0]), hue: Math.floor(Math.random() * 3), burst, b, lb };
  }

  function draw(now: number): void {
    const dark = !inkNow().light, P = dark ? PALETTE.dark : PALETTE.light;
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (const a of arcs) {
      const age = (now - a.born) / a.life;
      // stroke, dark gap, re-strike, faint last stroke: the strobe of a real discharge, not random noise
      const alpha = strobe(age, a.b.seed) * (a.burst ? 1 : 0.5 + 0.5 * level);
      const w = (a.burst ? 1.6 : 0.8 + 0.9 * level) * (dark ? 1 : LIGHT_W);
      const air = dark ? 1 : LIGHT_AIR;
      strokeBolt(ctx!, a.b, P.glow[a.hue], P.core, alpha, w, air);
      if (a.lb) strokeBolt(ctx!, a.lb, P.glow[a.hue], P.core, alpha * 0.8, w * 0.7, air);
    }
    const d = DEBUG ? dbg() : undefined;
    if (d) for (const a of arcs) for (const p of [...boltPoints(a.b), ...(a.lb ? boltPoints(a.lb) : [])])
      if (p.xs.some((x, i) => onHim(x, p.ys[i]))) d.shockInHead = (d.shockInHead ?? 0) + 1;
  }
  function push(a: Arc | null): void {
    if (!a) return;
    arcs.push(a);
    const d = DEBUG ? dbg() : undefined;
    if (d) d.shockArcs = (d.shockArcs ?? 0) + 1;
  }

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (now - gathered > GATHER_MS) gather(now);
    arcs = arcs.filter((a) => now - a.born < a.life);
    if (held && level > MIN_LEVEL && rects.length) { // only while he holds: a draining charge after a release is calm
      spawn += (RATE[0] + (RATE[1] - RATE[0]) * level ** 1.4) * (1 + 0.5 * mass) * dt;
      while (spawn >= 1) {
        spawn -= 1;
        push(arcs.length < MAX_ARCS ? arcOn(rects[Math.floor(Math.random() * rects.length)], now, false) : null);
      }
    } else spawn = 0;
    draw(now);
    if (level > MIN_LEVEL || arcs.length) raf = requestAnimationFrame(frame);
    else { ctx!.setTransform(1, 0, 0, 1, 0, 0); ctx!.clearRect(0, 0, canvas.width, canvas.height); raf = 0; }
  }
  const wake = (): void => {
    if (raf || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  size();
  addEventListener('resize', () => { size(); gathered = -1e9; });
  addEventListener('scroll', () => { gathered = -1e9; }, { passive: true });
  addEventListener('m2c:charge', (e) => {
    const l = Number((e as CustomEvent<{ level?: number }>).detail?.level);
    level = Number.isFinite(l) ? Math.max(0, Math.min(1, l)) : 0;
    if (level <= MIN_LEVEL) held = true; // the spent charge has drained: the next hold may shock again
    if (held && level > MIN_LEVEL) wake();
  });
  addEventListener('m2c:absorb', (e) => {
    const k = Number((e as CustomEvent<{ k?: number }>).detail?.k);
    mass = Number.isFinite(k) ? Math.max(0, Math.min(1, k)) : 0;
  });
  addEventListener('m2c:release', (e) => {
    const d = (e as CustomEvent<{ auto?: boolean }>).detail;
    if (d?.auto) return; // the engine's idle pulses are not a person's release: the page stays calm (O5)
    held = false;
    const now = performance.now();
    gather(now);
    // the discharge: every object on screen at once, up to four arcs each
    for (let i = 0; i < 4; i++) for (const r of rects) {
      push(arcs.length < MAX_BURST ? arcOn(r, now, true) : null);
    }
    wake();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
    arcs = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
}
