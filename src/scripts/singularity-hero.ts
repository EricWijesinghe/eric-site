// "Singularity": Eric's binary hologram at the centre of a GPU-simulated disk of bits, inside a world network
// of compute nodes that spans the whole canvas, with quantum computing behind him. Idle, the network's traffic
// flows out from him. Hold to charge: the field leans in and the traffic gathers into him. Release: a shock
// leaves his whole body as a spherical shock of binary and code (its glyphs come out through the outline of his
// shoulders and arms), and the network relays the energy across the canvas. He glows brighter with what the page's
// energy overlay reports he absorbed (m2c:absorb). Nothing line-like ever touches or leaves him (Eric rounds 1-3).
// Ported from design/eric-quantum-forge/v11 (approved 2026-11-15); the network, release and governor are the
// Signal redesign's. The engine computes on the CPU and draws in singularity-render.ts.
// URL: ?t=9 jump · ?still freeze · ?debug frame time, tier and release counters · reduced motion shows a still frame.
import { glKit, load, type Target } from './singularity-gl';
import { ASSETS, CONFIG, FIG, FIG_BOTTOM, NET, PHONE_BLOOM, PHONE_DPR_CAP, PHONE_EXPOSURE, QUANTUM_DENSITY, RELAY } from './singularity-config';
import { ABSORB_GAIN, CHARGE_GAIN, FLASH_DECAY, FLASH_RING, FULL_K, GLITCH_QUIET_S, HIT_FALL, HIT_HOLD_S, SHOCK_FAST, TAP_GAIN, WAVE_LIFE_S, WAVE_REACH_FULL, WAVE_REACH_TAP, WAVE_SPEED } from './singularity-config';
import { clamp, mix, rng, smooth, type Pt } from './singularity-math';
import { prepareFigure, type Figure } from './singularity-figure';
import { createResources, type Res } from './singularity-resources';
import { WorldNet, type NetCam } from './singularity-net';
import { attachInput, chargeOf } from './singularity-input';
import { Governor, pickTier, readRenderer, watchBattery } from './singularity-govern';
import { Ink } from './singularity-ink';
import { Quantum } from './singularity-quantum';
import { DataField } from './singularity-glyphs';
import { HeadZone, headKeep } from './singularity-zone';
import { Tremor } from './singularity-tremor';
import { renderFrame, stepDisk, type Shot } from './singularity-render';
import { copyGains, faceGain } from './singularity-mask';
import { ORBIT } from './energy-orbit';
import type { Gain } from './singularity-ink';

export interface SingularityDebug {
  frames: number; fired: number; anchorHaloMax: number;
  headZoneHits: number; // always 0: no ribbon point is emitted in the head zone or his silhouette (singularity-zone.ts)
  zoneColumn: number[]; // the head zone's column in device px: left, right, floor
  releaseGlyphs: number; // glyph particles spawned by releases so far (singularity-glyphs.ts)
  burstOffBody: number; // always 0: release glyphs that started off his body or inside his head's halo (Eric round 10)
  shockInZone: number; // always 0: the most the release shock drew on his head or the column above it (HEAD_KEEP)
  lensInZone: number; // always 0: the most the cursor lens drew while pressed, or with the pointer on his head (FS_BG)
  absorb: number; // 0..1, eased: what he has absorbed of the page's energy (m2c:absorb)
  glyphs: number; // glyph particles drawn this frame
  tier: string; p90: number; dpr: number; light: boolean;
  shockInHead: number; shockArcs: number; // the page's shocks (energy-shock.ts): arc points ever on him (always 0), arcs spawned
}
// g: how much of the full flash it earns; a: what he had absorbed when it left (0..1), which lengthens and speeds it
interface Pulse { t: number; k: number; g: number; a: number; applied: boolean; auto: boolean }
interface Layout { s: number; U: number; fo: Pt }

const RIB_FIG_W = 1150; // the width the figure is scaled to on narrow canvases (v11's tuning)
const FIG_H_LAND = 0.87; // default share of the canvas height his figure fills
const FIG_H_STACKED = 0.55;
// his chest, figure px: where idle traffic leaves him and a release starts. It is the centre the page-wide orbit
// circles (energy-orbit.ts), so his shock and the overlay's horizon share one chest; 600 sat on his chin.
const HUB_X = ORBIT.cx * FIG.w, HUB_Y = ORBIT.cy * FIG.h;
const MOUSE_IDLE_MS = 3000;
const SCROLL_PULL = 0.14; // scrolled away, the camera backs off by this much
const SCROLL_TILT = 0.35; // and tilts this much
const SCROLL_THROTTLE = 0.5; // past this, frames are throttled: the stage is mostly off screen
const CHARGE_DECAY = 2.5; // per second, after release
const SIM_MAX_DT = 1 / 30;
const PRE_ROLL_FPS = 60;
const PRE_ROLL_MAX = 900;
const PULSE_KEEP_S = 3;
const DISK_SMALL = 0.45; // phones draw less of the disk
const SMALL_PX = 700;
const SEED = { fig: 7, net: 9, disk: 11, quantum: 17, glyph: 23 };
const MIN_FRAME_MS = 1000 / CONFIG.fpsIdle - 2;
const SHOCK_SPEED = 0.7; // canvas heights per second the shock shell travels
const SHOCK_LIFE = 2.6; // seconds it is drawn
const SHOCK_W = 200; // CSS px across its front: a wide pressure front, never a bright limb (a limb read as a halo over his head)
const SHOCK_FALL = 1.0; // per second: how fast its strength drains
const SOLID_ALPHA = 128; // figure alpha (0..255) that counts as his body
const ABSORB_EASE = 5; // per second: his glow follows what he absorbed without popping (m2c:absorb, Eric round 10)
const ABSORB_FOCUS = 0.6; // at full absorb this share of the bloom is gone: the charge's haze condenses into him and his face clears
const BLOOM_IDLE = 0.55; // bloom at rest, as a share of full: the idle bloom read as a dust smudge on his shoulder
// sample points (head radii from the head's centre) where ?debug checks the shock is cut: centre, crown, ears, the column
const ZONE_PROBES: Pt[] = [[0, 0], [0, -1], [-1.1, 0], [1.1, 0], [0, -3], [0.9, -2]];

/** The page's theme: the toggle sets data-theme; without it, the system preference decides. */
const isLight = (): boolean => {
  const theme = document.documentElement.dataset.theme;
  return theme ? theme === 'light' : matchMedia('(prefers-color-scheme: light)').matches;
};

const num = (cs: CSSStyleDeclaration, name: string, fallback: number): number => {
  const v = parseFloat(cs.getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
};

/** Mounts the hero inside `root`. Rejects (and leaves the CSS fallback showing) without WebGL2. */
export async function mountSingularity(root: HTMLElement): Promise<void> {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const msEl = root.querySelector<HTMLElement>('[data-ms]');
  const qs = new URLSearchParams(location.search);
  const debugOn = qs.has('debug');
  if (debugOn) root.classList.add('m2c-debug');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fail = () => root.classList.add('m2c-nogl');

  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) { fail(); return; }
  canvas.addEventListener('webglcontextlost', fail);
  const K = glKit(gl, !!gl.getExtension('EXT_color_buffer_float'));
  const gov = new Governor(pickTier({
    renderer: readRenderer(gl), cores: navigator.hardwareConcurrency || 4,
    memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  }));
  let lowBattery = false;
  watchBattery((low) => { lowBattery = low; });

  try {
    // fonts.ready alone would not wait: nothing in the DOM asks for the mono face before the glyph atlas does.
    const mono = document.fonts?.load('700 46px "JetBrains Mono"').catch(() => []);
    const [figImg, auxImg, trImg] = await Promise.all([load(ASSETS.fig), load(ASSETS.aux), load(ASSETS.trace), mono]);
    run(gl, figImg, auxImg, trImg);
  } catch (e) {
    fail();
    throw e;
  }

  function run(gl: WebGL2RenderingContext, figImg: HTMLImageElement, auxImg: HTMLImageElement, trImg: HTMLImageElement): void {
    const fig: Figure = prepareFigure(figImg, trImg, SEED.fig);
    const small = Math.min(innerWidth, innerHeight) < SMALL_PX;
    const bitsFor = (): number => Math.round(CONFIG.particles * gov.bitShare * gov.workScale * (small ? DISK_SMALL : 1));
    let activeN = bitsFor();
    const res: Res = createResources(gl, K, { fig: figImg, aux: auxImg, trace: trImg }, fig.halo, fig.aura, fig.vapour, CONFIG.particles, rng(SEED.disk));
    const net = new WorldNet(SEED.net);
    const dbg: SingularityDebug = { frames: 0, fired: 0, anchorHaloMax: 0, headZoneHits: 0, zoneColumn: [], releaseGlyphs: 0, burstOffBody: 0, shockInZone: 0, lensInZone: 0, shockInHead: 0, shockArcs: 0, absorb: 0, glyphs: 0, tier: gov.tier, p90: 0, dpr: 1, light: false };
    if (debugOn) (window as unknown as { __m2c: SingularityDebug }).__m2c = dbg;
    const makeQuantum = (): Quantum => new Quantum(SEED.quantum, QUANTUM_DENSITY[gov.tier]);
    let quantum = makeQuantum();

    /* ---- geometry: the canvas, the figure's layout, and the camera (which backs off when scrolled away) ---- */
    let W = 2, H = 2, DPR = 1;
    let lay: Layout = { s: 1, U: 1, fo: [0, 0] };
    let camFo: Pt = [0, 0], camS = 1, camU = 1;
    let dc: Pt = [0, 0], tilt = 0.3, headC: Pt = [0, 0];
    let scene: Target | null = null;
    let chain: Target[] = [];
    function layout(): void {
      DPR = Math.min(devicePixelRatio || 1, small ? PHONE_DPR_CAP : gov.dprCap);
      const r = root.getBoundingClientRect();
      // m2c:layout is reported relative to the stage (the engine root's parent), as the hero copy expects.
      const stage = (root.parentElement ?? root).getBoundingClientRect();
      const ox = r.left - stage.left, oy = r.top - stage.top;
      W = Math.max(2, Math.round(r.width * DPR)); H = Math.max(2, Math.round(r.height * DPR));
      if (canvas.width !== W) canvas.width = W; // assigning clears the drawing buffer
      if (canvas.height !== H) canvas.height = H;
      const land = W / H > 1, cs = getComputedStyle(root);
      const fx = num(cs, '--fig-x', 0.5), fh = num(cs, '--fig-h', land ? FIG_H_LAND : FIG_H_STACKED);
      const s = Math.min((fh * H) / FIG.h, (W * 1.02) / RIB_FIG_W);
      const U = land ? H * 0.82 : Math.min(H * 0.7, W * 0.92);
      const bottom = land ? FIG_BOTTOM.land : FIG_BOTTOM.stacked;
      lay = { s, U, fo: [W * fx - FIG.axisX * s, H * bottom - FIG.h * s] };
      [scene, ...chain].forEach((o) => { if (o) { gl.deleteTexture(o.t); gl.deleteFramebuffer(o.f); } });
      scene = K.target(W, H);
      chain = [];
      let w = W, h = H;
      for (let i = 0; i < 5; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); chain.push(K.target(w, h)); }
      window.dispatchEvent(new CustomEvent('m2c:layout', {
        detail: {
          fig: { x: lay.fo[0] / DPR + ox, y: lay.fo[1] / DPR + oy, w: (FIG.w * s) / DPR, h: (FIG.h * s) / DPR },
          // the disk's centre and scale (CSS px, stage-relative): the page-wide energy (energy-overlay.ts) gathers here
          disc: { x: (lay.fo[0] + FIG.axisX * s) / DPR + ox, y: (lay.fo[1] + FIG.discY * s) / DPR + oy, u: U / DPR },
        },
      }));
      // his head box (CSS px, stage-relative): hero.css keeps the stage's code field (.m2c-field) off his face
      const hd = fig.halo.head, st = root.parentElement ?? root;
      st.style.setProperty('--m2c-face-x', `${((lay.fo[0] + ((hd.x0 + hd.x1) / 2) * s) / DPR + ox).toFixed(1)}px`);
      st.style.setProperty('--m2c-face-y', `${((lay.fo[1] + ((hd.y0 + hd.y1) / 2) * s) / DPR + oy).toFixed(1)}px`);
      st.style.setProperty('--m2c-face-rx', `${(((hd.x1 - hd.x0) / 2) * s / DPR).toFixed(1)}px`);
      st.style.setProperty('--m2c-face-ry', `${(((hd.y1 - hd.y0) / 2) * s / DPR).toFixed(1)}px`);
    }
    const figToScreen = (x: number, y: number): Pt => [camFo[0] + x * camS, camFo[1] + y * camS];
    const netCam = (t: number): NetCam => ({ W, H, dc, hub: figToScreen(HUB_X, HUB_Y), rot: t * NET.spin, charge, dpr: DPR });
    const zone = new HeadZone(fig.halo.at, fig.halo.head, fig.alphaAt);
    const ink = new Ink(res.ribData, res.dotData, zone, res.glyphData);
    const field = new DataField(SEED.glyph);
    const gains: Gain[] = [];
    ink.gains = gains; // refilled each emitting frame: the copy blocks move with the page, the face with him

    /* ---- input and pulses ---- */
    let simT = 0, lastInputSim = -1e9, charge = 0, hover = 0, glitch = 0, nextGlitch = 5, lastCharge = 0;
    let light = isLight(); // the theme toggle flips this live (see the observer below the frame loop)
    let age = 99, pk = 0, flash = 0, surge = 0, boot = 0, hit = 0, absorbShown = 0;
    let shockT0 = -1e9, shockK = 0, shockFast = 1; // the release's shock: when it began, and how strong (its flash gain applied)
    const tremor = new Tremor(reduce);
    let shake: Pt = [0, 0];
    const hb0 = fig.halo.head;
    const headU: [number, number, number, number] = [(hb0.x0 + hb0.x1) / 2, (hb0.y0 + hb0.y1) / 2, (hb0.x1 - hb0.x0) / 2, (hb0.y1 - hb0.y0) / 2];
    // what he has absorbed of the page's energy (energy-overlay.ts reports it), and the eased value his glow follows
    let absorbTo = 0, absorb = 0;
    window.addEventListener('m2c:absorb', (e) => { absorbTo = clamp(Number((e as CustomEvent<{ k?: number }>).detail?.k) || 0, 0, 1); });
    let nextAuto: number = CONFIG.firstPulse;
    const pulses: Pulse[] = [];
    const fire = (k: number): void => {
      const a = clamp(absorb, 0, 1); // read before the overlay's release resets it
      pulses.push({ t: simT, k, g: TAP_GAIN + CHARGE_GAIN * smooth(FULL_K[0], FULL_K[1], k) + ABSORB_GAIN * a, a, applied: false, auto: false });
      lastInputSim = simT;
      dbg.fired++;
    };
    const inp = attachInput(root, fire, reduce, () => DPR);
    const schedule = (t: number): void => {
      if (t < nextAuto) return;
      if (t - lastInputSim > 4) pulses.push({ t: nextAuto, k: 1.0, g: 1, a: 0, applied: false, auto: true });
      nextAuto += CONFIG.autoPulse;
    };
    /** A release: a spherical burst of data leaves his whole body, and the network relays the energy to every edge. */
    const release = (p: Pulse, t: number, emit: boolean): void => {
      const hub = figToScreen(HUB_X, HUB_Y);
      const nodes = net.launchNodes(hub, RELAY.count);
      const dist = nodes.map((i) => Math.hypot(net.sx[i] - hub[0], net.sy[i] - hub[1]));
      const arrive = dist.map((d) => clamp((d / H) * RELAY.growPerH, RELAY.growMin, RELAY.growMax));
      net.strike(nodes.map((node, j) => ({ node, t: t + arrive[j] })));
      field.burst(t, hub, H, p.k, fig.sites, (x, y) => {
        if (debugOn && (fig.alphaAt(x, y) < SOLID_ALPHA || fig.halo.at(x, y) > 0)) dbg.burstOffBody++; // checked against the figure itself, not the site list
        return figToScreen(x, y);
      });
      dbg.releaseGlyphs = field.spawned;
      shockT0 = t; shockK = Math.min(p.k, 1.6) * p.g; shockFast = 1 + SHOCK_FAST * p.a;
      if (!p.auto) tremor.jolt(t, shockK); // only a person's release jolts the page: idle must stay still (O5)
      if (!emit) return;
      const r = root.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent('m2c:release', { detail: { k: p.k, x: r.left + hub[0] / DPR, y: r.top + hub[1] / DPR, auto: p.auto } }));
    };
    const applyPulses = (t: number, emit: boolean): number => {
      let k = 0;
      for (const p of pulses) if (!p.applied && t >= p.t) { p.applied = true; k += p.k; release(p, t, emit); }
      while (pulses.length && t - pulses[0].t > PULSE_KEEP_S) pulses.shift();
      return k;
    };
    const reportCharge = (): void => {
      if (charge === lastCharge) return;
      lastCharge = charge;
      document.documentElement.style.setProperty('--m2c-charge', charge.toFixed(3));
      window.dispatchEvent(new CustomEvent('m2c:charge', { detail: { level: charge } }));
    };
    const scrollAway = (): number => {
      const r = root.getBoundingClientRect();
      return r.height > 0 ? clamp(-r.top / (r.height * 0.8), 0, 1) : 0;
    };

    /* ---- one simulation step: CPU state for the frame, the disk physics, the network, the quantum layer and the arcs ---- */
    let cur = 0;
    function update(t: number, dt: number, emit: boolean, away: number): Shot {
      const m = inp.mouse, T = CONFIG.build;
      const mActive = performance.now() - m.last < MOUSE_IDLE_MS ? 1 : 0;
      m.on += (mActive - m.on) * 0.08;
      charge = inp.pressAt !== null ? chargeOf(inp) : Math.max(0, charge - dt * CHARGE_DECAY);
      absorb += (absorbTo - absorb) * (1 - Math.exp(-dt * ABSORB_EASE));
      if (emit) reportCharge();
      schedule(t);

      // camera: parallax; scrolled away, it backs off and tilts. The charge tremor (singularity-tremor.ts) moves every
      // layer behind him and never him: he stays steady, the calm centre (Eric round 10, O5)
      shake = tremor.at(t, charge, DPR);
      const par: Pt = [-m.nx * 0.012 * W * m.on, -m.ny * 0.008 * H * m.on];
      const pull = 1 - SCROLL_PULL * away;
      camFo = [W / 2 + (lay.fo[0] - W / 2) * pull + par[0], H / 2 + (lay.fo[1] - H / 2) * pull + par[1]];
      camS = lay.s * pull; camU = lay.U * pull;
      zone.place(camFo, camS);
      dc = figToScreen(FIG.axisX, FIG.discY);
      dc[0] += par[0] * 0.8; dc[1] += par[1] * 0.8;
      tilt = 0.3 + m.ny * 0.07 * m.on + SCROLL_TILT * away;
      headC = figToScreen(FIG.headC[0], FIG.headC[1]);
      const md: Pt = [(m.x - dc[0]) / camU, (m.y - dc[1]) / (camU * Math.sin(tilt))];
      const front = mix(-60, 1260, smooth(T[0], T[1], t));
      // the hover lenses rest while he is pressed, charged or flashing: pressing his face must not repaint it
      const pressed = inp.pressAt !== null || charge > 0 || flash > 0.02;
      hover = pressed ? 0 : hover + ((mActive && t > T[1] ? 1 : 0) - hover) * 0.15;
      // no glitch in the light theme (its bars drew dark stripes across him there) or just after a release
      if (!still && t > nextGlitch && !light && age > GLITCH_QUIET_S) { glitch = 1; nextGlitch = t + 4 + Math.random() * 6; }
      glitch = Math.max(0, glitch - dt * 5);
      boot = smooth(0, 0.8, t);

      // the network projects first, so a release strikes the nodes where they are this frame
      const nc = netCam(t);
      net.project(nc);
      const pulseK = applyPulses(t, emit);
      const last = pulses.length ? pulses[pulses.length - 1] : null;
      age = last ? t - last.t : 99;
      pk = last ? last.k : 0;
      flash = age < 2 ? Math.exp(-age * (FLASH_DECAY - FLASH_RING * (last?.a ?? 0))) * Math.min(pk, 1.6) * (last?.g ?? 1) : 0;
      surge = Math.max(flash, charge * 0.7);
      // the release's hit, and what he shows of his absorbed energy: at a person's release his glow holds for a moment
      // and then eases, so the release never makes him dimmer than the hold (O6)
      const env = last && !last.auto ? (age < HIT_HOLD_S ? 1 : Math.exp(-(age - HIT_HOLD_S) * HIT_FALL)) : 0;
      hit = env * (last?.g ?? 0);
      absorbShown = Math.max(absorb, (last?.a ?? 0) * env);
      if (dt > 0 || !emit) { stepDisk(gl, res, cur, activeN, { dt, t, charge, pulseK, md, mOn: m.on * (inp.pressAt !== null ? 0 : 1) }); cur = 1 - cur; }
      net.step(t, dt, nc);

      ink.reset();
      field.step(t, dt);
      let ribBack = 0;
      if (emit) {
        copyGains(root, DPR, gains);
        const v = WAVE_SPEED * DPR * (1 + SHOCK_FAST * (last?.a ?? 0)), h = figToScreen(HUB_X, HUB_Y);
        ink.dpr = DPR;
        ink.wave = last && !last.auto && age < WAVE_LIFE_S
          ? { x: h[0], y: h[1], r: age * v, v, g: last.g, reach: mix(WAVE_REACH_TAP, WAVE_REACH_FULL, last.g) * DPR }
          : null;
        gains.push(faceGain(fig.halo.head, camFo, camS));
        // behind him: the network and the quantum layer
        net.paint(t, nc, ink);
        quantum.draw({ t, ink, dpr: DPR, charge, map: (a) => figToScreen(a[0], a[1]) });
        field.paint(t, { W, H, U: camU, hub: figToScreen(HUB_X, HUB_Y), charge, dpr: DPR }, ink);
        ribBack = ink.count;
        // nothing is drawn in front of him: no line or glyph may start on his figure (Eric rounds 1-3)
      }
      dbg.headZoneHits = ink.zoneHits;
      dbg.glyphs = ink.glyphs;
      dbg.dpr = DPR; dbg.light = light; dbg.absorb = absorb;
      if (debugOn) {
        dbg.zoneColumn = zone.column().map(Math.round);
        // the cursor lens's strength as FS_BG computes it, counted when the pointer is pressed or on his head
        const fx = (m.x - camFo[0]) / camS, fy = (m.y - camFo[1]) / camS, hb = fig.halo.head;
        const onHead = Math.hypot((fx - (hb.x0 + hb.x1) / 2) / ((hb.x1 - hb.x0) / 2), (fy - (hb.y0 + hb.y1) / 2) / ((hb.y1 - hb.y0) / 2)) < 1;
        if (pressed || onHead) dbg.lensInZone = Math.max(dbg.lensInZone, m.on * hover * headKeep(hb, fx, fy));
      }
      return shotFor(t, away, front, ribBack);
    }

    function shotFor(t: number, away: number, front: number, ribBack: number): Shot {
      const a = t - shockT0, live = a >= 0 && a < SHOCK_LIFE;
      const hub = figToScreen(HUB_X, HUB_Y);
      const shockR = (0.1 * camU + a * H * SHOCK_SPEED * shockFast);
      const shockA = live ? Math.exp(-a * SHOCK_FALL) * shockK * 0.9 : 0;
      if (debugOn && shockA > 0) {
        const hb = fig.halo.head, cx = (hb.x0 + hb.x1) / 2, cy = (hb.y0 + hb.y1) / 2, rx = (hb.x1 - hb.x0) / 2, ry = (hb.y1 - hb.y0) / 2;
        for (const [qx, qy] of ZONE_PROBES) dbg.shockInZone = Math.max(dbg.shockInZone, shockA * headKeep(hb, cx + qx * rx, cy + qy * ry));
      }
      const drive = light ? 0 : 1;
      const rest = CONFIG.bloom * BLOOM_IDLE * (1 - 0.85 * away) * (small ? PHONE_BLOOM : 1);
      return {
        W, H, DPR, t, fo: camFo, s: camS, U: camU, dc, tilt, headC,
        mouse: { x: inp.mouse.x, y: inp.mouse.y, on: inp.mouse.on * hover }, // the cursor lens rests with the hover lens
        charge, flash, boot, surge, hover, glitch, front,
        // light theme: bloom stays at its idle level; charge and absorb show as colour there, a white haze washed his face out (Eric round 8)
        bloomK: (rest / BLOOM_IDLE) * (BLOOM_IDLE + (1 + 0.5 - BLOOM_IDLE) * charge * drive) * (1 - ABSORB_FOCUS * absorb * drive), bloomRest: rest,
        shock: [hub[0], hub[1], shockR, shockA], shockW: SHOCK_W * DPR, shake, head: headU,
        ribN: ink.count, ribBack, dotN: ink.dots, glyphN: ink.glyphs, haloRect: fig.halo.rect, auraRect: fig.aura.rect, absorb: absorbShown, hit, column: zone.column(), N: activeN,
        light: light ? 1 : 0, expo: small ? PHONE_EXPOSURE : 1,
      };
    }

    /* ---- the governor: probe, then steer the resolution and the bit count ---- */
    function governorTick(ms: number, now: number): void {
      if (gov.probe(ms)) { activeN = bitsFor(); quantum = makeQuantum(); layout(); }
      if (gov.sample(ms, now)) activeN = bitsFor();
      dbg.tier = gov.tier;
      dbg.p90 = Math.round(gov.p90);
    }

    /* ---- timeline: ?t= jumps, ?still freezes, and a pre-roll settles the disk before the first frame ---- */
    let t0 = performance.now();
    const still = qs.has('still') || reduce;
    const tq = qs.has('t') ? parseFloat(qs.get('t') ?? '') : NaN;
    let tFixed: number | null = Number.isFinite(tq) ? tq : reduce ? 9 : null;
    if (tFixed !== null && !still) { t0 -= tFixed * 1000; tFixed = null; }
    layout();
    {
      const target = tFixed !== null ? tFixed : (performance.now() - t0) / 1000;
      const n = Math.min(Math.round(target * PRE_ROLL_FPS), PRE_ROLL_MAX);
      for (let i = 0; i < n; i++) { const t = i / PRE_ROLL_FPS; update(t, 1 / PRE_ROLL_FPS, false, 0); simT = t; }
    }
    let lastT = simT;

    /* ---- the frame loop ---- */
    let visible = true, raf = 0, pausedAt = 0, prevNow = 0, lastDraw = -1e9, frames = 0, msAcc = 0;
    function frame(now: number): void {
      raf = 0;
      if (gl.isContextLost()) return; // the cyan still has taken over (webglcontextlost → fail)
      if (!visible || document.hidden) { pausedAt = pausedAt || now; return; }
      if (pausedAt) { t0 += now - pausedAt; pausedAt = 0; }
      const away = scrollAway();
      const throttled = (!still && gov.capped(performance.now(), inp.lastInput, lowBattery)) || away > SCROLL_THROTTLE;
      if (throttled && now - lastDraw < MIN_FRAME_MS) { raf = requestAnimationFrame(frame); return; }
      if (prevNow && now - prevNow < 200 && !still) governorTick(now - prevNow, now);
      prevNow = now;
      lastDraw = now;
      const t = tFixed !== null ? tFixed : Math.max(0, (now - t0) / 1000); // a first frame can be stamped just before mount
      const dt = still ? 0 : clamp(t - lastT, 0, SIM_MAX_DT);
      lastT = t; simT = t;
      const start = performance.now();
      const sh = update(t, dt, true, away);
      renderFrame(gl, res, scene!, chain, sh, cur);
      frames++; dbg.frames = frames; msAcc += performance.now() - start;
      if (frames % 30 === 0) { if (msEl) msEl.textContent = `${(msAcc / 30).toFixed(1)} ms · ${activeN} bits · ${gov.tier} · p90 ${dbg.p90} · ${sh.ribBack}/${sh.ribN} ribbons · ${sh.dotN} dots · ${sh.glyphN} glyphs`; msAcc = 0; }
      if (!raf && !still) raf = requestAnimationFrame(frame);
      else if (still && frames < 3 && !raf) raf = requestAnimationFrame(frame);
    }

    new ResizeObserver(() => { layout(); if (still && !raf) raf = requestAnimationFrame(frame); }).observe(root); // a still frame must be redrawn
    // the theme toggle recolours the scene at once, without a reload
    new MutationObserver(() => { light = isLight(); if (still && !raf) raf = requestAnimationFrame(frame); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }, { threshold: 0 }).observe(root);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && visible && !raf) raf = requestAnimationFrame(frame); });
    raf = requestAnimationFrame(frame);
  }
}
