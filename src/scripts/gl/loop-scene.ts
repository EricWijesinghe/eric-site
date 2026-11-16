// The live skills loop: one transparent Canvas2D on the stage. It owns the view (turntable, tour turns,
// drag with inertia, pluck, sway, entry sweep, scroll tilt) and talks to skills.ts only through
// CustomEvents on the stage: sk:select, sk:hover, sk:phase (source 'scene' or 'dom') and sk:play.
// It draws only while something moves, stops offscreen and on hidden tabs, and under reduced motion
// paints one settled frame per change.
import { ALL_STARS, PHASES, RING } from '../../data/spectrum';
import { drawCore, drawGates, layoutLabels, paintLabels, drawLock, drawSpokes, drawStars, drawTrack, SPARK_MS, starPos, type CoreState, type Frame } from './loop-draw';
import { DEG, phaseCentre, phaseOf, prunePlucks, projectRing, ROLL, TAU, TILT, wrap, yawToFront, type Pluck, type View } from './loop-geom';
import { LoopPalette } from './loop-palette';
import { coreCaption, drawCoreCaption, drawPulse, LOOP_MS, passedStars, headAngle } from './loop-pulse';

const PHONE_MAX = 700;
const BLEED = 40;
const TOUR_TURN_MS = 1400;
const PICK_TURN_MS = 900;
const TURN_LEAD = 0.4;
const SWEEP_MS = 1100;
const IGNITE_STAGGER = 40;
const IGNITE_MS = 260;
const SWAY = 2.5 * DEG;
const SWAY_MS = 9000;
const TILT_IN = 32 * DEG;
const TILT_OUT = 24 * DEG;
const DRAG_START_PX = 6;
const INERTIA_DECAY = 0.94;
const HIT_PX = { fine: 24, coarse: 28 };
const TRACK_HIT_PX = 44;
const PLUCK_GAP_MS = 260;
const PLUCK_DEFAULT = 0.05;
const PLUCK_MIN = 0.03;
const PLUCK_MAX_AMP = 0.12;
const PLUCK_PER_SPEED = 0.05;
const CREST_EPS = 0.04;
const CORE_SPIN = 0.00018;
const MAX_DT = 50;
const DPR_CAP = { phone: 2, desk: 1.5 };

type Turn = { from: number; to: number; t0: number; ms: number };
const easeInOut = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const emit = (el: HTMLElement, name: string, detail: object): void => {
  el.dispatchEvent(new CustomEvent(name, { detail: { ...detail, source: 'scene' } }));
};

export function mountLoop(stage: HTMLElement): void {
  const canvas = stage.querySelector<HTMLCanvasElement>('.sk-canvas');
  const host = stage.closest<HTMLElement>('#skills') ?? stage;
  const g = canvas?.getContext('2d');
  if (!canvas || !g) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const deskTilt = window.matchMedia('(min-width: 1200px) and (pointer: fine)');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const pal = new LoopPalette(host);
  const n = ALL_STARS.length;
  const core: CoreState = { spin: 0.4, align: 0, alignT: -1, damaged: -1, healed: -1, damageT: -1, healT: -1e9 };
  const flash = new Float64Array(n).fill(-1e9);
  const spark = new Float64Array(n).fill(-1e9);
  const ignite = new Float32Array(RING.length).fill(reduced ? 1 : 0);
  const v: View = { yaw: yawToFront(phaseCentre(0), 0), tilt: TILT, roll: ROLL, r: 100, cx: 0, cy: 0 };

  let w = 0;
  let h = 0;
  let phone = false;
  let plucks: Pluck[] = [];
  let sel = -1;
  let hover = -1;
  let domHover = -1;
  let playing = !reduced;
  let clock = 0;
  let prevClock = 0;
  let tourPhase = 0;
  let turnPhase = 0;
  let turn: Turn | null = null;
  let vel = 0;
  let baseYaw = v.yaw;
  let swayK = 1;
  let calm = false;
  let over = false;
  let drag = false;
  let entryT = reduced ? -1e9 : -1;
  let visible = false;
  let raf = 0;
  let last = 0;

  function size(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, phone ? DPR_CAP.phone : DPR_CAP.desk);
    w = canvas!.clientWidth;
    h = canvas!.clientHeight;
    phone = w < PHONE_MAX;
    canvas!.width = Math.round(w * dpr);
    canvas!.height = Math.round(h * dpr);
    g!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const inner = h - 2 * BLEED;
    v.r = Math.min(w * 0.44, (inner - (phone ? 70 : 110)) / 1.12);
    v.cx = w / 2;
    v.cy = BLEED + inner / 2 - 0.1 * v.r;
    kick();
  }

  function turnTo(theta: number, ms: number): void {
    const to = yawToFront(theta, baseYaw);
    vel = 0;
    if (reduced) {
      baseYaw = to;
      turn = null;
    } else turn = { from: baseYaw, to, t0: performance.now(), ms };
  }

  function pluckAt(theta: number, amp: number): void {
    if (reduced) return;
    plucks = prunePlucks([...plucks, { theta, amp, t0: performance.now() }], performance.now());
  }

  function hit(x: number, y: number): number {
    const lim = coarse ? HIT_PX.coarse : HIT_PX.fine;
    let best = -1;
    let bd = lim;
    if (coreCaption.on && Math.abs(x - coreCaption.x) < coreCaption.hw && Math.abs(y - coreCaption.y) < coreCaption.hh) return 0;
    const f = frameFor(performance.now());
    for (let i = 0; i < n; i++) {
      const p = starPos(f, i);
      const d = Math.hypot(p.x - x, p.y - y) - (i === 0 ? v.r * 0.12 : 0);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** Nearest ring angle to a point and its distance in px, from a coarse sampling of the track. */
  function nearTrack(x: number, y: number): { theta: number; d: number } {
    let theta = 0;
    let d = Infinity;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU;
      const p = projectRing(a, 0, v);
      const dd = Math.hypot(p.x - x, p.y - y);
      if (dd < d) {
        d = dd;
        theta = a;
      }
    }
    return { theta, d };
  }

  function frameFor(t: number): Frame {
    return {
      g: g!, w, h, t, v, pal: pal.now, sprites: pal.sprites, plucks, sweep: entryT === -1 ? 0 : Math.min(1, (t - entryT) / SWEEP_MS),
      ignite, phase: tourPhase, sel, hover: hover >= 0 ? hover : domHover, labels: phone ? 'min' : 'front', flash, spark, core, bleed: BLEED, pulse: pulseOn(t) ? headAngle(clock) : -1,
    };
  }

  const pulseOn = (t: number): boolean => !reduced && entryT >= 0 && t - entryT >= SWEEP_MS;

  function tiltFor(): number {
    if (reduced || !deskTilt.matches) return TILT;
    const r = stage.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (window.innerHeight + r.height)));
    return TILT_IN + (TILT_OUT - TILT_IN) * k;
  }

  function step(t: number): boolean {
    const dt = Math.min(MAX_DT, t - last || 0);
    last = t;
    let moving = pal.step(t);
    const entered = entryT >= 0 && t - entryT >= SWEEP_MS;
    if (entryT >= 0 && !entered) moving = true;
    RING.forEach((_, i) => (ignite[i] = entryT === -1 ? 0 : Math.min(1, Math.max(0, (t - entryT - i * IGNITE_STAGGER) / IGNITE_MS))));
    if (ignite[RING.length - 1]! < 1 && entryT >= 0) moving = true;
    if (playing && entered && !reduced) {
      prevClock = clock;
      clock += dt;
      core.spin += dt * CORE_SPIN;
      passedStars(clock, prevClock).forEach((i) => (flash[i] = spark[i] = t));
      const p = phaseOf(headAngle(clock));
      if (p !== tourPhase) setTourPhase(p, true);
      // The turn starts a little before the pulse reaches the gate, so the new phase is centred while it plays.
      const ahead = phaseOf(headAngle(clock + TOUR_TURN_MS * TURN_LEAD));
      if (ahead !== turnPhase) {
        turnPhase = ahead;
        if (sel < 0) turnTo(phaseCentre(ahead), TOUR_TURN_MS);
      }
      moving = true;
    } else prevClock = clock;
    if (turn) {
      const k = Math.min(1, (t - turn.t0) / turn.ms);
      baseYaw = turn.from + (turn.to - turn.from) * easeInOut(k);
      if (k >= 1) turn = null;
      moving = true;
    } else if (Math.abs(vel) > 1e-5 && !drag) {
      baseYaw += vel * dt;
      vel *= INERTIA_DECAY;
      moving = true;
    }
    swayK += ((calm ? 0 : 1) - swayK) * 0.06;
    const sway = playing && !reduced ? SWAY * Math.sin((t / SWAY_MS) * TAU) * swayK : 0;
    v.yaw = baseYaw + sway;
    v.tilt = tiltFor();
    plucks = prunePlucks(plucks, t);
    if (plucks.length) {
      moving = true;
      crestFlashes(t);
    }
    if (spark.some((s) => t - s < SPARK_MS)) moving = true;
    return moving;
  }

  function crestFlashes(t: number): void {
    for (const p of plucks) {
      const age = t - p.t0;
      const c = 0.0026 * age;
      RING.forEach((s, i) => {
        if (Math.abs(wrap(s.angle - p.theta - c)) < CREST_EPS || Math.abs(wrap(s.angle - p.theta + c)) < CREST_EPS) flash[i + 1] = t;
      });
    }
  }

  function draw(t: number): void {
    g!.clearRect(0, 0, w, h);
    const f = frameFor(t);
    const labels = layoutLabels(f);
    drawTrack(f, false);
    drawGates(f, false, phone ? 'front' : 'all', labels);
    drawStars(f, false);
    drawCore(f);
    drawSpokes(f);
    drawTrack(f, true);
    drawGates(f, true, phone ? 'front' : 'all', labels);
    drawStars(f, true);
    if (pulseOn(t)) drawPulse(f, clock, prevClock, true, labels);
    drawCoreCaption(f, labels);
    drawLock(f);
    paintLabels(f, labels);
  }

  function frame(t: number): void {
    raf = 0;
    const moving = step(t);
    draw(t);
    if (moving && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function kick(): void {
    if (raf || !visible || document.hidden || !w) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function setTourPhase(p: number, fromPulse: boolean): void {
    tourPhase = p;
    if (!fromPulse) {
      turnPhase = p;
      if (sel < 0) turnTo(phaseCentre(p), TOUR_TURN_MS);
    }
    if (fromPulse) emit(stage, 'sk:phase', { phase: p });
  }

  function select(i: number, fromScene: boolean, amp = PLUCK_DEFAULT): void {
    sel = i;
    if (i > 0) {
      const s = ALL_STARS[i]!;
      turnTo(s.angle, PICK_TURN_MS);
      if (fromScene) pluckAt(s.angle, amp);
    } else if (i < 0) turnTo(phaseCentre(tourPhase), PICK_TURN_MS);
    if (fromScene) emit(stage, 'sk:select', { index: i });
    kick();
  }

  /* ---------- pointer ---------- */
  let down: { x: number; y: number; yaw: number; t: number; lx: number; lt: number } | null = null;
  let lastPluck = 0;
  const local = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') e.preventDefault(); // a drag turns the ring, never selects page text
    const [x, y] = local(e);
    down = { x, y, yaw: baseYaw, t: e.timeStamp, lx: x, lt: e.timeStamp };
    drag = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (down) {
      if (!drag && Math.abs(x - down.x) > DRAG_START_PX) {
        drag = true;
        turn = null;
        canvas.setPointerCapture(e.pointerId);
      }
      if (drag) {
        const dt = Math.max(1, e.timeStamp - down.lt);
        const speed = Math.abs(x - down.lx) / dt;
        vel = (x - down.lx) / v.r / dt;
        baseYaw = down.yaw + (x - down.x) / v.r;
        down.lx = x;
        down.lt = e.timeStamp;
        const tr = nearTrack(x, y);
        if (tr.d < 14 && e.timeStamp - lastPluck > PLUCK_GAP_MS) {
          lastPluck = e.timeStamp;
          pluckAt(tr.theta, Math.min(PLUCK_MAX_AMP, PLUCK_MIN + speed * PLUCK_PER_SPEED));
        }
        kick();
        return;
      }
    }
    const i = hit(x, y);
    canvas.classList.toggle('is-pick', i >= 0 || nearTrack(x, y).d < TRACK_HIT_PX);
    if (i !== hover) {
      hover = i;
      emit(stage, 'sk:hover', { index: i });
      kick();
    }
  });
  const end = (e: PointerEvent): void => {
    if (!down) return;
    const [x, y] = local(e);
    if (!drag && e.type === 'pointerup') {
      const i = hit(x, y);
      if (i >= 0) select(i, true);
      else {
        const tr = nearTrack(x, y);
        if (tr.d < TRACK_HIT_PX) emit(stage, 'sk:phase', { phase: phaseOf(tr.theta), pick: true });
      }
    }
    if (drag && reduced) vel = 0;
    down = null;
    drag = false;
    kick();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    if (hover >= 0) emit(stage, 'sk:hover', { index: -1 });
    hover = -1;
    kick();
  });
  // Sway stops while someone points at or tabs through the section, so nothing drifts under them.
  const setCalm = (): void => {
    calm = over || host.contains(document.activeElement);
  };
  stage.addEventListener('pointerenter', () => ((over = true), setCalm()));
  stage.addEventListener('pointerleave', () => ((over = false), setCalm()));
  host.addEventListener('focusin', setCalm);
  host.addEventListener('focusout', () => requestAnimationFrame(setCalm));

  /* ---------- from skills.ts ---------- */
  type Detail = { source?: string; index?: number; phase?: number; turn?: boolean; playing?: boolean };
  const fromDom = (fn: (d: Detail) => void) => (e: Event): void => {
    const d = (e as CustomEvent<Detail>).detail;
    if (d?.source === 'dom') fn(d);
  };
  stage.addEventListener('sk:select', fromDom((d) => select(d.index ?? -1, false)));
  stage.addEventListener('sk:hover', fromDom((d) => {
    domHover = d.index ?? -1;
    const s = ALL_STARS[domHover];
    if (d.turn && s && domHover > 0) turnTo(s.angle, PICK_TURN_MS);
    kick();
  }));
  stage.addEventListener('sk:phase', fromDom((d) => {
    const p = d.phase ?? 0;
    sel = -1;
    // The pulse jumps to the start of that phase, so the loop resumes from the chosen step.
    clock = Math.floor(clock / LOOP_MS) * LOOP_MS + (p / PHASES.length) * LOOP_MS + 1;
    prevClock = clock;
    setTourPhase(p, false);
    kick();
  }));
  stage.addEventListener('sk:play', fromDom((d) => {
    playing = Boolean(d.playing) && !reduced;
    kick();
  }));

  /* ---------- lifecycle ---------- */
  new ResizeObserver(size).observe(canvas);
  new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        visible = e.isIntersecting;
        if (e.intersectionRatio >= 0.25 && entryT === -1) {
          entryT = performance.now();
          stage.classList.add('sk-live');
        }
        kick();
      }
    },
    { threshold: [0, 0.25] },
  ).observe(stage);
  if (reduced) stage.classList.add('sk-live');
  document.addEventListener('visibilitychange', kick);
  if (deskTilt.matches && !reduced) window.addEventListener('scroll', kick, { passive: true });
  new MutationObserver(() => {
    pal.retarget(performance.now(), reduced);
    kick();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  void document.fonts?.ready.then(kick);
  emit(stage, 'sk:phase', { phase: 0 });
  stage.classList.add('sk-mounted');
  size();
}
