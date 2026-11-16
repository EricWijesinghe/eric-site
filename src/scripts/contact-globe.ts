// "Work together": the signal globe. A dotted world turns beside the copy, arcs of light jump between places,
// the name Maya2C circles it as a fixed ring of ASCII bits, and one satellite per contact link serves that
// link's icon below (its ground station). Pointing at a station parks its satellite above it on a tether;
// pointing at the button turns the satellites to the limb that faces it and opens an uplink beam. A tap (or
// Enter on the globe button) sends an emerald wavefront round the world. Eric (round 9) wanted a cool
// graphic here, not an explanation, so nothing is labelled.
// One Canvas2D over the whole section, no WebGL; theme inks come from CSS tokens on the canvas and are
// lerped on the theme switch. Pauses offscreen and in hidden tabs; reduced motion paints still frames.

import { type V3, angle, checkInverse, fib, fromView, norm, projectView, unproject } from './contact-globe-math';
import {
  type Ink, type RGB, type Scene, ARC_TRAIL, DROP_DUR, FOCUS_NONE, FOCUS_UPLINK, PING_SPEED, paint, satPoint,
} from './contact-globe-draw';

export interface GlobeParts { hit: HTMLButtonElement; cta: HTMLElement; stations: HTMLElement[]; ring: string }

const DOTS_WIDE = 1400;
const DOTS_PHONE = 900;
const PHONE_MAX = 899; // px: below this the layout stacks (finale-contact.css)
const SPIN = 0.12; // rad/s at rest
const TILT = 0.38; // the resting pitch the mouse drag springs back to
const ARCS_MIN = 7;
const ARCS_MAX = 21;
const ARCS_PHONE = 2; // below PHONE_MAX: more read as tendrils on a small ball
const ARC_MIN_RAD = 1.6;
const ARC_MAX_RAD = 2.4;
const ENERGY_TAU = 1.3; // s: spin energy calms in about 4 s (three time constants)
const MAX_PINGS = 4;
const MAX_DPR = 1.5;
const MAX_PIXELS = 2_000_000; // backing-store cap for a section-wide canvas
const INK_MS = 350;
const RX_MS = 600;
const TAP_SLOP = 6; // px of travel before a press counts as a drag, not a tap
const RING_WIDE = 1.32;
const RING_PHONE = 1.16;
const RING_TIGHT = 0.894; // the uplink tightens 1.32 R to 1.18 R
const SAT_WIDE = 1.42;
const SAT_PHONE = 1.3;
const SAT_HEIGHTS = [-0.18, 0.12, 0.36];
const INTRO_UPLINK = [1.7, 4.2]; // s after the intro starts: the uplink plays once where there is no hover

const toRgb = (v: string): RGB => {
  const h = v.trim().replace('#', '');
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
};
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const approach = (v: number, to: number, rate: number): number => v + (to - v) * Math.min(1, rate);
const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** The ring text: each byte of the name as 8 ASCII bits, a gap between bytes, so it decodes to the name. */
export function ringBits(name: string): string {
  return [...new TextEncoder().encode(name)].map((b) => b.toString(2).padStart(8, '0')).join(' ') + ' ';
}

function readInk(el: Element, light: boolean): Ink {
  const cs = getComputedStyle(el), v = (n: string): RGB => toRgb(cs.getPropertyValue(n));
  return {
    dot: v('--gl-dot'), rim: v('--gl-rim'), ring: v('--gl-ring'), ping: v('--gl-ping'), light,
    arc: [v('--gl-arc-1'), v('--gl-arc-2'), v('--gl-arc-3'), v('--gl-arc-4')],
    sat: [v('--gl-sat-1'), v('--gl-sat-2'), v('--gl-sat-3')],
  };
}
const lerpInk = (a: Ink, b: Ink, k: number): Ink => ({
  dot: mix(a.dot, b.dot, k), rim: mix(a.rim, b.rim, k), ring: mix(a.ring, b.ring, k), ping: mix(a.ping, b.ping, k),
  arc: a.arc.map((c, i) => mix(c, b.arc[i], k)), sat: a.sat.map((c, i) => mix(c, b.sat[i], k)), light: b.light,
});

export function mountGlobe(canvas: HTMLCanvasElement, parts: GlobeParts): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || !checkInverse()) return;
  const { hit, cta, stations } = parts;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const html = document.documentElement;
  const isLight = (): boolean => html.dataset.theme === 'light';
  const points = { wide: fib(DOTS_WIDE), phone: [] as V3[] };
  const seedOf = (n: number): Float32Array => Float32Array.from({ length: n }, () => Math.random());

  let ink = readInk(canvas, isLight()), inkFrom = ink, inkTo = ink, inkT0 = -1;
  const s: Scene = {
    ctx, w: 0, h: 0, view: { cx: 0, cy: 0, r: 1, yaw: 0.6, pitch: TILT }, t: 0, ink,
    dots: points.wide, seed: seedOf(DOTS_WIDE), intro: reduce ? 1 : 0, introT: reduce ? 99 : 0, exitX: 0,
    arcs: [], pings: [], drops: [], ring: ringBits(parts.ring), ringR: RING_WIDE, ringPhase: 0, satR: SAT_WIDE,
    sats: stations.map((_, i) => ({ a: (i * Math.PI * 2) / stations.length, h: SAT_HEIGHTS[i % SAT_HEIGHTS.length], speed: 0.32 + i * 0.07, q: [0, 0, 0], x: 0, y: 0 })),
    energy: 0, focus: FOCUS_NONE, focusK: 0, uplinkK: 0,
    ptr: { x: -1e4, y: -1e4 }, stations: stations.map(() => ({ x: 0, y: 0 })), beamTo: null, limb: { x: 0, y: 0 }, shock: -1,
  };
  let dpr = 1, phone = false, vel = SPIN, last = 0, raf = 0, visible = false, started = false, linked = false;
  let introUplink = coarse && !reduce;
  const drag = { on: false, x: 0, y: 0, x0: 0, y0: 0, moved: false, mouse: false };

  function size(): void {
    s.w = canvas.clientWidth; s.h = canvas.clientHeight;
    phone = s.w <= PHONE_MAX;
    dpr = Math.min(devicePixelRatio || 1, MAX_DPR, Math.sqrt(MAX_PIXELS / Math.max(1, s.w * s.h)));
    canvas.width = Math.round(s.w * dpr); canvas.height = Math.round(s.h * dpr);
    if (phone && !points.phone.length) points.phone = fib(DOTS_PHONE);
    const dots = phone ? points.phone : points.wide;
    if (dots !== s.dots) { s.dots = dots; s.seed = seedOf(dots.length); }
    s.satR = phone ? SAT_PHONE : SAT_WIDE;
    if (phone) s.arcs = s.arcs.slice(0, ARCS_PHONE);
    s.ring = ringBits(parts.ring).repeat(phone ? 1 : 2); // the wide ring is long enough to carry the name twice
  }

  /** Where the DOM puts things this frame, in canvas coordinates (the section shakes as one, so offsets hold). */
  function measure(): void {
    const c = canvas.getBoundingClientRect(), g = hit.getBoundingClientRect(), b = cta.getBoundingClientRect();
    s.view.cx = g.left - c.left + g.width / 2; s.view.cy = g.top - c.top + g.height / 2; s.view.r = g.width / 2;
    stations.forEach((el, i) => {
      const r = (el.querySelector('.icon') ?? el).getBoundingClientRect();
      s.stations[i].x = r.left - c.left + r.width / 2; s.stations[i].y = r.top - c.top + r.height / 2;
    });
    const beside = b.right < g.left;
    // Stacked, the button sits straight above the pole and a beam reads as an antenna on a ball (rejected three
    // times): there is no beam, the satellites gather on the upper-left limb toward the button's lower corner
    // (never on the pole), the dots and ring glyphs there light up, the ring tightens and the button rim pulses.
    const to = beside ? { x: b.right - c.left + 6, y: b.top - c.top + b.height / 2 } : { x: b.left - c.left + 8, y: b.bottom - c.top + 6 };
    s.beamTo = beside ? to : null;
    const dx = to.x - s.view.cx, dy = to.y - s.view.cy, d = Math.hypot(dx, dy) || 1;
    s.limb = { x: s.view.cx + (dx / d) * s.view.r, y: s.view.cy + (dy / d) * s.view.r };
    const tape = [...document.querySelectorAll('[data-tape]')].map((el) => el.getBoundingClientRect()).find((r) => r.width > 0);
    s.exitX = tape && tape.width ? tape.right - c.left - 40 : s.w * 0.85;
  }

  const limbWorld = (): V3 => fromView(norm([(s.limb.x - s.view.cx) / s.view.r, (s.limb.y - s.view.cy) / s.view.r, 0.08]), s.view);
  function newArc(from?: V3): void {
    // Phones keep two arcs at most; a ping's antipode arcs replace the oldest instead of adding to them.
    if (phone && s.arcs.length >= ARCS_PHONE) { if (!from) return; s.arcs.shift(); }
    const dots = s.dots, pick = (): V3 => dots[Math.floor(Math.random() * dots.length)];
    const a = from ?? pick();
    // Only beside the copy do arcs gather on the limb facing the button; stacked, a bundle aimed at one limb
    // point read as antennae (rejected three times), so the uplink lights the dots there instead (draw linkK).
    const aim = s.focus === FOCUS_UPLINK && s.beamTo !== null;
    let b = aim ? limbWorld() : pick();
    // Endpoints far enough apart that the drawn ARC_TRAIL window visibly bends (draw SAG_HIDE), no chords through.
    for (let k = 0; k < 24 && !aim; k++) { const d = angle(a, b); if (d > ARC_MIN_RAD && d < ARC_MAX_RAD) break; b = pick(); }
    const d = angle(a, b);
    s.arcs.push({ a, b, t0: s.t + (from ? 0 : Math.random() * 1.2), dur: 1.4 + d * 0.6, col: s.arcs.length % 4, lift: 0.05 + 0.07 * (d / ARC_MAX_RAD) });
  }
  for (let i = 0; i < ARCS_MIN; i++) newArc();

  const pulse = (el: Element, cls: string): void => { el.classList.add(cls); setTimeout(() => el.classList.remove(cls), RX_MS); };

  /** The angle on a satellite's orbit whose screen position is closest to (x, y), on the near side when asked. */
  function aimAngle(h: number, x: number, y: number, nearOnly: boolean): number {
    let best = 0, bestD = Infinity;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2, q = satPoint(s, a, h);
      if (nearOnly && q[2] < 0.15) continue;
      const [px, py] = projectView(q, s.view), d = Math.hypot(px - x, py - y);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  function stepSats(dt: number): void {
    s.sats.forEach((sat, i) => {
      const before = wrapAngle(sat.a - Math.PI / 2);
      if (s.focus === i) {
        const st = s.stations[i];
        sat.a += wrapAngle(aimAngle(sat.h, st.x, s.view.cy + s.view.r * 0.75, true) - sat.a) * Math.min(1, dt * 4);
      } else if (s.focus === FOCUS_UPLINK) {
        const off = (i - (s.sats.length - 1) / 2) * 0.32;
        const out = { x: s.limb.x + (s.limb.x - s.view.cx) * 0.4, y: s.limb.y + (s.limb.y - s.view.cy) * 0.4 };
        sat.a += wrapAngle(aimAngle(sat.h, out.x, out.y, false) + off - sat.a) * Math.min(1, dt * 3);
      } else sat.a += sat.speed * dt * (1 + s.energy);
      const after = wrapAngle(sat.a - Math.PI / 2);
      // A near-side pass (the orbit's closest point) drops one packet to the station.
      if (s.focus === FOCUS_NONE && before < 0 && after >= 0 && s.intro >= 1) s.drops.push({ sat: i, t0: s.t, x: sat.x, y: sat.y });
      sat.q = satPoint(s, sat.a, sat.h);
      [sat.x, sat.y] = projectView(sat.q, s.view);
    });
  }

  function step(dt: number): void {
    s.t += dt;
    if (started) s.introT += dt;
    s.intro = Math.min(1, s.introT / 0.9);
    if (introUplink && s.introT > INTRO_UPLINK[0] && s.focus === FOCUS_NONE) s.focus = FOCUS_UPLINK;
    if (introUplink && s.introT > INTRO_UPLINK[1]) { introUplink = false; if (s.focus === FOCUS_UPLINK) s.focus = FOCUS_NONE; }
    if (!drag.on) { vel = approach(vel, SPIN, dt * 1.5); s.view.yaw += vel * dt; s.view.pitch = approach(s.view.pitch, TILT, dt * 3); }
    s.energy *= Math.exp(-dt / ENERGY_TAU);
    s.ringPhase += dt * (0.22 + 0.6 * s.energy);
    const base = phone ? RING_PHONE : RING_WIDE;
    s.ringR = approach(s.ringR, s.focus === FOCUS_UPLINK ? base * RING_TIGHT : base, dt * 5);
    s.focusK = approach(s.focusK, s.focus >= 0 ? 1 : 0, dt * 6);
    s.uplinkK = approach(s.uplinkK, s.focus === FOCUS_UPLINK ? 1 : 0, dt * 4);
    if ((s.uplinkK > 0.5) !== linked) {
      linked = !linked; cta.classList.toggle('is-linked', linked);
      if (linked && !s.beamTo) pulse(cta, 'is-rx'); // stacked: the rim pulse stands in for the beam
    }
    stepSats(dt);
    s.drops = s.drops.filter((d) => {
      if (s.t - d.t0 < DROP_DUR) return true;
      if (stations[d.sat]) pulse(stations[d.sat], 'is-rx');
      return false;
    });
    s.pings = s.pings.filter((p) => {
      const th = (s.t - p.t0) * PING_SPEED;
      if (th >= Math.PI && !p.flashed) {
        p.flashed = true;
        for (let k = 0; k < 3; k++) newArc([-p.p[0], -p.p[1], -p.p[2]]);
        pulse(cta, 'is-rx');
      }
      return th < Math.PI + PING_SPEED * 0.5;
    });
    const live = ARCS_MIN + Math.round((ARCS_MAX - ARCS_MIN) * s.energy);
    s.arcs = s.arcs.filter((a) => (s.t - a.t0) / a.dur <= 1 + ARC_TRAIL);
    while (s.arcs.length < (phone ? Math.min(live, ARCS_PHONE) : live)) newArc();
    if (inkT0 >= 0) {
      const k = Math.min(1, (performance.now() - inkT0) / INK_MS);
      ink = lerpInk(inkFrom, inkTo, k); if (k >= 1) inkT0 = -1;
    }
    s.ink = ink;
  }

  /** Reduced motion: one still frame, arcs mid-flight, highlights switched straight to their end state. */
  function still(): void {
    measure();
    s.focusK = s.focus >= 0 ? 1 : 0; s.uplinkK = s.focus === FOCUS_UPLINK ? 1 : 0;
    const base = phone ? RING_PHONE : RING_WIDE;
    s.ringR = s.focus === FOCUS_UPLINK ? base * RING_TIGHT : base;
    cta.classList.toggle('is-linked', s.focus === FOCUS_UPLINK);
    s.arcs.forEach((a) => { a.t0 = s.t - a.dur * 0.6; });
    s.drops = [];
    stepSats(0);
    paint(s, dpr);
  }

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    measure(); step(dt); paint(s, dpr);
    raf = visible && !document.hidden ? requestAnimationFrame(frame) : 0;
    if (!raf) last = 0;
  }
  const wake = (): void => {
    if (reduce) { if (visible) still(); return; }
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  };

  // ---------- input ----------
  const local = (e: PointerEvent): void => { const c = canvas.getBoundingClientRect(); s.ptr.x = e.clientX - c.left; s.ptr.y = e.clientY - c.top; };
  hit.addEventListener('pointerdown', (e) => {
    Object.assign(drag, { on: true, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, mouse: e.pointerType === 'mouse' });
    hit.setPointerCapture(e.pointerId);
  });
  hit.addEventListener('pointermove', (e) => {
    local(e);
    if (drag.on) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > TAP_SLOP) drag.moved = true;
      s.view.yaw += dx / s.view.r; vel = approach(vel, (dx / s.view.r) * 60, 0.5);
      if (drag.mouse) s.view.pitch = Math.max(-0.3, Math.min(1.1, s.view.pitch + dy / s.view.r)); // touch stays yaw-only
    }
    if (reduce) still();
  });
  const up = (): void => { if (drag.on) s.energy = Math.max(s.energy, Math.min(1, Math.abs(vel) / 6)); drag.on = false; };
  hit.addEventListener('pointerup', up);
  hit.addEventListener('pointercancel', up);
  hit.addEventListener('pointerleave', () => { s.ptr.x = s.ptr.y = -1e4; if (reduce) still(); });
  hit.addEventListener('click', (e) => {
    if (drag.moved) { drag.moved = false; return; }
    const c = canvas.getBoundingClientRect();
    const p = e.detail === 0 ? null : unproject(e.clientX - c.left, e.clientY - c.top, s.view);
    const at = p ?? fromView([0, -0.2, Math.sqrt(1 - 0.04)], s.view); // keyboard: the point facing the viewer
    if (s.pings.length >= MAX_PINGS) s.pings.shift();
    s.pings.push({ p: at, t0: s.t, flashed: false });
    if (reduce) { s.t += Math.PI / PING_SPEED + 0.1; pulse(cta, 'is-rx'); still(); }
    wake();
  });
  hit.addEventListener('keydown', (e) => {
    const turn = { ArrowLeft: -0.22, ArrowRight: 0.22 }[e.key], tip = { ArrowUp: -0.12, ArrowDown: 0.12 }[e.key];
    if (turn === undefined && tip === undefined) return;
    e.preventDefault();
    if (turn) { s.view.yaw += turn; vel = turn * 6; }
    if (tip) s.view.pitch = Math.max(-0.3, Math.min(1.1, s.view.pitch + tip));
    if (reduce) still();
  });

  const focusOn = (el: HTMLElement, f: number): void => {
    const on = (): void => { s.focus = f; introUplink = false; if (reduce) still(); };
    const off = (): void => { if (s.focus === f) s.focus = FOCUS_NONE; if (reduce) still(); };
    el.addEventListener('pointerenter', on); el.addEventListener('focusin', on);
    el.addEventListener('pointerleave', off); el.addEventListener('focusout', off);
  };
  stations.forEach((el, i) => focusOn(el, i));
  focusOn(cta, FOCUS_UPLINK);

  // ---------- lifecycle ----------
  size();
  new ResizeObserver(() => { size(); if (reduce || !raf) { measure(); paint(s, dpr); } }).observe(canvas);
  new IntersectionObserver((es) => {
    visible = es[es.length - 1].isIntersecting;
    if (visible) started = true;
    wake();
  }).observe(canvas);
  document.addEventListener('visibilitychange', wake);
  new MutationObserver(() => {
    inkFrom = ink; inkTo = readInk(canvas, isLight());
    if (reduce) { ink = s.ink = inkTo; still(); return; }
    inkT0 = performance.now();
    if (!raf) { ink = s.ink = inkTo; measure(); paint(s, dpr); }
  }).observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  addEventListener('m2c:release', () => {
    s.shock = s.t;
    s.arcs.forEach((a, i) => { a.t0 = s.t + i * 0.08; });
    wake();
  });
}
