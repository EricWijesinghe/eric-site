// Eric (round 12): "even my name should enrich like radiation and thunder". With the charge the name radiates (glow
// shells that leave the letters and spread out, on the canvas and as the h1's own text-shadow, so they reach past the
// canvas), thunder crackles across the letters and leaps out of them, and near full charge the letters flicker white
// hot. A release is a thunder strike across the whole name: long bolts end to end and a flash that decays. The h1
// stays real, readable text: the shells sit under the theme's own tight rim, and the light theme keeps deep ink.
// hero-name.ts owns the loop; this module only keeps the storm's state and draws it.

import { bolt, strobe, strokeBolt, type Bolt } from './energy-shock-bolt';
import type { Geo } from './hero-name-geo';
import type { Ink } from './hero-theme';

const SHELLS = 3, SHELL_HZ = 0.9; // glow shells leaving the type, and how many leave per second each
const SHELL_GROW = 0.22, SHADOW_PX = [10, 90] as const; // canvas shells grow to 1.22x; text-shadow shells reach 90 px
const BOLT_RATE = [3, 22] as const; // thunder bolts per second at the first touch and at full charge
const BOLT_LIFE_MS = [160, 320] as const, STRIKE_LIFE_MS = 420, FLASH_TAU_S = 0.35;
const MAX_BOLTS = 36;
const LEAP_PX = [12, 46] as const; // out of the letters, up or down into the canvas margin (hero.css: 56 px)
const HOT_FROM = 0.6; // charge above which the letters flicker white hot (dark theme)
const COLD = 0.005;
const MASS_GROW = 0.6, MASS_EASE_S = 0.4; // the radiance reaches 1.6x as far with all he absorbed: 5 s of hold is not 1.5 s
// light (round 12b): an electric-blue halo twice as wide, and bolts 1.6x wider round an azure core; navy read as a
// blurry dark shadow under the name and as hairline cracks
const LIGHT = { halo: '0 140 255', glow: '0,140,255', core: '11,95,191', r: 2, w: 1.6, air: 0.3 } as const;

interface Live { born: number; life: number; w: number; violet: boolean; b: Bolt }
// mass: what he has absorbed (m2c:absorb, eased toward massT)
export interface Storm { bolts: Live[]; spawn: number; flash: number; flashT0: number; base: string | null; held: boolean; mass: number; massT: number }

export const newStorm = (): Storm => ({ bolts: [], spawn: 0, flash: 0, flashT0: -1e9, base: null, held: true, mass: 0, massT: 0 });

const pt = (geo: Geo): [number, number] => {
  const s = geo.strands[Math.floor(Math.random() * geo.strands.length)];
  const i = Math.floor(Math.random() * s.xs.length);
  return [s.xs[i], s.ys[i]];
};

/** One bolt: across two or more letters, or leaping out of one into the air above or below the name. */
function spawnBolt(geo: Geo, now: number, c: number): Live | null {
  const [ax, ay] = pt(geo), life = BOLT_LIFE_MS[0] + Math.random() * (BOLT_LIFE_MS[1] - BOLT_LIFE_MS[0]);
  if (Math.random() < 0.5) {
    const up = ay < geo.h / 2 ? -1 : 1, len = LEAP_PX[0] + Math.random() * (LEAP_PX[1] - LEAP_PX[0]) * (0.5 + 0.5 * c);
    return { born: now, life, w: 1.3, violet: Math.random() < 0.3, b: bolt(ax, ay, ax + (Math.random() - 0.5) * len * 0.8, ay + up * len, 0.3) };
  }
  for (let t = 0; t < 8; t++) {
    const [bx, by] = pt(geo);
    const d = Math.abs(bx - ax);
    if (d > 40 && d < geo.w * (0.25 + 0.35 * c)) return { born: now, life, w: 1.5, violet: Math.random() < 0.25, b: bolt(ax, ay, bx, by, 0.22) };
  }
  return null;
}

/** The charge's bolts for this frame. */
export function stepStorm(st: Storm, geo: Geo, c: number, dt: number, now: number): void {
  st.flash = Math.exp(-Math.max(0, now - st.flashT0) / 1000 / FLASH_TAU_S);
  st.mass += (st.massT - st.mass) * Math.min(1, dt / MASS_EASE_S);
  st.bolts = st.bolts.filter((b) => now - b.born < b.life);
  if (c < 0.02) st.held = true; // the spent charge has drained: the next hold may thunder again
  if (!st.held || c < 0.02 || geo.strands.length < 2) { st.spawn = 0; return; } // only while he holds
  st.spawn += (BOLT_RATE[0] + (BOLT_RATE[1] - BOLT_RATE[0]) * c * c) * dt;
  while (st.spawn >= 1) {
    st.spawn -= 1;
    const b = st.bolts.length < MAX_BOLTS ? spawnBolt(geo, now, c) : null;
    if (b) st.bolts.push(b);
  }
}

/** The release: a thunder strike end to end across the name, a fan of leaps out of it, and the flash. */
export function strike(st: Storm, geo: Geo, amp: number, now: number): void {
  st.flashT0 = now;
  st.held = false;
  if (geo.strands.length < 2) return;
  let lo = geo.strands[0], hi = lo;
  for (const s of geo.strands) { if (s.cx < lo.cx) lo = s; if (s.cx > hi.cx) hi = s; }
  for (let i = 0; i < 2 + Math.round(2 * amp); i++) {
    const a = Math.floor(Math.random() * lo.xs.length), b = Math.floor(Math.random() * hi.xs.length);
    st.bolts.push({ born: now, life: STRIKE_LIFE_MS * (0.7 + 0.3 * Math.random()), w: 2.4, violet: i === 1, b: bolt(lo.xs[a], lo.ys[a], hi.xs[b], hi.ys[b], 0.14) });
  }
  for (let i = 0; i < 6 + 8 * amp; i++) {
    const l = spawnBolt(geo, now, 1);
    if (l) { l.life = STRIKE_LIFE_MS * 0.6; l.w *= 1.4; st.bolts.push(l); }
  }
}

/** Radiation shells and thunder, on the name's canvas (CSS px transform already set by the caller). */
export function drawStorm(ctx: CanvasRenderingContext2D, geo: Geo, st: Storm, ink: Ink, c: number, time: number, now: number): void {
  const e = Math.max(c, st.flash);
  if (e > COLD) {
    const cx = geo.w / 2, cy = geo.h / 2;
    for (let i = 0; i < SHELLS; i++) {
      // light: the shells stay on the letters (a scaled copy read as a dark offset shadow); the h1's halo spreads instead
      const ph = (time * SHELL_HZ + i / SHELLS) % 1, k = ink.light ? 1 : 1 + ph * SHELL_GROW * (0.6 + 0.4 * e) * (1 + MASS_GROW * st.mass);
      ctx.globalAlpha = Math.min(1, (1 - ph) ** 2 * e * (ink.light ? 0.3 : 0.8));
      ctx.drawImage(geo.glow, cx - (geo.w * k) / 2, cy - (geo.h * k) / 2, geo.w * k, geo.h * k);
    }
    // white hot: near full charge (and in the strike's flash) the plasma fill flares unevenly, frame to frame
    const hot = Math.max(0, (c - HOT_FROM) / (1 - HOT_FROM), st.flash);
    if (hot > 0 && !ink.light) {
      ctx.globalAlpha = Math.min(1, hot * (0.35 + 0.5 * Math.random()));
      ctx.drawImage(geo.inner, 0, 0, geo.w, geo.h);
    }
    ctx.globalAlpha = 1;
  }
  for (const b of st.bolts) {
    const age = (now - b.born) / b.life;
    const a = strobe(age, b.b.seed) * (ink.light ? 0.9 : 1);
    if (ink.light) strokeBolt(ctx, b.b, b.violet ? ink.accent : LIGHT.glow, LIGHT.core, a, b.w * LIGHT.w, LIGHT.air);
    else strokeBolt(ctx, b.b, b.violet ? ink.accent : ink.line, ink.core, a, b.w);
  }
}

/** The h1's own radiance: its theme rim first (on top, so the letters stay crisp), then shells that spread out. */
export function nameShadow(h1: HTMLElement, st: Storm, ink: Ink, c: number, time: number): void {
  const e = Math.max(c, st.flash);
  if (e <= COLD && !st.bolts.length) {
    if (st.base !== null) { h1.style.removeProperty('text-shadow'); delete h1.dataset.hot; st.base = null; }
    return;
  }
  if (st.base === null) { st.base = getComputedStyle(h1).textShadow; h1.dataset.hot = ''; }
  const cols = ink.light ? [LIGHT.halo, '60 120 255', LIGHT.halo] : ['56 225 255', '139 92 246', '191 244 255'];
  const reach = (ink.light ? LIGHT.r : 1) * (1 + MASS_GROW * st.mass);
  const layers = st.base && st.base !== 'none' ? [st.base] : [];
  if (!ink.light && c > HOT_FROM) layers.push(`0 0 3px rgb(255 255 255 / ${((c - HOT_FROM) * 2 * Math.random()).toFixed(2)})`);
  for (let i = 0; i < SHELLS; i++) {
    const ph = (time * SHELL_HZ + i / SHELLS) % 1, r = (SHADOW_PX[0] + ph * (SHADOW_PX[1] - SHADOW_PX[0]) * (0.5 + 0.5 * e)) * reach;
    layers.push(`0 0 ${r.toFixed(0)}px rgb(${cols[i]} / ${((1 - ph) ** 1.5 * e * (ink.light ? 0.55 : 0.85)).toFixed(2)})`);
  }
  if (st.flash > 0.02) {
    const f = st.flash.toFixed(2);
    layers.push(ink.light ? `0 0 48px rgb(${LIGHT.halo} / ${f})` : `0 0 8px rgb(255 255 255 / ${f}), 0 0 36px rgb(56 225 255 / ${f})`);
  }
  h1.style.setProperty('text-shadow', layers.join(', '));
}
