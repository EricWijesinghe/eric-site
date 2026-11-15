// "Singularity": Eric's binary hologram as the centre of gravity of a GPU-simulated accretion disk.
// Ported from design/eric-quantum-forge/v11 (source/main.js, approved 2026-11-15). The scene, timing
// and numbers are v11's. One change: lightning keeps clear of his head (cursor bolts leave from his
// shoulders, and FS_RIB fades any arc inside the head halo), because a line there reads as hair.
// URL: ?t=9 jump · ?still freeze · ?debug frame time · prefers-reduced-motion shows a still frame.
import * as S from './singularity-shaders';
import { buildHalo, glKit, load, type Target } from './singularity-gl';

const CONFIG = {
  particles: 90000, // bits in the disk (phones use 45%)
  autoPulse: 7, // seconds between pulses when nobody interacts
  bloom: 1.0,
  dprCap: 2,
  T: { build: [0.9, 2.9], pillar: 2.4, firstPulse: 3.3 },
};
const FIG = { w: 1309, h: 1201, axisX: 790, discY: 760, headC: [800, 300] };
const GLYPHS = ['0', '1', 'A', 'F', '7', '3', 'E', '9', '∑', '∫', '∂', 'ψ', 'λ', 'π', '∞', '⊗'];
const ASSETS = { fig: '/eric/eric-v11-figure.webp', aux: '/eric/eric-v11-aux.webp', trace: '/eric/eric-v11-region.webp' };
const RIB_STRIDE = 5; // x, y | side, intensity, keep-clear-of-head

type Pt = [number, number];
interface Arc { fig: boolean; a: Pt; b: () => Pt; t0: number; dur: number; seed: number; w: number }
interface Pulse { t: number; k: number; applied: boolean }
interface Layout { s: number; U: number; fo: Pt; land: boolean }
export interface SingularityDebug { frames: number; fired: number; anchorHaloMax: number; figArcs: number }

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Mounts the hero inside `root`. Rejects (and leaves the CSS fallback showing) without WebGL2. */
export async function mountSingularity(root: HTMLElement): Promise<void> {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const msEl = root.querySelector<HTMLElement>('[data-ms]');
  const qs = new URLSearchParams(location.search);
  const debugOn = qs.has('debug');
  if (debugOn) root.classList.add('m2c-debug');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const fail = () => root.classList.add('m2c-nogl');

  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) { fail(); return; }
  canvas.addEventListener('webglcontextlost', fail);
  const floatFB = !!gl.getExtension('EXT_color_buffer_float');
  const K = glKit(gl, floatFB);

  try {
    // fonts.ready alone would not wait: nothing in the DOM asks for the mono face before the glyph atlas does.
    const mono = document.fonts?.load('700 46px "JetBrains Mono"').catch(() => []);
    const [figImg, auxImg, trImg] = await Promise.all([load(ASSETS.fig), load(ASSETS.aux), load(ASSETS.trace), mono]);
    run(gl, K, figImg, auxImg, trImg);
  } catch (e) {
    fail();
    throw e;
  }

  function run(gl: WebGL2RenderingContext, K: ReturnType<typeof glKit>, figImg: HTMLImageElement, auxImg: HTMLImageElement, trImg: HTMLImageElement): void {
    const c3 = document.createElement('canvas'); c3.width = FIG.w; c3.height = FIG.h;
    const x3 = c3.getContext('2d', { willReadFrequently: true })!;
    x3.drawImage(figImg, 0, 0); const figPx = x3.getImageData(0, 0, FIG.w, FIG.h).data;
    const alphaAt = (x: number, y: number) => figPx[(Math.round(clamp(y, 0, FIG.h - 1)) * FIG.w + Math.round(clamp(x, 0, FIG.w - 1))) * 4 + 3];
    const halo = buildHalo(trImg, FIG.w, FIG.h);
    // his silhouette's upper contour: where the lightning leaves him, never from the head halo
    const contour: Pt[] = [];
    for (let x = 260; x < 1300; x += 8) { for (let y = 0; y < 1000; y += 2) if (alphaAt(x, y) > 128) { contour.push([x, y]); break; } }
    const torso = contour.filter(([x, y]) => halo.at(x, y) === 0);
    const shoulders = torso.filter(([, y]) => y > 560);

    const at = document.createElement('canvas'); at.width = at.height = 256; const ax = at.getContext('2d')!;
    ax.fillStyle = '#fff'; ax.textAlign = 'center'; ax.textBaseline = 'middle';
    GLYPHS.forEach((g, i) => {
      ax.font = (i < 8 ? '700 46px ' : '500 44px ') + '"JetBrains Mono Variable","JetBrains Mono",ui-monospace,Menlo,Consolas,"Cambria Math",serif';
      ax.fillText(g, (i % 4) * 64 + 32, Math.floor(i / 4) * 64 + 35);
    });

    const tFig = K.tex(figImg), tAux = K.tex(auxImg), tTr = K.tex(trImg), tAtlas = K.tex(at), tHalo = K.texR8(halo.data, halo.w, halo.h);
    [tFig, tAtlas].forEach((t) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); });

    const pBG = K.prog(S.VS_FS, S.FS_BG), pSim = K.prog(S.VS_SIM, S.FS_NULL, ['oS']), pDisk = K.prog(S.VS_DISK, S.FS_POINT), pMesh = K.prog(S.VS_MESH, S.FS_MESH),
      pVap = K.prog(S.VS_VAPOR, S.FS_POINT), pRib = K.prog(S.VS_RIB, S.FS_RIB), pDown = K.prog(S.VS_FS, S.FS_DOWN), pUp = K.prog(S.VS_FS, S.FS_UP), pComp = K.prog(S.VS_FS, S.FS_COMP);
    const vFS = gl.createVertexArray()!; const fsBuf = K.buffer(new Float32Array([-1, -1, 3, -1, -1, 3]));
    [pBG, pDown, pUp, pComp].forEach((P) => K.bindAttr(P, vFS, 'aP', fsBuf, 2));

    // ---- the disk: state ping-pong
    const small = Math.min(innerWidth, innerHeight) < 700;
    const N = Math.round(CONFIG.particles * (small ? 0.45 : 1));
    const S0 = new Float32Array(N * 4), KS = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const u = rnd();
      const r0 = u < 0.1 ? 0.46 + 0.05 * rnd() : u < 0.8 ? 0.52 + 1.0 * Math.pow(rnd(), 1.3) : 1.45 + 0.9 * rnd();
      const a = rnd() * Math.PI * 2, R = 1.8 + rnd() * 1.6; // everything starts far away and falls in
      S0.set([Math.cos(a) * R, Math.sin(a) * R, 0, 0], i * 4); KS.set([r0, rnd(), rnd(), rnd()], i * 4);
    }
    const bS = [K.buffer(S0, gl.DYNAMIC_COPY), K.buffer(S0, gl.DYNAMIC_COPY)], bK = K.buffer(KS);
    const vSim = [0, 1].map((i) => { const v = gl.createVertexArray()!; K.bindAttr(pSim, v, 'aS', bS[i], 4); K.bindAttr(pSim, v, 'aK', bK, 4); return v; });
    const vDisk = [0, 1].map((i) => { const v = gl.createVertexArray()!; K.bindAttr(pDisk, v, 'aS', bS[i], 4); K.bindAttr(pDisk, v, 'aK', bK, 4); return v; });
    const tfo = [0, 1].map((i) => {
      const t = gl.createTransformFeedback()!; gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, t);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, bS[1 - i]); return t;
    });
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null); gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    let cur = 0;

    // ---- figure mesh
    const mUV: number[] = [], mIdx: number[] = [];
    {
      const step = 6, cols = Math.floor(FIG.w / step) + 1, rows = Math.floor(FIG.h / step) + 1;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) mUV.push(Math.min(i * step, FIG.w) / FIG.w, Math.min(j * step, FIG.h) / FIG.h);
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) { const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1; mIdx.push(a, b, c, b, d, c); }
    }
    const vMesh = gl.createVertexArray()!; K.attr(pMesh, vMesh, 'aUV', new Float32Array(mUV), 2);
    gl.bindVertexArray(vMesh); const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mIdx), gl.STATIC_DRAW); const nIdx = mIdx.length;
    // ---- vapour
    const pUV: number[] = [], pR: number[] = [];
    for (let y = 0; y < FIG.h; y += 9) for (let x = 0; x < FIG.w; x += 9) {
      const jx = x + (rnd() - 0.5) * 8, jy = y + (rnd() - 0.5) * 8;
      if (alphaAt(jx, jy) < 90) continue; pUV.push(jx / FIG.w, jy / FIG.h); pR.push(rnd(), rnd(), rnd(), rnd());
    }
    const vVap = gl.createVertexArray()!; K.attr(pVap, vVap, 'aUV', new Float32Array(pUV), 2); K.attr(pVap, vVap, 'aR', new Float32Array(pR), 4); const nVap = pUV.length / 2;
    // ---- ribbons (lightning, rings): rebuilt every frame
    const RIB_MAX = 24000; const ribData = new Float32Array(RIB_MAX * RIB_STRIDE); let ribN = 0;
    const vRib = gl.createVertexArray()!; const ribBuf = K.buffer(ribData, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(vRib); gl.bindBuffer(gl.ARRAY_BUFFER, ribBuf);
    ([['aP', 2, 0], ['aQ', 3, 8]] as const).forEach(([n, size, off]) => {
      const loc = gl.getAttribLocation(pRib.p, n); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, RIB_STRIDE * 4, off);
    });
    gl.bindVertexArray(null);
    function ribbon(pts: Pt[], w: number, I: number, clear: number): void { // pts: screen px polyline
      for (let i = 0; i < pts.length - 1 && ribN + 6 <= RIB_MAX; i++) {
        const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * w, ny = dx / l * w;
        const q = [[a[0] - nx, a[1] - ny, -1], [b[0] - nx, b[1] - ny, -1], [b[0] + nx, b[1] + ny, 1], [a[0] - nx, a[1] - ny, -1], [b[0] + nx, b[1] + ny, 1], [a[0] + nx, a[1] + ny, 1]];
        q.forEach(([x, y, s]) => { ribData.set([x, y, s, I, clear], ribN * RIB_STRIDE); ribN++; });
      }
    }
    function bolt(a: Pt, b: Pt, rough: number, seedB: number): Pt[] { // jagged lightning by midpoint displacement
      let pts: Pt[] = [a, b]; let s = seedB; const R = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
      for (let lv = 0, amp = Math.hypot(b[0] - a[0], b[1] - a[1]) * rough; lv < 6; lv++, amp *= 0.5) {
        const np: Pt[] = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
          const p = pts[i], q = pts[i + 1], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, o = R() * amp;
          np.push([(p[0] + q[0]) / 2 - dy / l * o, (p[1] + q[1]) / 2 + dx / l * o], q);
        }
        pts = np;
      }
      return pts;
    }

    /* ---- layout ---- */
    let W = 0, H = 0, DPR = 1, L: Layout = { s: 1, U: 1, fo: [0, 0], land: true }, scene: Target | null = null, chain: Target[] = [];
    function layout(): void {
      DPR = Math.min(devicePixelRatio || 1, CONFIG.dprCap);
      const r = root.getBoundingClientRect(); W = Math.max(2, Math.round(r.width * DPR)); H = Math.max(2, Math.round(r.height * DPR));
      if (canvas.width !== W) canvas.width = W; // assigning clears the drawing buffer
      if (canvas.height !== H) canvas.height = H;
      const land = W / H > 1;
      const s = land ? H * 0.8 / 1100 : Math.min(W * 1.02 / 1150, H * 0.5 / 1100);
      const U = land ? H * 0.82 : Math.min(H * 0.7, W * 0.92);
      const fo: Pt = [W * 0.5 - FIG.axisX * s, H * (land ? 1.02 : 0.84) - FIG.h * s];
      L = { s, U, fo, land };
      [scene, ...chain].forEach((o) => { if (o) { gl.deleteTexture(o.t); gl.deleteFramebuffer(o.f); } });
      scene = K.target(W, H); chain = [];
      let w = W, h = H; for (let i = 0; i < 5; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); chain.push(K.target(w, h)); }
    }
    layout();
    // A still frame is drawn only a few times, so a resize (which rebuilds the targets) must redraw it.
    new ResizeObserver(() => { layout(); if (still && !raf) raf = requestAnimationFrame(frame); }).observe(root);
    const figToScreen = (x: number, y: number, fo: Pt): Pt => [fo[0] + x * L.s, fo[1] + y * L.s];

    /* ---- input ---- */
    const mouse = { x: -1e4, y: -1e4, nx: 0, ny: 0, last: -1e9, on: 0 };
    let charging = false, chargeT0 = 0, charge = 0, lastInput = -1e9;
    const pulses: Pulse[] = [];
    const dbg: SingularityDebug = { frames: 0, fired: 0, anchorHaloMax: 0, figArcs: 0 };
    if (debugOn) (window as unknown as { __m2c: SingularityDebug }).__m2c = dbg;
    const fire = (k: number) => { pulses.push({ t: simT, k, applied: false }); lastInput = simT; dbg.fired++; };
    const point = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) * DPR; mouse.y = (e.clientY - r.top) * DPR; mouse.nx = (e.clientX - r.left) / r.width * 2 - 1; mouse.ny = (e.clientY - r.top) / r.height * 2 - 1;
      mouse.last = performance.now();
    };
    root.addEventListener('pointermove', point, { passive: true });
    root.addEventListener('pointerleave', () => { mouse.last = -1e9; if (charging) { charging = false; fire(0.6 + 1.6 * charge); } });
    root.addEventListener('pointerdown', (e) => { charging = true; chargeT0 = simT; point(e); });
    const release = () => { if (!charging) return; charging = false; fire(0.6 + 1.6 * charge); };
    addEventListener('pointerup', release); addEventListener('pointercancel', release);
    root.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); fire(1.2); } });

    /* ---- simulation ---- */
    let simT = 0;
    const step = (dt: number, t: number, pulseK: number, md: Pt, mOn: number) => {
      gl.useProgram(pSim.p);
      gl.uniform1f(pSim.u.uDt, dt); gl.uniform1f(pSim.u.uTime, t); gl.uniform1f(pSim.u.uCharge, charge); gl.uniform1f(pSim.u.uPulse, pulseK);
      gl.uniform2f(pSim.u.uMD, md[0], md[1]); gl.uniform1f(pSim.u.uMOn, mOn);
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.bindVertexArray(vSim[cur]); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tfo[cur]);
      gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS, 0, N); gl.endTransformFeedback();
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null); gl.disable(gl.RASTERIZER_DISCARD); gl.bindVertexArray(null);
      cur = 1 - cur;
    };
    // scheduled pulses (when nobody interacts)
    let nextAuto = CONFIG.T.firstPulse;
    const schedule = (t: number) => { if (t >= nextAuto) { if (t - lastInput > 4) pulses.push({ t: nextAuto, k: 1.0, applied: false }); nextAuto += CONFIG.autoPulse; } };

    /* ---- timeline ---- */
    let t0 = performance.now(); const still = qs.has('still') || reduce;
    const tq = qs.has('t') ? parseFloat(qs.get('t') ?? '') : NaN;
    let tFixed: number | null = Number.isFinite(tq) ? tq : reduce ? 9 : null;
    if (tFixed !== null && !still) { t0 -= tFixed * 1000; tFixed = null; }
    // pre-simulate so a frozen frame (or a jump) shows the settled disk
    {
      const target = tFixed !== null ? tFixed : (performance.now() - t0) / 1000; const n = Math.min(Math.round(target * 60), 900);
      for (let i = 0; i < n; i++) {
        const t = i / 60; schedule(t); let k = 0;
        pulses.forEach((p) => { if (!p.applied && t >= p.t) { p.applied = true; k += p.k; } });
        step(1 / 60, t, k, [9, 9], 0); simT = t;
      }
    }

    let visible = true, raf = 0, pausedAt = 0, lastT = simT, frames = 0, msAcc = 0, glitch = 0, nextGlitch = 5, hover = 0;
    new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }, { threshold: 0 }).observe(root);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && visible && !raf) raf = requestAnimationFrame(frame); });
    const arcs: Arc[] = [];
    const pushFigArc = (arc: Arc) => {
      arcs.push(arc); dbg.figArcs++; dbg.anchorHaloMax = Math.max(dbg.anchorHaloMax, halo.at(arc.a[0], arc.a[1]));
    };

    function frame(now: number): void {
      raf = 0;
      if (gl.isContextLost()) return; // the cyan still has taken over (webglcontextlost → fail)
      if (!visible || document.hidden) { pausedAt = pausedAt || now; return; }
      if (pausedAt) { t0 += now - pausedAt; pausedAt = 0; }
      const t = tFixed !== null ? tFixed : (now - t0) / 1000;
      const dt = still ? 0 : clamp(t - lastT, 0, 1 / 30); lastT = t; simT = t;
      const T = CONFIG.T;

      // input state
      const mActive = now - mouse.last < 3000 ? 1 : 0; mouse.on += (mActive - mouse.on) * 0.08;
      charge = charging ? clamp((t - chargeT0) / 1.8, 0, 1) : Math.max(0, charge - dt * 2.5);
      if (!still) schedule(t);
      let pulseK = 0; pulses.forEach((p) => { if (!p.applied && t >= p.t) { p.applied = true; pulseK += p.k; } });
      while (pulses.length && t - pulses[0].t > 3) pulses.shift();
      const lastP = pulses.length ? pulses[pulses.length - 1] : null;
      const age = lastP ? t - lastP.t : 99, pk = lastP ? lastP.k : 0;
      const flash = age < 2 ? Math.exp(-age * 3.2) * Math.min(pk, 1.6) : 0;

      // camera: parallax and a tremor while charging
      const shake = charge * 3 * DPR, sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
      const par: Pt = [-mouse.nx * 0.012 * W * mouse.on + sx, -mouse.ny * 0.008 * H * mouse.on + sy];
      const fo: Pt = [L.fo[0] + par[0], L.fo[1] + par[1]];
      const DC = figToScreen(FIG.axisX, FIG.discY, fo); DC[0] += par[0] * 0.8; DC[1] += par[1] * 0.8;
      const tilt = 0.3 + mouse.ny * 0.07 * mouse.on;
      const headC = figToScreen(FIG.headC[0], FIG.headC[1], fo), headTop = figToScreen(FIG.axisX, 40, fo)[1];
      // cursor in the disk plane (inverse of the projection, ignoring perspective)
      const md: Pt = [(mouse.x - DC[0]) / L.U, (mouse.y - DC[1]) / (L.U * Math.sin(tilt))];
      const front = mix(-60, 1260, smooth(T.build[0], T.build[1], t));
      hover += ((mActive && t > T.build[1] ? 1 : 0) - hover) * 0.08;
      if (!still && t > nextGlitch) { glitch = 1; nextGlitch = t + 4 + Math.random() * 6; }
      glitch = Math.max(0, glitch - dt * 5);
      const boot = smooth(0, 0.8, t), surge = Math.max(flash, charge * 0.7);

      // physics
      if (!still) step(dt, t, pulseK, md, mouse.on * (charging ? 0 : 1));

      // lightning: plasma arcs inside the disk; from his shoulders out into it while charging or pulsing;
      // from his shoulders to the cursor when it comes close. Never from his head.
      const diskPt = (a: number, rr: number): Pt => [DC[0] + Math.cos(a) * rr * L.U, DC[1] + Math.sin(a) * rr * Math.sin(tilt) * L.U];
      if (!still && t > T.build[1] && Math.random() < (1.6 + charge * 6) * dt) {
        const a = Math.random() * Math.PI * 2, rr = 0.5 + Math.random() * 0.5, da = (0.25 + Math.random() * 0.4) * (Math.random() < 0.5 ? -1 : 1);
        arcs.push({ fig: false, a: diskPt(a, rr), b: () => diskPt(a + da, rr + (Math.random() - 0.5) * 0.1), t0: t, dur: 0.1 + Math.random() * 0.18, seed: 1 + Math.floor(Math.random() * 1e6), w: 0.8 });
      }
      if (!still && shoulders.length && Math.random() < (charge * 10 + (flash > 0.4 ? 8 : 0)) * dt) {
        const c = shoulders[Math.floor(Math.random() * shoulders.length)], side = c[0] < FIG.axisX ? Math.PI : 0;
        const a = side + (Math.random() - 0.5) * 0.9, rr = 0.75 + Math.random() * 0.45;
        pushFigArc({ fig: true, a: c, b: () => diskPt(a, rr), t0: t, dur: 0.1 + Math.random() * 0.2, seed: 1 + Math.floor(Math.random() * 1e6), w: 1.2 });
      }
      const near = mouse.on > 0.5 && Math.hypot(mouse.x - headC[0], mouse.y - headC[1]) < 0.8 * L.U && t > T.build[1];
      if (!still && near && torso.length && Math.random() < (6 + charge * 20) * dt) {
        let best = torso[0], bd = 1e9;
        torso.forEach((c) => { const p = figToScreen(c[0], c[1], fo), d = Math.hypot(p[0] - mouse.x, p[1] - mouse.y) + Math.random() * 60 * DPR; if (d < bd) { bd = d; best = c; } });
        pushFigArc({ fig: true, a: best, b: () => [mouse.x, mouse.y], t0: t, dur: 0.1 + Math.random() * 0.16, seed: 1 + Math.floor(Math.random() * 1e6), w: 1.4 });
      }
      if (still && t > T.build[1] && !arcs.length) {
        ([[0.6, 0.55, 0.5], [3.5, 0.8, -0.45], [2.2, 0.65, 0.4]] as const).forEach(([a, rr, da], i) =>
          arcs.push({ fig: false, a: diskPt(a, rr), b: () => diskPt(a + da, rr + 0.05), t0: t, dur: 1e9, seed: 77 + i * 31, w: 0.9 }));
      }
      for (let i = arcs.length - 1; i >= 0; i--) if (t - arcs[i].t0 > arcs[i].dur) arcs.splice(i, 1);
      ribN = 0;
      // the pulse's ring in the disk plane: far half first (drawn behind him), near half after
      let ribBack = 0;
      const ringHalf = (a0: number, a1: number) => {
        const R = (0.15 + age * 1.5) * L.U, pts: Pt[] = [];
        for (let i = 0; i <= 80; i++) { const a = mix(a0, a1, i / 80); pts.push([DC[0] + Math.cos(a) * R, DC[1] + Math.sin(a) * R * Math.sin(tilt)]); }
        ribbon(pts, (3 + 4 * Math.exp(-age * 2)) * DPR, 1.3 * Math.exp(-age * 1.6) * Math.min(pk, 1.5), 0);
      };
      if (age < 2.2) { ringHalf(Math.PI, Math.PI * 2); ribBack = ribN; ringHalf(0, Math.PI); }
      arcs.forEach((g) => {
        const a = g.fig ? figToScreen(g.a[0], g.a[1], fo) : g.a, b = g.b(); const life = 1 - (t - g.t0) / Math.min(g.dur, 1e3);
        const pts = bolt(a, b, 0.22, g.seed + Math.floor(t * 30));
        ribbon(pts, (2.2 + 2 * charge) * DPR * g.w, (0.9 + 1.5 * charge) * Math.min(1, life * 3), 1);
        if (Math.random() < 0.5) ribbon(bolt(a, b, 0.3, g.seed * 7 + Math.floor(t * 30)), 1.2 * DPR, 0.35, 1);
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, ribBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, ribData, 0, ribN * RIB_STRIDE);

      /* ---- scene ---- */
      const sc = scene!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, sc.f); gl.viewport(0, 0, W, H);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tFig);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tAux);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tAtlas);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tTr);
      gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, tHalo);
      const uC = (P: typeof pBG) => { gl.uniform2f(P.u.uRes, W, H); gl.uniform1f(P.u.uTime, t); if (P.u.uDpr) gl.uniform1f(P.u.uDpr, DPR); if (P.u.uAtlas) gl.uniform1i(P.u.uAtlas, 2); };
      const uFig = (P: typeof pBG) => {
        const u = P.u; gl.uniform1i(u.uFig, 0); gl.uniform1i(u.uAux, 1); gl.uniform1i(u.uTrace, 3);
        gl.uniform2f(u.uFigSize, FIG.w, FIG.h); gl.uniform2f(u.uFO, fo[0], fo[1]); gl.uniform1f(u.uS, L.s); gl.uniform1f(u.uFront, front);
        gl.uniform2f(u.uMouseF, (mouse.x - fo[0]) / L.s, (mouse.y - fo[1]) / L.s); gl.uniform1f(u.uHover, hover);
      };
      const uRib = () => {
        gl.useProgram(pRib.p); uC(pRib); gl.uniform1i(pRib.u.uHalo, 6); gl.uniform2f(pRib.u.uFO, fo[0], fo[1]); gl.uniform1f(pRib.u.uS, L.s);
        gl.uniform4f(pRib.u.uHaloRect, ...halo.rect); gl.bindVertexArray(vRib);
      };

      gl.useProgram(pBG.p); uC(pBG);
      gl.uniform2f(pBG.u.uC, headC[0], (headC[1] + DC[1]) / 2); gl.uniform2f(pBG.u.uM, mouse.x, mouse.y); gl.uniform1f(pBG.u.uMOn, mouse.on);
      gl.uniform1f(pBG.u.uU, L.U); gl.uniform1f(pBG.u.uCharge, charge); gl.uniform1f(pBG.u.uBoot, boot);
      gl.uniform1f(pBG.u.uAxisX, DC[0]); gl.uniform1f(pBG.u.uHeadTop, headTop); gl.uniform1f(pBG.u.uPillar, smooth(T.pillar, T.pillar + 1, t)); gl.uniform1f(pBG.u.uFlash, flash);
      gl.bindVertexArray(vFS); gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.enable(gl.BLEND);
      const disk = (pass: number) => {
        gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(pDisk.p); uC(pDisk);
        gl.uniform2f(pDisk.u.uDC, DC[0], DC[1]); gl.uniform1f(pDisk.u.uU, L.U); gl.uniform1f(pDisk.u.uTilt, tilt); gl.uniform1f(pDisk.u.uPass, pass);
        gl.uniform1f(pDisk.u.uBoot, boot); gl.uniform1f(pDisk.u.uCharge, charge); gl.uniform1f(pDisk.u.uFlash, flash);
        gl.bindVertexArray(vDisk[cur]); gl.drawArrays(gl.POINTS, 0, N);
      };
      disk(0); // the far side, behind him
      if (ribBack) { gl.blendFunc(gl.ONE, gl.ONE); uRib(); gl.drawArrays(gl.TRIANGLES, 0, ribBack); }

      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(pMesh.p); uC(pMesh); uFig(pMesh);
      gl.uniform1f(pMesh.u.uCell, clamp(6 * DPR / L.s, 6, 40)); gl.uniform1f(pMesh.u.uGlitch, glitch); gl.uniform1f(pMesh.u.uSurge, surge);
      gl.bindVertexArray(vMesh); gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0);

      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(pVap.p); uC(pVap); uFig(pVap); gl.uniform1f(pVap.u.uAmt, 0.25 + 0.75 * Math.max(charge, flash)); gl.uniform1f(pVap.u.uU, L.U);
      gl.bindVertexArray(vVap); gl.drawArrays(gl.POINTS, 0, nVap);
      disk(1); // the near side, in front of him
      if (ribN > ribBack) { uRib(); gl.drawArrays(gl.TRIANGLES, ribBack, ribN - ribBack); }

      /* ---- bloom ---- */
      gl.disable(gl.BLEND);
      let src: Target = sc;
      gl.useProgram(pDown.p); gl.bindVertexArray(vFS);
      chain.forEach((dst, i) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.viewport(0, 0, dst.w, dst.h);
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, src.t); gl.uniform1i(pDown.u.uSrc, 4);
        gl.uniform2f(pDown.u.uTexel, 1 / src.w, 1 / src.h); gl.uniform1f(pDown.u.uThresh, i === 0 ? 0.8 : 0); gl.drawArrays(gl.TRIANGLES, 0, 3); src = dst;
      });
      gl.useProgram(pUp.p); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = chain.length - 1; i > 0; i--) {
        const s = chain[i], d = chain[i - 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, d.f); gl.viewport(0, 0, d.w, d.h);
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, s.t); gl.uniform1i(pUp.u.uSrc, 4); gl.uniform2f(pUp.u.uTexel, 1 / s.w, 1 / s.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);

      /* ---- composite ---- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
      gl.useProgram(pComp.p); uC(pComp);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, sc.t); gl.uniform1i(pComp.u.uScene, 4);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, chain[0].t); gl.uniform1i(pComp.u.uBloom, 5);
      gl.uniform1f(pComp.u.uBloomK, CONFIG.bloom * (1 + 0.5 * charge)); gl.uniform1f(pComp.u.uBoot, boot); gl.uniform1f(pComp.u.uFlash, flash);
      gl.uniform4f(pComp.u.uWave, DC[0], DC[1], (0.1 + age * 1.6) * L.U, age < 2.5 ? Math.exp(-age * 1.3) * Math.min(pk, 1.6) * 0.9 : 0);
      gl.bindVertexArray(vFS); gl.drawArrays(gl.TRIANGLES, 0, 3);

      frames++; dbg.frames = frames; msAcc += performance.now() - now;
      if (frames % 30 === 0) { if (msEl) msEl.textContent = `${(msAcc / 30).toFixed(1)} ms · ${N} bits`; msAcc = 0; }
      if (!raf && !still) raf = requestAnimationFrame(frame);
      else if (still && frames < 3 && !raf) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }
}
