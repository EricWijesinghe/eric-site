// Eric (2026-11-16): energizing must reach the whole page. (2026-11-17): no black dot, no drawn circle, nothing
// tight around his neck, nothing that appears from nowhere, "binary and other things absorb into my body", premium
// rather than a toy. So, while he charges: binary and code glyphs stream in from the screen's edges and take their
// places in an orbit around his chest, a circle in a tilted plane seen in perspective (energy-orbit.ts): fixed
// slots, evenly spaced, the near side low, large, bright and fast, the far side small and dim, passing behind him.
// The swarm itself is the horizon. Most of what arrives crosses it and pours INTO HIM along five streams that end on
// his shoulders and chest with a short bloom; he keeps what he absorbs ('m2c:absorb' {k} tells the engine how bright
// to make him). Round 12 ("the energizing level is not enough", "the circle should expand ... and behave violently"):
// the pour escalates with the charge and then with what he holds, and the orbit swells, surges, precesses and flares
// (energy-fury.ts), so 1 s, 3 s and 6 s of holding look different. The release gives it all back evenly in every
// direction, from his outline (head too) and from the orbit, as far as the mass he held (energy-release.ts). Round
// 12b: the field may be around his head as well, so a share of what falls in curves into his head. One fixed canvas
// (pointer-events none, aria-hidden), drawn only while there is energy. Never over his face or words. Reduced motion: off.

import { FACE, HEAD_LINE, angleToward, loadBody, placeOrbit, project, roughBody, smooth, type Body, type Box, type Plane } from './energy-orbit';
import { DARK, HEAT, LIGHT, edges, glowLayer, glowOf, inkOf, inks, pulse, roomGrid, type Pal } from './energy-paint';
import { quietAlpha, readQuiet, type Quiet } from './energy-quiet';
import { SECTORS, along, fillDirs, route, sectorOf, type Path } from './energy-release';
import { makeFury, type Fury } from './energy-fury';
import {
  ABSORB_FROM, ARRIVE_LEAD_S, BIRTH_S, CAPTURE_PX, DEPTH_S, DIRECT, DIVE_BEHIND, DIVE_END, DIVE_FROM_FILL, DIVE_LEAD, DIVE_MASS, DIVE_PER_S,
  DIVE_S, DIVE_S0, DRAIN_PER_S, DWELL_S, FAR_COL, FAR_JOIN, FIGURE_SRC, FONT_PHONE_PX, FONT_PX, FULL_FROM, FULL_HZ, GATHER_MAX_S, GATHER_SPEED,
  GROW, HAZE, HEAD_DIVE, HOT_S, LANE, LEAD, LIFE_S, MASS_FULL, MASS_SQUEEZE, MIN_PITCH, NEAR_FAST, NECK_COL, ORBIT_GLYPHS, OUT_GLYPHS, OUT_TRAIL_S,
  BURST_Y, DOWN_FROM, LOW_PX, PHONE_W, PRESS_GLYPHS, PRESS_INSET, QUIET_MS, REACH, SEC_AT_S, SLOTS, SLOT_JITTER, SMALL_MIN, SMALL_W, SPACING, SPAWN_PER_S, SPIN, STAGE_FADE,
  STREAMS, STREAM_JITTER, SURGE_MS, TAU, TAU_S, TRAIL, TRAIL_S, TRAIL_SHRINK, TWIST,
} from './energy-tune';

const enum Mode { Gather, Orbit, Dive, Out }
interface Glyph extends Path {
  m: Mode; g: string; u: number; ph: number; v: number; life: number; // u picks its ink, ph its twinkle; v: room to be seen
  x: number; y: number; vx: number; vy: number; s: number; // screen position, velocity and drawn scale
  slot: number; a: number; // its place on the orbit (-1: none, it falls straight in) and the angle it last had there
  t: number; w: number; // seconds in this mode (negative while a released glyph waits inside him); per-mode number
  s0: number; s1: number; hot: number; head: boolean; // sizes at the start and end of a dive or flight; 1: born white-hot; diving into his head
}
export interface EnergyDebug { sec?: number[]; sec200?: number[]; secRatio?: number; headDives?: number; orbit: number; diving: number; gathering: number; out: number; absorbed: number; k: number; power: number; fromBody: number; flung: number; plane: Plane | null; column?: DOMRect | null }

export function mountEnergy(canvas: HTMLCanvasElement, figure: () => Box | null, onBurst: (power: number) => void): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const html = document.documentElement;
  const stage = document.querySelector<HTMLElement>('.m2c-stage'), sing = document.querySelector<HTMLElement>('.m2c-sing');
  const dbg: EnergyDebug | null = new URLSearchParams(location.search).has('debug') ? { orbit: 0, diving: 0, gathering: 0, out: 0, absorbed: 0, k: 0, power: 0, fromBody: 0, flung: 0, plane: null } : null;
  if (dbg) (window as unknown as { __m2cEnergy: EnergyDebug }).__m2cEnergy = dbg;
  let W = 0, H = 0, dpr = 1, level = 0, live = 0, armed = true, pressed = false;
  let fig: Box = { x: 0, y: 0, w: 1, h: 1 }, ox = 0, oy = 0, plane: Plane = { cx: 0, cy: 0, R: 1, sp: 0.4, cp: 0.9, roll: 0, yaw: 0 };
  let body: Body = roughBody, streamY = STREAMS.map((nx) => body.entry(nx));
  let pal: Pal = DARK, fills: string[][] = [], onFill = '', onEdge = '', glow = '', k = 0, squeeze = 1, hazeR = 1;
  let stageH = 1, share = 1, font = FONT_PX, quiet: Quiet = { column: null, boxes: [] };
  let mass = 0, sentK = 0, power = 1, raf = 0, last = 0, t = 0, spin = 0, spawnAcc = 0, diveAcc = 0, quietAt = -1e9;
  let slotAt: number[] = [], slotTaken: boolean[] = [], surgeTimer = 0, burstC: [number, number] = [0, 0], burstT = -1;
  const glyphs: Glyph[] = [];
  const room = roomGrid(SPACING), fury = makeFury();
  let fz: Fury = fury(0, 0, 0, 0);
  const haze = glowLayer();
  loadBody(FIGURE_SRC).then((b) => { body = b; streamY = STREAMS.map((nx) => b.entry(nx)); }).catch(() => undefined); // roughBody stands in
  const massK = (): number => Math.min(1, mass / (MASS_FULL * share));
  const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

  function size(): void {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    share = Math.max(SMALL_MIN, Math.min(1, W / SMALL_W));
    font = W < PHONE_W ? FONT_PHONE_PX : FONT_PX;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    haze.size(W, H);
    const n = W < PHONE_W ? SLOTS.phone : Math.round(SLOTS.desk * Math.max(SLOTS.minShare, share));
    slotAt = Array.from({ length: n }, (_, i) => (TAU * (i + rnd(-SLOT_JITTER, SLOT_JITTER))) / n);
    slotTaken = slotAt.map(() => false);
    for (const p of glyphs) if (p.slot >= n) p.slot = -1;
  }
  size();
  addEventListener('resize', size);

  /** Where he is on screen right now (the page scrolls under the fixed canvas), and where the words are. */
  function aim(now: number): boolean {
    const r = stage?.getBoundingClientRect(), f = figure();
    if (!r || !f) return false;
    fig = f; ox = r.left; oy = r.top;
    const base = placeOrbit(fig, ox, oy, fz.grow, { w: W, h: H }, font * DEPTH_S[1] * (1 + GROW), body.axis), pitch = Math.max(MIN_PITCH, Math.asin(base.sp) + fz.pitch);
    plane = { ...base, R: base.R * (1 + fz.beat), sp: Math.sin(pitch), cp: Math.cos(pitch), roll: base.roll + fz.roll, yaw: base.yaw + fz.yaw };
    if (now - quietAt < QUIET_MS) return true;
    quietAt = now;
    stageH = sing?.getBoundingClientRect().height || r.height;
    quiet = readQuiet(H);
    return true;
  }
  const toFig = (x: number, y: number): [number, number] => [(x - ox - fig.x) / fig.w, (y - oy - fig.y) / fig.h];
  const fromFig = ([nx, ny]: [number, number]): [number, number] => [ox + fig.x + nx * fig.w, oy + fig.y + ny * fig.h];
  /** A slot's angle now: all slots turn together, the near side faster (Kepler would shear them into clumps). */
  const slotAngle = (i: number): number => { const s = spin + slotAt[i]; return s - NEAR_FAST * Math.cos(s); };
  const laneR = (i: number): number => plane.R * (1 + LANE * (i % 2 ? 1 : -1) * squeeze);

  function glyph(m: Mode, x: number, y: number): Glyph {
    const set = m === Mode.Out ? OUT_GLYPHS : ORBIT_GLYPHS;
    return { m, g: set[Math.floor(Math.random() * set.length)], u: Math.random(), ph: rnd(0, TAU), v: 1, life: 1, x, y, vx: 0, vy: 0, s: 1, slot: -1, a: 0, t: 0, w: 0, s0: 1, s1: 1, hot: 0, head: false, bx: 0, by: 0, cx: 0, cy: 0, c2x: 0, c2y: 0, ex: 0, ey: 0 };
  }
  /** The free slot nearest an angle, or -1 when the orbit is full (then the glyph crosses it and falls in). */
  function freeSlot(a: number): number {
    let best = -1, bd = Infinity;
    for (let i = 0; i < slotAt.length; i++) {
      if (slotTaken[i]) continue;
      const d = Math.abs(Math.atan2(Math.sin(slotAngle(i) - a), Math.cos(slotAngle(i) - a)));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  /** One glyph entering from an edge (inset < 0: just off screen), never from above his head or from behind the words. */
  function spawn(inset: number): void {
    let x = 0, y = 0;
    const headX = ox + fig.x + FACE.x * fig.w, clear = FACE.rx * fig.w * 1.5, c = quiet.column;
    for (let i = 0; i < 6; i++) {
      const side = Math.floor(Math.random() * 4), s = Math.random();
      x = side === 1 ? W - inset : side === 3 ? inset : s * W;
      y = side === 0 ? inset : side === 2 ? H - inset : s * H;
      const overHead = side === 0 && Math.abs(x - headX) < clear, behindWords = c && x < c.right && y > c.top - 40 && y < c.bottom + 40;
      if (!overHead && !behindWords) break;
    }
    const p = glyph(Mode.Gather, x, y), at = angleToward(plane, x, y);
    p.a = Math.sin(at) < 0 ? (Math.cos(at) >= 0 ? -rnd(0, FAR_JOIN) : Math.PI + rnd(0, FAR_JOIN)) : at + rnd(-0.3, 0.3);
    p.slot = freeSlot(p.a);
    if (Math.random() < DIRECT && p.slot >= 0) p.slot = -1; // some cross the horizon at once: the streams start early
    if (p.slot < 0) p.a = rnd(0.12, 0.88) * Math.PI; // it crosses the near side anywhere, so no end piles up
    if (p.slot >= 0) slotTaken[p.slot] = true;
    const q = target(p), d = Math.hypot(q.x - x, q.y - y) || 1; // already moving: the pull is felt at once
    p.vx = ((q.x - x) / d) * GATHER_SPEED.base; p.vy = ((q.y - y) / d) * GATHER_SPEED.base;
    glyphs.push(p);
  }
  const target = (p: Glyph): { x: number; y: number; s: number } => (p.slot >= 0 ? project(plane, slotAngle(p.slot), laneR(p.slot)) : project(plane, p.a, plane.R));

  /** Flying in from an edge toward its place on the orbit, which sweeps it up as it arrives. */
  function gather(p: Glyph, dt: number): void {
    const q = target(p), dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
    const sp = GATHER_SPEED.base + GATHER_SPEED.charge * live + GATHER_SPEED.mass * k, e = Math.min(1, dt * 3);
    p.vx += ((dx / d) * sp - p.vx) * e; p.vy += ((dy / d) * sp - p.vy) * e;
    p.x += p.vx * dt; p.y += p.vy * dt; p.t += dt;
    if (d > CAPTURE_PX && p.t < GATHER_MAX_S) return;
    p.t = 0; p.bx = p.x - q.x; p.by = p.y - q.y;
    if (p.slot >= 0) p.m = Mode.Orbit;
    else startDive(p, true); // the orbit is full: it crosses the horizon and falls straight in
  }
  /** In orbit: it rides its slot; the last of its approach blends in. Returns its depth (-1 far .. 1 near). */
  function orbit(p: Glyph, dt: number): number {
    p.a = slotAngle(p.slot); p.t += dt;
    const q = project(plane, p.a, laneR(p.slot) * (1 + fz.jitter * Math.sin(t * (40 + 30 * p.u) + p.ph))), ease = Math.exp(-dt * 7); // it shivers
    p.bx *= ease; p.by *= ease;
    p.x = q.x + p.bx; p.y = q.y + p.by;
    const near = (q.z + 1) / 2;
    p.s = (DEPTH_S[0] + (DEPTH_S[1] - DEPTH_S[0]) * near) * (1 + GROW * k * near);
    if (live < 0.01) p.life -= dt * 3;
    return q.z;
  }
  /** Crossing the horizon: it peels off the way it was heading and curves into the nearest stream into his body. */
  function startDive(p: Glyph, arriving = false): void {
    if (p.slot >= 0) { slotTaken[p.slot] = false; p.slot = -1; }
    const [nx] = toFig(p.x, p.y), q0 = project(plane, p.a, plane.R), q1 = project(plane, p.a + 0.1, plane.R);
    p.bx = p.x; p.by = p.y;
    // one that has just arrived keeps flying the way it came; one in orbit leaves along the orbit
    p.cx = p.x + (arriving ? p.vx * ARRIVE_LEAD_S : (q1.x - q0.x) * DIVE_LEAD); p.cy = p.y + (arriving ? p.vy * ARRIVE_LEAD_S : (q1.y - q0.y) * DIVE_LEAD);
    p.head = Math.random() < HEAD_DIVE.share + HEAD_DIVE.mass * k;
    if (p.head) { // into his head, from its own side: up beside it, then in
      const side = nx < FACE.x ? 0 : 1, [lo, hi] = HEAD_DIVE.deg[side], th = (rnd(lo, hi) * Math.PI) / 180;
      [p.ex, p.ey] = fromFig([FACE.x + Math.cos(th) * FACE.rx * HEAD_DIVE.rim, FACE.y + Math.sin(th) * FACE.ry * HEAD_DIVE.rim]);
      p.cx = p.ex + (side ? 1 : -1) * FACE.rx * fig.w; p.cy = p.ey + FACE.ry * fig.h * 0.6;
      if (dbg) dbg.headDives = (dbg.headDives ?? 0) + 1;
    } else {
      let lane = 0;
      STREAMS.forEach((c, i) => { if (Math.abs(c - nx) < Math.abs(STREAMS[lane] - nx)) lane = i; });
      p.ex = ox + fig.x + (STREAMS[lane] + rnd(-STREAM_JITTER, STREAM_JITTER)) * fig.w;
      p.ey = Math.min(H - 12, oy + fig.y + streamY[lane] * fig.h);
    }
    p.s0 = Math.max(DIVE_S0[0], Math.min(DIVE_S0[1], p.s)); p.m = Mode.Dive; p.t = 0; p.w = 0;
  }
  const onCurve = (p: Glyph, e: number): [number, number] => {
    const i = 1 - e;
    return [i * i * p.bx + 2 * i * e * p.cx + e * e * p.ex, i * i * p.by + 2 * i * e * p.cy + e * e * p.ey];
  };
  /** Falling in, fully visible until it touches him; then a bloom of light where it went in. */
  function dive(p: Glyph, dt: number): number {
    p.t += dt;
    const u = p.t / DIVE_S;
    if (u < 1) {
      const e = u ** 1.5; // it accelerates as it falls
      [p.x, p.y] = onCurve(p, e);
      p.s = p.s0 + (DIVE_END - p.s0) * e;
      return 1 - 0.35 * e;
    }
    if (!p.w) { p.w = 1; mass = Math.min(MASS_FULL * share, mass + 1); } // w marks "counted"
    const f = (p.t - DIVE_S) / pal.pulse.s;
    if (f >= 1) p.life = 0;
    else { ctx!.setTransform(dpr, 0, 0, dpr, 0, 0); pulse(ctx!, haze.sprite, pal, p.ex, p.ey, f); }
    return 0;
  }
  function absorb(dt: number): void {
    diveAcc = Math.min(6, diveAcc + DIVE_PER_S * share * (1 + DIVE_MASS * k) * smooth(ABSORB_FROM, 1, live) * dt);
    let held = 0;
    for (const p of glyphs) if (p.m === Mode.Orbit) held++;
    if (held < slotAt.length * DIVE_FROM_FILL) return;
    for (let tries = 0; diveAcc >= 1 && tries < 16; tries++) {
      const p = glyphs[Math.floor(Math.random() * glyphs.length)];
      if (!p || p.m !== Mode.Orbit || p.t < DWELL_S || Math.sin(p.a) < DIVE_BEHIND) continue;
      startDive(p);
      diveAcc -= 1;
    }
  }

  /** A glyph sets off on its release path: the ease time sets how fast it gets there. */
  function launch(p: Glyph, dx: number, dy: number, f: number, cap: number, tau: number, decay: number): void {
    route(p, p.x, p.y, dx, dy, f, cap, { w: W, h: H });
    p.m = Mode.Out; p.t = 0; p.life = 1; p.w = decay; p.vx = tau; p.slot = -1; // vx holds tau in flight
  }
  /** The release. Everything leaves along a ray from his chin, so it keeps to its own sector of the screen: the orbit
      flung outward from where it is (with a little of its spin), the rest filling every sector to an equal share,
      each from where its ray leaves his outline (head included) or, below, where he runs off the screen, from the
      orbit's near side. */
  function bigBang(): void {
    power = 0.35 + 1.65 * Math.sqrt(massK());
    mass = 0; armed = level <= 0.01; // a tap too quick to raise any charge leaves nothing to drain
    // share of the way to the screen's edge: a tap stays within REACH.tap of him, a full hold leaves the screen
    const pk = (power - 0.35) / 1.65, f = (): number => rnd(...REACH.far) * (0.25 + 0.75 * pk);
    const decay = 1 / (LIFE_S.base + LIFE_S.power * power), cap = REACH.tap + pk * 4 * Math.hypot(W, H);
    const cN: [number, number] = [(body.axis + FACE.x) / 2, BURST_Y], low = Math.min(H - LOW_PX, project(plane, Math.PI / 2, plane.R).y);
    burstC = fromFig(cN); burstT = t;
    let flung = 0; const inside: Glyph[] = [], have = Array<number>(SECTORS).fill(0); // those falling into him join the burst
    slotTaken.fill(false);
    for (const p of glyphs) {
      if (p.m === Mode.Out) continue;
      if (p.m === Mode.Dive) { inside.push(p); continue; }
      let dx = p.x - burstC[0], dy = p.y - burstC[1];
      const n = Math.hypot(dx, dy) || 1;
      if (p.m === Mode.Orbit) { // it keeps a little of its spin: its slot's way round, on screen
        const q0 = project(plane, p.a, plane.R), q1 = project(plane, p.a + 0.05, plane.R), m = Math.hypot(q1.x - q0.x, q1.y - q0.y) || 1;
        dx = dx / n + (TWIST * (q1.x - q0.x)) / m; dy = dy / n + (TWIST * (q1.y - q0.y)) / m;
      }
      const m = Math.hypot(dx, dy) || 1;
      have[sectorOf(dx, dy)]++;
      launch(p, dx / m, dy / m, f(), cap, TAU_S.base / rnd(...TAU_S.rest), decay);
      p.s0 = p.s; p.s1 = 0.8 + 0.25 * power; p.hot = 0; flung++;
    }
    const dirs = fillDirs(Math.round((200 * power - 20) * share ** 0.7) + inside.length, have);
    dirs.forEach((dir, i) => {
      let [x, y] = fromFig(body.exit(cN[0], cN[1], dir.dx, dir.dy, fig.w / fig.h));
      if (dir.dy > 0.05 && y > low) { // he runs off the screen this way: it leaves his chest, anywhere down to the orbit's near side
        const r = Math.max(0, (low - burstC[1]) / dir.dy) * rnd(DOWN_FROM, 1);
        x = burstC[0] + dir.dx * r; y = burstC[1] + dir.dy * r;
      }
      const old = inside[i], lead = i < dirs.length * LEAD.share, p = old ?? glyph(Mode.Out, x, y);
      p.x = x; p.y = Math.min(y, H - 12);
      launch(p, dir.dx, dir.dy, f(), cap, TAU_S.base / (lead ? TAU_S.lead : rnd(...TAU_S.rest)), decay);
      p.s0 = BIRTH_S * (lead ? LEAD.size : 1); p.s1 = (0.8 + 0.25 * power) * (lead ? LEAD.size : 1); p.s = p.s0; p.hot = 1;
      p.t = lead ? -rnd(0, 0.03) : -rnd(0.02, 0.12) * power; // they surface over a moment, the front first
      if (!old) glyphs.push(p);
    });
    if (dbg) Object.assign(dbg, { power, fromBody: dirs.length, flung });
    onBurst(power);
  }
  /** Along its path, easing out; white-hot and large as it leaves him, then cooling and shrinking to its ink. */
  function fly(p: Glyph, dt: number): number {
    p.t += dt;
    if (p.t < 0) return 0; // still inside him
    if (p.vx > 0) [p.x, p.y] = along(p, 1 - Math.exp(-p.t / p.vx));
    const cool = smooth(HOT_S[0], HOT_S[1], p.t);
    p.s = p.s0 + (p.s1 - p.s0) * cool;
    p.life -= dt * (p.w || DRAIN_PER_S);
    return 1;
  }

  /** One glyph: stepped by its mode, then drawn with the depth, occlusion and quiet zones applied. */
  function draw(p: Glyph, dt: number): boolean {
    let alpha = 1, z = 0, lit = 0;
    if (p.m === Mode.Gather) {
      if (live > 0.01) { gather(p, dt); alpha = 0.85; }
      else { // let go without a release: it drifts out the way it was going
        if (p.slot >= 0) slotTaken[p.slot] = false;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        launch(p, p.vx / sp, p.vy / sp, 0.1, 60, TAU_S.base, DRAIN_PER_S); p.s0 = p.s1 = p.s;
      }
    } else if (p.m === Mode.Orbit) {
      z = orbit(p, dt);
      const near = (z + 1) / 2, far = pal.farA;
      alpha = (far + (1 - far) * near) * (0.85 + 0.15 * k); // far side small and dim, near side large and bright
      lit = HAZE.orbit * smooth(-0.3, 0.7, z) * (0.35 + 0.65 * live) * (0.6 + 0.4 * Math.sin(t * HAZE.twinkle + p.ph)) * (1 + HAZE.flare * fz.flare);
    } else if (p.m === Mode.Dive) { alpha = dive(p, dt); lit = alpha * HAZE.dive; }
    else alpha = fly(p, dt);
    // the swollen orbit may run off screen and back: only the rest leave for good there
    if (p.life <= 0 || (p.m !== Mode.Orbit && (p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80))) { if (p.slot >= 0) slotTaken[p.slot] = false; return false; }
    if (alpha <= 0) return true;
    const [nx, ny] = toFig(p.x, p.y), cover = body.alphaAt(nx, ny);
    alpha *= smooth(0, 1, p.life) * smooth(1, p.head && p.m === Mode.Dive ? HEAD_DIVE.fade : 1.3, Math.hypot((nx - FACE.x) / FACE.rx, (ny - FACE.y) / FACE.ry)) * quietAlpha(quiet, p.x, p.y);
    if (p.m === Mode.Orbit) {
      alpha *= 1 - 0.96 * cover * smooth(0.05, -0.2, z); // behind him
      const col = NECK_COL + (FAR_COL - NECK_COL) * smooth(0.2, -0.2, z);
      alpha *= 1 - (1 - smooth(HEAD_LINE, HEAD_LINE + 0.07, ny)) * (1 - smooth(col * 0.8, col, Math.abs(nx - FACE.x))); // never at his neck or head
      p.v += ((alpha > 0.05 && room.claim(p.x, p.y, p.g.length * 0.6 * font * p.s, font * p.s) ? 1 : 0) - p.v) * Math.min(1, dt * 10);
      alpha *= p.v;
    }
    if (lit > 0) haze.add(glow, p.x, p.y, hazeR * p.s, lit * alpha);
    if (alpha < 0.012) return true;
    const onHim = smooth(0.3, 0.7, cover * (1 - smooth(STAGE_FADE[0], STAGE_FADE[1], (p.y - oy) / stageH)));
    const heat = p.hot && p.t > 0 ? Math.round((1 - smooth(HOT_S[0], HOT_S[1], p.t)) * (HEAT - 1)) : 0;
    put(p, p.x, p.y, p.s, alpha, onHim, heat);
    if (p.m === Mode.Orbit && live > 0.3 && z > 0) { // lensing: near the horizon it smears back along its orbit
      const q = project(plane, p.a - 0.04 * (1 + k), laneR(p.slot));
      put(p, q.x + p.bx, q.y + p.by, p.s * 0.96, alpha * 0.22 * live, onHim, 0);
    } else if (p.m === Mode.Dive) { // fainter copies behind it on its curve: a stream pouring into him
      TRAIL.forEach((a, n) => {
        const e = Math.max(0, Math.min(1, (p.t - TRAIL_S * (n + 1)) / DIVE_S)) ** 1.5, [x, y] = onCurve(p, e);
        put(p, x, y, (p.s0 + (DIVE_END - p.s0) * e) * TRAIL_SHRINK ** (n + 1), alpha * a, onHim, 0);
      });
    } else if (p.m === Mode.Out && p.t > 0 && p.t < OUT_TRAIL_S && p.vx > 0) { // the burst's first moment is a streak
      for (let n = 1; n <= 2; n++) {
        const [x, y] = along(p, 1 - Math.exp(-Math.max(0, p.t - 0.012 * n) / p.vx));
        put(p, x, y, p.s, alpha * (0.4 / n), onHim, heat);
      }
    }
    return true;
  }
  /** The glyph in the theme's ink on the page; over him always light, with a fine dark edge in light theme. */
  function put(p: Glyph, x: number, y: number, s: number, alpha: number, onHim: number, heat: number): void {
    ctx!.setTransform(dpr * s, 0, 0, dpr * s, x * dpr, y * dpr);
    if (onHim < 0.98) { ctx!.globalAlpha = alpha * (1 - onHim); ctx!.fillStyle = fills[heat][inkOf(pal, p.u)]; ctx!.fillText(p.g, 0, 0); }
    if (onHim > 0.02) {
      ctx!.globalAlpha = alpha * onHim * pal.onA;
      if (onEdge) { ctx!.fillStyle = onEdge; ctx!.fillText(p.g, 1 / s, 1 / s); }
      ctx!.fillStyle = onFill; ctx!.fillText(p.g, 0, 0);
    }
  }

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; t += dt;
    pal = html.dataset.theme === 'light' ? LIGHT : DARK;
    live = armed ? level : 0; // after a release the rest of the charge only drains: nothing new gathers
    if (live < 0.01) mass = Math.max(0, mass - dt * MASS_FULL); // let go without a release: it evaporates
    k = massK();
    fz = fury(dt, t, live, k);
    squeeze = (1 - 0.6 * live) * (1 - MASS_SQUEEZE * k);
    spin += (SPIN.base + SPIN.charge * live + SPIN.mass * k) * dt;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, H);
    if (!aim(now)) { raf = 0; last = 0; return; }
    hazeR = pal.hazeR * Math.min(1.2, Math.max(0.45, plane.R / HAZE.rRef));
    if (pressed) { pressed = false; for (let i = Math.round(PRESS_GLYPHS * Math.sqrt(share)); i > 0; i--) spawn(rnd(PRESS_INSET[0], PRESS_INSET[1])); }
    if (live > 0.01) edges(ctx!, pal, live, plane.cx, plane.cy, W, H, quiet.column);
    ctx!.globalCompositeOperation = pal.blend;
    let held = 0;
    for (const p of glyphs) if (p.m === Mode.Gather || p.m === Mode.Orbit) held++;
    spawnAcc = Math.min(12, spawnAcc + (SPAWN_PER_S.charge * live ** 0.7 + SPAWN_PER_S.mass * k * live) * Math.max(share, SLOTS.minShare) * dt);
    while (spawnAcc >= 1) { spawnAcc -= 1; if (held++ < slotAt.length * 2) spawn(-10); }
    if (live > 0.01) absorb(dt);
    haze.clear(); room.clear(font * 0.5);
    fills = inks(pal, k); onFill = `rgb(${pal.on})`; onEdge = pal.onEdge ? `rgb(${pal.onEdge})` : ''; glow = glowOf(pal, k);
    ctx!.font = `500 ${font}px "JetBrains Mono", ui-monospace, monospace`;
    ctx!.textAlign = 'center'; ctx!.textBaseline = 'middle';
    // drawn from the end: falling and flying glyphs, then the orbit's near side, which wins the room where two meet
    glyphs.sort((a, b) => (a.m === Mode.Orbit ? Math.sin(a.a) : 2) - (b.m === Mode.Orbit ? Math.sin(b.a) : 2));
    for (let i = glyphs.length - 1; i >= 0; i--) if (!draw(glyphs[i], dt)) glyphs.splice(i, 1);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const breath = 1 + 0.25 * Math.sin(TAU * FULL_HZ * t) * smooth(FULL_FROM, 1, k);
    haze.paint(ctx!, pal, W, H, (pal.glowA[0] + (pal.glowA[1] - pal.glowA[0]) * k) * breath);
    const kq = Math.round(k * 200) / 200;
    if (kq !== sentK) { sentK = kq; dispatchEvent(new CustomEvent('m2c:absorb', { detail: { k: kq } })); }
    if (dbg) {
      const c = [0, 0, 0, 0], sec = Array<number>(SECTORS).fill(0); // released glyphs on screen per sector round the burst's centre
      for (const p of glyphs) { c[p.m]++; if (p.m === Mode.Out && p.t > 0 && p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H) sec[sectorOf(p.x - burstC[0], p.y - burstC[1])]++; }
      if (burstT >= 0 && t - burstT >= SEC_AT_S) { burstT = -1; Object.assign(dbg, { sec200: sec, secRatio: Math.max(...sec) / Math.max(1, Math.min(...sec)) }); }
      Object.assign(dbg, { sec, gathering: c[Mode.Gather], orbit: c[Mode.Orbit], diving: c[Mode.Dive], out: c[Mode.Out], absorbed: mass, k: kq, plane, column: quiet.column });
    }
    if (live > 0.01 || glyphs.length || mass > 0) raf = requestAnimationFrame(frame);
    else { raf = 0; last = 0; ctx!.clearRect(0, 0, W, H); }
  }
  const wake = (): void => { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); };

  addEventListener('m2c:charge', (e) => {
    const was = level;
    level = Math.max(0, Math.min(1, (e as CustomEvent<{ level: number }>).detail.level));
    html.style.setProperty('--m2c-energy', level.toFixed(3));
    if (level <= 0.01) { armed = true; return; } // the spent charge has drained: the next hold gathers again
    if (armed && was <= 0.01) pressed = true;
    wake();
  });
  addEventListener('m2c:release', (e) => {
    if ((e as CustomEvent<{ auto: boolean }>).detail.auto) return; // an idle pulse stays inside the hero
    if (!aim(performance.now())) return;
    bigBang();
    wake();
    html.classList.add('m2c-surge');
    window.clearTimeout(surgeTimer);
    surgeTimer = window.setTimeout(() => html.classList.remove('m2c-surge'), SURGE_MS * (0.6 + 0.4 * power));
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; last = 0; } else wake(); });
}
