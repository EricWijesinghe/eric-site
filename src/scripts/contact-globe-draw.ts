// Drawing for the "Work together" globe (state and input live in contact-globe.ts). Every function reads the
// Scene and paints; none of them changes it, so a still frame (reduced motion) is just one call to paint().

import { type V3, type View, norm, occluded, orbitPoint, project, projectView, slerp, toView } from './contact-globe-math';

export type RGB = [number, number, number];
export interface Ink { dot: RGB; rim: RGB; arc: RGB[]; sat: RGB[]; ring: RGB; ping: RGB; light: boolean }
export interface Arc { a: V3; b: V3; t0: number; dur: number; col: number; lift: number }
export interface Ping { p: V3; t0: number; flashed: boolean }
export interface Drop { sat: number; t0: number; x: number; y: number }
export interface Sat { a: number; h: number; speed: number; q: V3; x: number; y: number }
export interface Pt { x: number; y: number }

export interface Scene {
  ctx: CanvasRenderingContext2D;
  w: number; h: number; view: View; t: number; ink: Ink;
  dots: V3[]; seed: Float32Array; intro: number; introT: number; exitX: number;
  arcs: Arc[]; pings: Ping[]; drops: Drop[]; sats: Sat[];
  ring: string; ringR: number; ringPhase: number; satR: number;
  energy: number; focus: number; focusK: number; uplinkK: number;
  ptr: Pt; stations: Pt[]; beamTo: Pt | null; limb: Pt; shock: number;
}

export const FOCUS_NONE = -1;
export const FOCUS_UPLINK = -2;
export const PING_SPEED = 1.6; // rad/s: the wavefront crosses the world in about 2 s
export const DROP_DUR = 1.1;
const BUCKETS = 8;
const LIGHT_DIR = norm([-0.5, -0.55, 0.67]); // upper left, toward the viewer
const RING_ROLL = -0.16; // the ring leans a little, so it never reads as a flat collar
const DIM = 0.25; // what everything else drops to while one station or the uplink is in focus
const TAU = Math.PI * 2;
// A drawn run whose bulge (projected sagitta / chord of what is on screen, not of the whole arc) is under
// SAG_HIDE reads as a dead-straight line and is not drawn; it is fully drawn from SAG_SHOW.
const SAG_HIDE = 0.1;
const SAG_SHOW = 0.14;
const LIMB_OUT = 1.06; // R: an arc has faded out by here
const ARC_A_LIGHT = 0.6; // arcs are 1px; in light they were the heaviest ink in the section
const ARC_A_DARK = 0.75;
export const ARC_TRAIL = 0.75; // share of an arc drawn at once: long enough for its run to visibly bend

export const rgba = (c: RGB, a: number): string => `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0} / ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const ease = (k: number): number => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
const dimOf = (s: Scene): number => 1 - (1 - DIM) * s.focusK;
// Stacked there is no beam (it read as an antenna): the uplink lights the dots and ring glyphs nearest the button.
const linkK = (s: Scene): number => (s.beamTo ? 0 : s.uplinkK);
const LINK_REACH = 0.7; // R around the limb point that faces the button

/** Projected position of a satellite along its orbit (also used for its trail). */
export function satPoint(s: Scene, a: number, h: number): V3 {
  return orbitPoint(a, s.satR, h, s.view.pitch);
}

/** The ring in view space, leaning by RING_ROLL. */
function ringPoint(s: Scene, a: number): V3 {
  const q = orbitPoint(a, s.ringR, 0, s.view.pitch + 0.1);
  const c = Math.cos(RING_ROLL), n = Math.sin(RING_ROLL);
  return [q[0] * c - q[1] * n, q[0] * n + q[1] * c, q[2]];
}

function body(s: Scene): void {
  const { ctx, view: v, ink } = s;
  // Light: a faint ink volume, darker toward the rim, never a white disc. Dark: only the fresnel rim.
  if (ink.light) {
    const g = ctx.createRadialGradient(v.cx - v.r * 0.3, v.cy - v.r * 0.35, v.r * 0.1, v.cx, v.cy, v.r);
    g.addColorStop(0, rgba(ink.dot, 0.015)); g.addColorStop(0.75, rgba(ink.dot, 0.05)); g.addColorStop(1, rgba(ink.dot, 0.11));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(v.cx, v.cy, v.r, 0, TAU); ctx.fill();
  }
  // Light: a crisper, fainter rim; a wide blue glow reads as a blur on the pearl page.
  const glow = (ink.light ? 0.16 + 0.24 * s.energy : 0.3 + 0.4 * s.energy) * dimOf(s) * s.intro;
  // A thin fresnel rim: it peaks right at the silhouette and is gone 4% outside it.
  const g = ctx.createRadialGradient(v.cx, v.cy, v.r * 0.93, v.cx, v.cy, v.r * 1.04);
  g.addColorStop(0, rgba(ink.rim, 0)); g.addColorStop(0.55, rgba(ink.rim, glow * 0.5));
  g.addColorStop(0.64, rgba(ink.rim, glow)); g.addColorStop(1, rgba(ink.rim, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(v.cx, v.cy, v.r * 1.04, 0, TAU); ctx.fill();
}

const xs = new Float32Array(1600), ys = new Float32Array(1600), rs = new Float32Array(1600), bk = new Uint8Array(1600);

function world(s: Scene): void {
  const { ctx, view: v, ink, dots } = s;
  const k = ease(s.intro / 1), dim = dimOf(s), link = linkK(s);
  for (let i = 0; i < dots.length; i++) {
    const q = toView(dots[i], v);
    const lift = 1 + s.seed[i] * 1.8 * (1 - k) * (1 - k); // condensing onto the sphere in the intro
    const x = v.cx + q[0] * v.r * lift, y = v.cy + q[1] * v.r * lift;
    const lit = Math.max(0, q[0] * LIGHT_DIR[0] + q[1] * LIGHT_DIR[1] + q[2] * LIGHT_DIR[2]);
    const near = Math.max(0, 1 - Math.hypot(x - s.ptr.x, y - s.ptr.y) / 70);
    const toCta = link > 0 && q[2] > 0 ? link * Math.max(0, 1 - Math.hypot(x - s.limb.x, y - s.limb.y) / (v.r * LINK_REACH)) : 0;
    let a = q[2] > 0 ? 0.18 + 0.72 * lit + 0.1 * q[2] : 0.04 + 0.08 * (1 + q[2]);
    a = Math.min(1, a + near * 0.8 + toCta * 0.7) * k * Math.max(dim, toCta);
    xs[i] = x; ys[i] = y; rs[i] = (q[2] > 0 ? 1.25 : 0.85) + near * 2 + toCta;
    bk[i] = Math.min(BUCKETS - 1, Math.floor(a * BUCKETS));
  }
  for (let b = 0; b < BUCKETS; b++) {
    ctx.fillStyle = rgba(ink.dot, (b + 0.5) / BUCKETS);
    ctx.beginPath();
    for (let i = 0; i < dots.length; i++) {
      if (bk[i] !== b) continue;
      ctx.moveTo(xs[i] + rs[i], ys[i]); ctx.arc(xs[i], ys[i], rs[i], 0, TAU);
    }
    ctx.fill();
  }
}

const smooth = (a: number, b: number, x: number): number => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
/** 1 on the disc, 0 from LIMB_OUT out: an arc never shows as a tendril beyond the silhouette (rejected 3 times). */
const onDisc = (q: V3): number => 1 - smooth(1, LIMB_OUT, Math.hypot(q[0], q[1]));

/** 0 while a drawn run (canvas points) is a near-straight line, 1 once it visibly bends (SAG_HIDE / SAG_SHOW). */
function bendOf(run: number[]): number {
  const n = run.length / 3;
  if (n < 3) return 0;
  const m = Math.floor(n / 2) * 3, e = run.length - 3;
  const ax = run[0], ay = run[1], bx = run[e], by = run[e + 1], mx = run[m], my = run[m + 1];
  const chord = Math.hypot(bx - ax, by - ay);
  if (chord < 2) return 0;
  const sag = Math.abs((bx - ax) * (my - ay) - (by - ay) * (mx - ax)) / chord;
  return smooth(SAG_HIDE, SAG_SHOW, sag / chord);
}

/** Strokes one visible run, segment by segment where it fades toward the limb (one path where it does not). */
function strokeRun(ctx: CanvasRenderingContext2D, run: number[], col: RGB, a: number): void {
  const bend = bendOf(run);
  if (bend <= 0) return;
  for (let i = 3; i < run.length; i += 3) {
    const f = Math.min(run[i - 1], run[i + 2]);
    if (f <= 0.01) continue;
    ctx.strokeStyle = rgba(col, a * bend * f);
    ctx.beginPath(); ctx.moveTo(run[i - 3], run[i - 2]); ctx.lineTo(run[i], run[i + 1]); ctx.stroke();
  }
}

function arcs(s: Scene): void {
  const { ctx, view: v, ink } = s;
  const dim = dimOf(s), base = (ink.light ? ARC_A_LIGHT : ARC_A_DARK) * dim * s.intro;
  ctx.lineCap = 'round'; ctx.lineWidth = 1;
  for (const arc of s.arcs) {
    const k = (s.t - arc.t0) / arc.dur;
    if (k < 0 || k > 1 + ARC_TRAIL) continue;
    const head = Math.min(1, k), tail = Math.max(0, k - ARC_TRAIL), col = ink.arc[arc.col];
    // x, y, onDisc per sample; a run breaks where the arc passes behind the sphere or off the disc, so the
    // bend is measured on exactly what shows.
    let run: number[] = [];
    for (let t = tail; t <= head + 1e-6; t += 0.03) {
      const q = toView(slerp(arc.a, arc.b, t, arc.lift), v), f = onDisc(q);
      if (occluded(q) || f <= 0.01) { strokeRun(ctx, run, col, base); run = []; continue; }
      run.push(v.cx + q[0] * v.r, v.cy + q[1] * v.r, f);
    }
    strokeRun(ctx, run, col, base);
    if (k <= 1) {
      const q = toView(slerp(arc.a, arc.b, k, arc.lift), v), f = onDisc(q);
      if (!occluded(q) && f > 0.01) {
        ctx.fillStyle = rgba(col, base * f);
        ctx.beginPath(); ctx.arc(v.cx + q[0] * v.r, v.cy + q[1] * v.r, 2.4, 0, TAU); ctx.fill();
      }
    }
  }
}

/** The tap wavefront: a circle on the sphere that swells from the tapped point and refocuses at the antipode. */
function pings(s: Scene): void {
  const { ctx, view: v, ink } = s;
  for (const p of s.pings) {
    const th = (s.t - p.t0) * PING_SPEED;
    if (th < Math.PI) {
      const helper: V3 = Math.abs(p.p[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const u = norm([p.p[1] * helper[2] - p.p[2] * helper[1], p.p[2] * helper[0] - p.p[0] * helper[2], p.p[0] * helper[1] - p.p[1] * helper[0]]);
      const w: V3 = [p.p[1] * u[2] - p.p[2] * u[1], p.p[2] * u[0] - p.p[0] * u[2], p.p[0] * u[1] - p.p[1] * u[0]];
      const c = Math.cos(th), sn = Math.sin(th);
      ctx.strokeStyle = rgba(ink.ping, 0.95 - 0.35 * (th / Math.PI)); ctx.lineWidth = 2;
      ctx.beginPath();
      let pen = false;
      for (let j = 0; j <= 72; j++) {
        const f = (j / 72) * TAU, cf = Math.cos(f) * sn, sf = Math.sin(f) * sn;
        const q = toView([p.p[0] * c + u[0] * cf + w[0] * sf, p.p[1] * c + u[1] * cf + w[1] * sf, p.p[2] * c + u[2] * cf + w[2] * sf], v);
        if (q[2] < 0) { pen = false; continue; }
        const x = v.cx + q[0] * v.r, y = v.cy + q[1] * v.r;
        if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        pen = true;
      }
      ctx.stroke();
    } else {
      const k = (th - Math.PI) / (PING_SPEED * 0.5); // the flash at the antipode lasts half a second
      const [x, y, z] = project([-p.p[0], -p.p[1], -p.p[2]], v);
      if (k < 1 && z > -0.2) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, v.r * 0.35);
        g.addColorStop(0, rgba(ink.ping, 0.9 * (1 - k))); g.addColorStop(1, rgba(ink.ping, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, v.r * 0.35, 0, TAU); ctx.fill();
      }
    }
  }
}

function ringGlyphs(s: Scene): void {
  const { ctx, view: v, ink, ring } = s;
  const n = ring.length, dim = dimOf(s), link = linkK(s);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let j = 0; j < n; j++) {
    if (ring[j] === ' ') continue;
    const q = ringPoint(s, (j / n) * TAU + s.ringPhase);
    if (occluded(q)) continue;
    const depth = (q[2] / s.ringR + 1) / 2; // 0 far .. 1 near
    let [x, y] = projectView(q, v);
    const fly = ease((s.introT - 0.2 - j * 0.012) / 0.9); // the hand-off from the Support tape above
    if (fly < 1) { x = s.exitX + (x - s.exitX) * fly; y = y * fly; }
    const size = 10 + 5 * depth;
    const toCta = link > 0 ? link * Math.max(0, 1 - Math.hypot(x - s.limb.x, y - s.limb.y) / (v.r * LINK_REACH)) : 0;
    ctx.font = `600 ${size.toFixed(1)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillStyle = rgba(ink.ring,Math.min(1, (0.25 + 0.7 * depth) * Math.max(dim, toCta) + toCta * 0.5) * Math.min(1, fly * 1.5));
    ctx.fillText(ring[j], x, y);
  }
}

function bezier(ax: number, ay: number, cx: number, cy: number, bx: number, by: number, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * ax + 2 * u * t * cx + t * t * bx, y: u * u * ay + 2 * u * t * cy + t * t * by };
}

function satellites(s: Scene): void {
  const { ctx, ink } = s;
  s.sats.forEach((sat, i) => {
    const col = ink.sat[i % ink.sat.length];
    const lit = s.focus === i || s.focus === FOCUS_UPLINK ? 1 : dimOf(s);
    const hidden = occluded(sat.q);
    const a = (hidden ? 0.12 : 0.55 + 0.45 * Math.max(0, sat.q[2] / s.satR)) * lit * s.intro;
    // a short trail behind it along the orbit
    ctx.strokeStyle = rgba(col, a * 0.5); ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let k = 0; k <= 10; k++) {
      const q = satPoint(s, sat.a - Math.sign(sat.speed || 1) * k * 0.035, sat.h);
      const [x, y] = projectView(q, s.view);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // a 7px diamond inside a broken reticle
    ctx.fillStyle = rgba(col, a);
    ctx.beginPath(); ctx.moveTo(sat.x, sat.y - 3.5); ctx.lineTo(sat.x + 3.5, sat.y); ctx.lineTo(sat.x, sat.y + 3.5); ctx.lineTo(sat.x - 3.5, sat.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(col, a * 0.8); ctx.lineWidth = 1;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(sat.x, sat.y, 9, k * Math.PI / 2 + 0.25, (k + 1) * Math.PI / 2 - 0.25); ctx.stroke(); }
  });
}

/** Packets dropped from a satellite to its ground station, and the solid tether while a station is in focus. */
function links(s: Scene): void {
  const { ctx, ink } = s;
  for (const d of s.drops) {
    const st = s.stations[d.sat];
    if (!st) continue;
    const k = (s.t - d.t0) / DROP_DUR;
    if (k < 0 || k > 1) continue;
    const col = ink.sat[d.sat % ink.sat.length], cx = d.x + (st.x - d.x) * 0.15, cy = st.y - (st.y - d.y) * 0.2;
    for (let j = 0; j < 4; j++) {
      const p = bezier(d.x, d.y, cx, cy, st.x, st.y, Math.max(0, ease(k) - j * 0.035));
      ctx.fillStyle = rgba(col, (1 - j * 0.24) * dimOf(s) * (k > 0.9 ? (1 - k) * 10 : 1));
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.6 - j * 0.4, 0, TAU); ctx.fill();
    }
  }
  if (s.focus >= 0 && s.sats[s.focus] && s.stations[s.focus]) {
    const sat = s.sats[s.focus], st = s.stations[s.focus], col = ink.sat[s.focus % ink.sat.length];
    const cx = sat.x + (st.x - sat.x) * 0.5 + (st.y - sat.y) * 0.18, cy = sat.y + (st.y - sat.y) * 0.5;
    ctx.strokeStyle = rgba(col, 0.85 * s.focusK); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(sat.x, sat.y); ctx.quadraticCurveTo(cx, cy, st.x, st.y); ctx.stroke();
    ctx.fillStyle = rgba(col, s.focusK);
    for (let j = 0; j < 3; j++) {
      const p = bezier(sat.x, sat.y, cx, cy, st.x, st.y, (s.t * 0.7 + j / 3) % 1);
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, TAU); ctx.fill();
    }
  }
}

/** The uplink: bit packets running on a curved beam from the limb that faces the button to the button. */
function uplink(s: Scene): void {
  if (s.uplinkK < 0.01 || !s.beamTo) return;
  const { ctx, ink, limb } = s;
  // Beside the copy the beam dips under it (never across the words); stacked, it rises straight up to the button.
  const b = s.beamTo, beside = Math.abs(limb.x - b.x) > Math.abs(limb.y - b.y);
  const cx = beside ? (limb.x + b.x) / 2 : limb.x + (b.x - limb.x) * 0.2;
  const cy = beside ? Math.max(limb.y, b.y) + Math.abs(limb.x - b.x) * 0.22 : (limb.y + b.y) / 2;
  ctx.strokeStyle = rgba(ink.ping, 0.5 * s.uplinkK); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(limb.x, limb.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y); ctx.stroke();
  ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let j = 0; j < 8; j++) {
    const k = (s.t * 0.55 + j / 8) % 1, p = bezier(limb.x, limb.y, cx, cy, b.x, b.y, k);
    ctx.fillStyle = rgba(ink.ping, s.uplinkK * Math.sin(Math.PI * k));
    ctx.fillText(s.ring[(j * 7) % s.ring.length] === '1' ? '1' : '0', p.x, p.y);
  }
  const g = ctx.createRadialGradient(limb.x, limb.y, 0, limb.x, limb.y, 26);
  g.addColorStop(0, rgba(ink.ping, 0.7 * s.uplinkK)); g.addColorStop(1, rgba(ink.ping, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(limb.x, limb.y, 26, 0, TAU); ctx.fill();
}

function shock(s: Scene): void {
  if (s.shock < 0) return;
  const k = (s.t - s.shock) / 1.4;
  if (k > 1) return;
  const { ctx, view: v } = s;
  ctx.strokeStyle = rgba(s.ink.rim, 0.9 * (1 - k)); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(v.cx, v.cy, v.r * (1 + k * 0.6), 0, TAU); ctx.stroke();
}

export function paint(s: Scene, dpr: number): void {
  const { ctx } = s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, s.w, s.h);
  ctx.globalCompositeOperation = s.ink.light ? 'source-over' : 'lighter';
  body(s); world(s); arcs(s); pings(s); ringGlyphs(s); links(s); satellites(s); uplink(s); shock(s);
  ctx.globalCompositeOperation = 'source-over';
}
