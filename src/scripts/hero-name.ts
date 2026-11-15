// The energised name. The h1 stays real text (SEO, selection, screen readers). Over it sits an
// aria-hidden canvas that runs current along the glyph outlines. The outlines come from the h1's own
// words, rendered with the same computed font and letter-spacing, so the effect follows the type at any size.
import {
  chargeLevel,
  clamp,
  createLoop,
  onResize,
  prefersReducedMotion,
  releaseStrength,
  type Loop,
} from './hero-loop';
import {
  WAVE_BAND,
  buildGeometry,
  canvasOf,
  pickArc,
  rnd,
  type Arc,
  type Geo,
  type Strand,
} from './hero-name-geo';
import { heroPointer, onPointerChange, type HeroPointer } from './hero-pointer';
import { inkNow, onInkChange, type Ink } from './hero-theme';

// Palette for the current theme; set at the start of each frame and on every rebuild.
let ink: Ink = inkNow();

const WAVE_SECONDS = 1.5; // the release wave's sweep, right to left
const SPOT_RADIUS = 0.2; // pointer light reach, fraction of the name width
const SPOT_ALPHA = 0.7;
const ARC_FOLLOW = 0.6; // share of arcs that gather under the pointer while it is near
const WAVE_LEAD = 1.1; // the wave starts just past the right edge of the name
const CHARGE_EASE = 5; // per second: how fast the glow follows the charge
const PACKETS_IDLE = 6;
const PACKETS_CHARGED = 16;
const ARCS_MAX = 28;
const TRAIL = 56; // points behind a packet head
const SHIMMER_RATE = 0.06; // sweeps per second across the name
const DT_CAP = 0.05; // seconds: a stalled frame never teleports packets
const LIGHT_GLOW = 0.4; // glow strength on pearl, see frameStep
const LIGHT_WAVE_MAX = 0.7; // peak alpha of the release wave on pearl, see frameStep

interface Packet { strand: number; s: number; speed: number }
interface Wave { t0: number; amp: number }
interface NameState {
  target: number;
  c: number;
  wave: Wave | null;
  packets: Packet[];
  arcs: Arc[];
  spawn: number;
  time: number;
  last: number;
  geo: Geo | null;
}

function newPacket(geo: Geo): Packet {
  return { strand: Math.floor(rnd() * geo.strands.length), s: rnd() * 1e4, speed: (140 + rnd() * 120) * geo.dpr };
}

function strokeStrand(ctx: CanvasRenderingContext2D, s: Strand, alpha: number): void {
  const rgb = s.teal ? ink.teal : ink.line;
  ctx.strokeStyle = `rgba(${rgb},${clamp(alpha, 0, 1).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(s.xs[0], s.ys[0]);
  for (let i = 1; i < s.xs.length; i++) ctx.lineTo(s.xs[i], s.ys[i]);
  ctx.stroke();
}

function drawPackets(ctx: CanvasRenderingContext2D, geo: Geo, st: NameState): void {
  for (const p of st.packets) {
    const s = geo.strands[p.strand];
    const n = s.xs.length;
    const head = Math.floor(p.s) % n;
    ctx.strokeStyle = `rgba(${ink.core},${(0.6 + 0.35 * st.c).toFixed(3)})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let k = TRAIL; k >= 0; k--) {
      const i = (head - k + n) % n;
      if (k === TRAIL) ctx.moveTo(s.xs[i], s.ys[i]);
      else ctx.lineTo(s.xs[i], s.ys[i]);
    }
    ctx.stroke();
  }
}

function drawArcs(ctx: CanvasRenderingContext2D, arcs: Arc[], now: number): void {
  for (const arc of arcs) {
    const a = (1 - (now - arc.born) / arc.life) * arc.strength;
    ctx.beginPath();
    ctx.moveTo(arc.xs[0], arc.ys[0]);
    for (let i = 1; i < arc.xs.length; i++) ctx.lineTo(arc.xs[i], arc.ys[i]);
    ctx.strokeStyle = `rgba(${ink.line},${(0.55 * a).toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = `rgba(${ink.core},${a.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

interface Band { centre: number; halfWidth: number; rgb: string; alpha: number }

/** Shimmer band plus the release wave, painted through the glyph mask so light stays on the letters. */
function drawBands(ctx: CanvasRenderingContext2D, geo: Geo, scratch: HTMLCanvasElement, bands: Band[]): void {
  const sctx = scratch.getContext('2d');
  if (!sctx) return;
  const dw = scratch.width;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, dw, scratch.height);
  sctx.globalCompositeOperation = ink.blend;
  for (const band of bands) {
    const x = band.centre * geo.dpr;
    const hw = band.halfWidth * geo.dpr;
    const grad = sctx.createLinearGradient(x - hw, 0, x + hw, 0);
    const edge = `rgba(${band.rgb},0)`;
    grad.addColorStop(0, edge);
    grad.addColorStop(0.5, `rgba(${band.rgb},${clamp(band.alpha, 0, 1).toFixed(3)})`);
    grad.addColorStop(1, edge);
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, dw, scratch.height);
  }
  sctx.globalCompositeOperation = 'destination-in';
  sctx.drawImage(geo.mask, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = ink.blend;
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

function drawStatic(ctx: CanvasRenderingContext2D, geo: Geo): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0);
  ctx.globalCompositeOperation = ink.blend;
  ctx.globalAlpha = 0.5;
  ctx.drawImage(geo.glow, 0, 0, geo.w, geo.h);
  ctx.globalAlpha = 0.35;
  ctx.drawImage(geo.inner, 0, 0, geo.w, geo.h);
  ctx.globalAlpha = 1;
  geo.strands.forEach((s) => strokeStrand(ctx, s, 0.3));
}

/** Light under the pointer, painted through the glyph mask so only the letters brighten. */
function drawSpot(ctx: CanvasRenderingContext2D, geo: Geo, scratch: HTMLCanvasElement, probe: Probe): void {
  if (probe.presence <= 0) return;
  const sctx = scratch.getContext('2d');
  if (!sctx) return;
  const x = probe.x * geo.dpr;
  const y = probe.y * geo.dpr;
  const r = probe.radius * geo.dpr;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, scratch.width, scratch.height);
  sctx.globalCompositeOperation = ink.blend;
  const grad = sctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(${ink.core},${(SPOT_ALPHA * probe.presence).toFixed(3)})`);
  grad.addColorStop(0.5, `rgba(${ink.line},${(SPOT_ALPHA * 0.35 * probe.presence).toFixed(3)})`);
  grad.addColorStop(1, `rgba(${ink.line},0)`);
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, scratch.width, scratch.height);
  sctx.globalCompositeOperation = 'destination-in';
  sctx.drawImage(geo.mask, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = ink.blend;
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

function waveFront(st: NameState, now: number, w: number): { frontX: number; flare: number } | null {
  if (!st.wave) return null;
  const t = (now - st.wave.t0) / 1000 / WAVE_SECONDS;
  if (t >= 1) {
    st.wave = null;
    return null;
  }
  const amp = st.wave.amp * (1 - t * 0.4);
  return { frontX: w * (WAVE_LEAD - (WAVE_LEAD + 0.2) * t), flare: amp };
}

/** The pointer in name-canvas px and its eased presence; presence 0 means no pointer. */
interface Probe { x: number; y: number; presence: number; radius: number }

function frameStep(ctx: CanvasRenderingContext2D, geo: Geo, st: NameState, scratch: HTMLCanvasElement, now: number, probe: Probe): void {
  ink = inkNow();
  const dt = clamp((now - st.last) / 1000, 0, DT_CAP);
  st.last = now;
  st.time += dt;
  st.c += (st.target - st.c) * Math.min(1, dt * CHARGE_EASE);
  const wave = waveFront(st, now, geo.w);
  const flareAt = (x: number): number =>
    wave ? wave.flare * Math.exp(-(((x - wave.frontX) / (geo.w * WAVE_BAND)) ** 2)) : 0;

  const want = Math.round(PACKETS_IDLE + (PACKETS_CHARGED - PACKETS_IDLE) * st.c);
  while (st.packets.length < want && geo.strands.length) st.packets.push(newPacket(geo));
  st.packets.length = Math.min(st.packets.length, want);
  for (const p of st.packets) p.s += p.speed * dt * (1 + 2 * st.c);

  // Near the pointer the current gathers: more arcs, and most of them jump from under the cursor.
  const rate = 2.2 + 9 * st.c + 6 * probe.presence + (wave ? 16 * wave.flare : 0);
  st.spawn += rate * dt;
  while (st.spawn >= 1) {
    st.spawn -= 1;
    const gather = probe.presence > 0 && rnd() < ARC_FOLLOW * probe.presence;
    const arc = pickArc(geo, now, 0.5 + 0.5 * st.c, gather ? probe.x : wave ? wave.frontX : null);
    if (arc && st.arcs.length < ARCS_MAX) st.arcs.push(arc);
  }
  st.arcs = st.arcs.filter((a) => now - a.born < a.life);

  const jitter = st.c > 0.35 ? st.c * 1.4 : 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(geo.dpr, 0, 0, geo.dpr, (rnd() - 0.5) * jitter, (rnd() - 0.5) * jitter);
  ctx.globalCompositeOperation = ink.blend;

  // Light: the glow sits over dark letters, so it is held low to keep the name readable on pearl.
  const lightDamp = ink.light ? LIGHT_GLOW : 1;
  ctx.globalAlpha = clamp((0.3 + 0.5 * st.c + (wave ? 0.5 * wave.flare : 0)) * lightDamp, 0, 1);
  ctx.drawImage(geo.glow, 0, 0, geo.w, geo.h);
  ctx.globalAlpha = clamp((0.12 + 0.18 * st.c) * lightDamp, 0, 1);
  ctx.drawImage(geo.inner, 0, 0, geo.w, geo.h);
  ctx.globalAlpha = 1;

  const shimmerX = geo.w * ((st.time * SHIMMER_RATE) % 1.4 - 0.2);
  // Light: the shimmer is the pale core colour, never the navy stroke, so no dark band crosses the letters.
  const bands: Band[] = [{ centre: shimmerX, halfWidth: geo.w * 0.12, rgb: ink.light ? ink.core : ink.line, alpha: 0.1 + 0.12 * st.c }];
  // Light: the wave tops out at 0.7 so the cyan stays under the navy letters' 4.5:1 contrast floor.
  if (wave) bands.push({ centre: wave.frontX, halfWidth: geo.w * WAVE_BAND, rgb: ink.core, alpha: clamp(wave.flare * 1.4, 0, ink.light ? LIGHT_WAVE_MAX : 1) });
  drawBands(ctx, geo, scratch, bands);
  drawSpot(ctx, geo, scratch, probe);

  for (const s of geo.strands) strokeStrand(ctx, s, 0.34 + 0.3 * st.c + 0.8 * flareAt(s.cx));
  drawPackets(ctx, geo, st);
  drawArcs(ctx, st.arcs, now);
}

/** The energised name: charge raises the current, release sends a white wave right to left. */
export function mountHeroName(h1: HTMLElement, fx: HTMLCanvasElement, stage: HTMLElement): () => void {
  const ctx = fx.getContext('2d');
  if (!ctx) return () => {};
  const reduce = prefersReducedMotion();
  const pointer: HeroPointer = heroPointer(stage);
  const st: NameState = { target: 0, c: 0, wave: null, packets: [], arcs: [], spawn: 0, time: 0, last: performance.now(), geo: null };
  let scratch = canvasOf(1, 1);
  let rebuilding = false;
  /** Pointer in name-canvas px for this frame, from the stage's current position on the page. */
  const probeAt = (geo: Geo): Probe => {
    const r = fx.getBoundingClientRect();
    return {
      x: pointer.x - r.left,
      y: pointer.y - r.top,
      presence: pointer.presence,
      radius: geo.w * SPOT_RADIUS,
    };
  };

  const rebuild = (): void => {
    rebuilding = false;
    ink = inkNow();
    const geo = buildGeometry(h1, fx);
    if (!geo) return;
    st.geo = geo;
    st.packets = [];
    fx.width = Math.round(geo.w * geo.dpr);
    fx.height = Math.round(geo.h * geo.dpr);
    scratch = canvasOf(fx.width, fx.height);
    loop.request();
  };
  const scheduleRebuild = (): void => {
    if (rebuilding) return;
    rebuilding = true;
    requestAnimationFrame(rebuild);
  };

  const loop: Loop = createLoop(fx, (now) => {
    const geo = st.geo;
    if (!geo) return;
    // The field eases the shared pointer; easing it here too would double its speed.
    const probe = probeAt(geo);
    if (reduce) {
      drawStatic(ctx, geo);
      drawSpot(ctx, geo, scratch, probe);
    } else {
      frameStep(ctx, geo, st, scratch, now, probe);
    }
  });

  const onCharge = (e: Event): void => {
    st.target = chargeLevel(e);
    loop.request();
  };
  const onRelease = (e: Event): void => {
    if (reduce) return;
    const amp = releaseStrength(e);
    st.wave = { t0: performance.now(), amp };
    for (let i = 0; i < 5 && st.geo; i++) {
      const arc = pickArc(st.geo, performance.now(), 1, st.geo.w * WAVE_LEAD);
      if (arc && st.arcs.length < ARCS_MAX) st.arcs.push(arc);
    }
    loop.request();
  };
  window.addEventListener('m2c:charge', onCharge);
  window.addEventListener('m2c:release', onRelease);
  const stopResize = onResize(fx, scheduleRebuild);
  const stopPointer = onPointerChange(stage, () => loop.request());
  // The glow colours are baked into the geometry, so a theme change rebuilds it.
  const stopInk = onInkChange(scheduleRebuild);
  if (document.fonts) void document.fonts.ready.then(scheduleRebuild);

  return () => {
    window.removeEventListener('m2c:charge', onCharge);
    window.removeEventListener('m2c:release', onRelease);
    stopResize();
    stopPointer();
    stopInk();
    loop.stop();
  };
}
