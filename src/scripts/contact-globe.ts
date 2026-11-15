// "Work together": a living globe of signal. Eric (2026-11-16) wanted a cool graphic here, not an explanation:
// a dotted world turns in depth, links of light arc between points on it, a ring of binary orbits it, and three
// satellites (the colours of the three contact links below) beam packets down to the surface. Drag to spin it,
// the dots near the pointer light up, and a release in the hero sends a shock ring around the world.
// Canvas2D, theme-aware (live), pauses offscreen and in hidden tabs; reduced motion draws one still frame.

const DOTS = 900;
const ARCS = 7;
const SATS = 3;
const RING_GLYPHS = 44;
const SPIN = 0.12; // rad/s at rest
const TILT = 0.38;
const GLYPHS = ['0', '1', '1', '0', '1', '0', '0', '1'];

type V3 = [number, number, number];
interface Arc { a: V3; b: V3; t0: number; dur: number }

const DARK = { dot: '191 244 255', rim: '56 225 255', arc: ['#38e1ff', '#8b5cf6', '#2df5a0', '#e04cff'], sat: ['#38e1ff', '#8b5cf6', '#e04cff'], ring: '#38e1ff', blend: 'lighter' as GlobalCompositeOperation };
const LIGHT = { dot: '10 40 90', rim: '11 95 191', arc: ['#0b5fbf', '#5b2bd6', '#047857', '#a21caf'], sat: ['#0b5fbf', '#5b2bd6', '#a21caf'], ring: '#0b5fbf', blend: 'source-over' as GlobalCompositeOperation };

function fib(n: number): V3[] {
  const out: V3[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), t = ga * i;
    out.push([Math.cos(t) * r, y, Math.sin(t) * r]);
  }
  return out;
}
const POINTS = fib(DOTS);
const rnd = (): V3 => POINTS[Math.floor(Math.random() * DOTS)];
const slerp = (a: V3, b: V3, t: number, lift: number): V3 => {
  const d = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) || 1e-6;
  const s = Math.sin(d), wa = Math.sin((1 - t) * d) / s, wb = Math.sin(t * d) / s, h = 1 + lift * Math.sin(Math.PI * t);
  return [(a[0] * wa + b[0] * wb) * h, (a[1] * wa + b[1] * wb) * h, (a[2] * wa + b[2] * wb) * h];
};

export function mountGlobe(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const html = document.documentElement;
  const arcs: Arc[] = [];
  let W = 0, R = 0, dpr = 1, rot = 0, vel = SPIN, t = 0, last = 0, raf = 0, visible = false, shock = -1;
  const ptr = { x: -1e4, y: -1e4, down: false, px: 0 };

  function size(): void {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; R = W * 0.3; // satellites orbit at 1.55 R: everything stays inside the square
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(W * dpr);
  }
  const project = (p: V3): [number, number, number] => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const x = p[0] * c - p[2] * s, z0 = p[0] * s + p[2] * c;
    const ct = Math.cos(TILT), st = Math.sin(TILT);
    const y = p[1] * ct - z0 * st, z = p[1] * st + z0 * ct;
    return [W / 2 + x * R, W / 2 + y * R, z];
  };
  const newArc = (): Arc => ({ a: rnd(), b: rnd(), t0: t + Math.random() * 1.5, dur: 1.6 + Math.random() * 1.4 });
  for (let i = 0; i < ARCS; i++) arcs.push(newArc());

  function grid(pal: typeof DARK): void {
    // faint meridians and parallels give the world its shape
    ctx!.lineWidth = 1;
    for (let m = 0; m < 12; m++) {
      const lon = (m / 12) * Math.PI;
      ctx!.beginPath();
      for (let k = 0; k <= 48; k++) {
        const lat = (k / 48) * Math.PI * 2;
        const [x, y] = project([Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)]);
        if (k === 0) ctx!.moveTo(x, y); else ctx!.lineTo(x, y);
      }
      ctx!.strokeStyle = `rgb(${pal.rim} / 0.12)`; ctx!.stroke();
    }
    for (let q = 1; q < 6; q++) {
      const lat = -Math.PI / 2 + (q / 6) * Math.PI;
      ctx!.beginPath();
      for (let k = 0; k <= 64; k++) {
        const lon = (k / 64) * Math.PI * 2;
        const [x, y] = project([Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)]);
        if (k === 0) ctx!.moveTo(x, y); else ctx!.lineTo(x, y);
      }
      ctx!.strokeStyle = `rgb(${pal.rim} / 0.1)`; ctx!.stroke();
    }
  }

  function world(pal: typeof DARK): void {
    // the dotted world, back dots faint, dots near the pointer lit
    for (const p of POINTS) {
      const [x, y, z] = project(p);
      const near = Math.max(0, 1 - Math.hypot(x - ptr.x, y - ptr.y) / 70);
      const a = z > 0 ? 0.35 + 0.55 * z : 0.06 + 0.1 * (1 + z);
      ctx!.fillStyle = `rgb(${pal.dot} / ${Math.min(1, a + near * 0.8).toFixed(3)})`;
      ctx!.beginPath(); ctx!.arc(x, y, (z > 0 ? 1.3 : 0.9) + near * 2.2, 0, Math.PI * 2); ctx!.fill();
    }
    // arcs of light jumping between places, a packet riding each
    ctx!.lineCap = 'round';
    arcs.forEach((arc, i) => {
      const k = (t - arc.t0) / arc.dur;
      if (k < 0) return;
      if (k > 1.4) { arcs[i] = newArc(); return; }
      const col = pal.arc[i % pal.arc.length];
      const head = Math.min(1, k), tail = Math.max(0, k - 0.6);
      ctx!.strokeStyle = col; ctx!.lineWidth = 1.6; ctx!.globalAlpha = 0.9;
      ctx!.beginPath();
      for (let s = tail; s <= head + 1e-6; s += 0.04) {
        const [x, y] = project(slerp(arc.a, arc.b, s, 0.35));
        if (s === tail) ctx!.moveTo(x, y); else ctx!.lineTo(x, y);
      }
      ctx!.stroke();
      if (k <= 1) { const [x, y] = project(slerp(arc.a, arc.b, k, 0.35)); ctx!.globalAlpha = 1; ctx!.fillStyle = col; ctx!.beginPath(); ctx!.arc(x, y, 3.2, 0, Math.PI * 2); ctx!.fill(); }
    });
    ctx!.globalAlpha = 1;
  }

  function orbit(pal: typeof DARK): void {
    // a tilted ring of binary orbiting the world
    ctx!.font = '600 12px "JetBrains Mono", ui-monospace, monospace'; ctx!.textAlign = 'center'; ctx!.textBaseline = 'middle';
    for (let i = 0; i < RING_GLYPHS; i++) {
      const a = (i / RING_GLYPHS) * Math.PI * 2 + t * 0.25;
      const [x, y, z] = project([Math.cos(a) * 1.32, Math.sin(a) * 0.18, Math.sin(a) * 1.32]);
      ctx!.globalAlpha = z > 0 ? 0.85 : 0.18;
      ctx!.fillStyle = pal.ring;
      ctx!.fillText(GLYPHS[(i + Math.floor(t * 2)) % GLYPHS.length], x, y);
    }
    // three satellites, one per contact link, beaming packets to the surface
    for (let i = 0; i < SATS; i++) {
      const a = t * (0.35 + i * 0.12) + (i * Math.PI * 2) / SATS;
      const sp: V3 = [Math.cos(a) * 1.55, -0.55 + i * 0.5, Math.sin(a) * 1.55];
      const [sx, sy, sz] = project(sp);
      const ground = project([(sp[0] / 1.55) * 0.98, sp[1] * 0.5, (sp[2] / 1.55) * 0.98]);
      const col = pal.sat[i];
      ctx!.globalAlpha = sz > -0.3 ? 1 : 0.3;
      ctx!.strokeStyle = col; ctx!.lineWidth = 1; ctx!.setLineDash([3, 5]);
      ctx!.beginPath(); ctx!.moveTo(sx, sy); ctx!.lineTo(ground[0], ground[1]); ctx!.stroke(); ctx!.setLineDash([]);
      const f = (t * 0.9 + i * 0.33) % 1;
      ctx!.fillStyle = col;
      ctx!.beginPath(); ctx!.arc(sx + (ground[0] - sx) * f, sy + (ground[1] - sy) * f, 2.4, 0, Math.PI * 2); ctx!.fill();
      ctx!.beginPath(); ctx!.arc(sx, sy, 6, 0, Math.PI * 2); ctx!.fill();
      ctx!.globalAlpha *= 0.3; ctx!.beginPath(); ctx!.arc(sx, sy, 15, 0, Math.PI * 2); ctx!.fill();
    }
    ctx!.globalAlpha = 1;
  }

  function draw(): void {
    const pal = html.dataset.theme === 'light' ? LIGHT : DARK;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, W);
    ctx!.globalCompositeOperation = pal.blend;
    const g = ctx!.createRadialGradient(W / 2, W / 2, R * 0.85, W / 2, W / 2, R * 1.25); // atmosphere
    g.addColorStop(0, `rgb(${pal.rim} / 0)`); g.addColorStop(0.25, `rgb(${pal.rim} / 0.35)`); g.addColorStop(1, `rgb(${pal.rim} / 0)`);
    ctx!.fillStyle = g; ctx!.fillRect(0, 0, W, W);
    grid(pal); world(pal); orbit(pal);
    if (shock >= 0) { // the shock ring from a release in the hero
      const k = (t - shock) / 1.4;
      if (k > 1) shock = -1;
      else {
        ctx!.strokeStyle = `rgb(${pal.rim} / ${(0.9 * (1 - k)).toFixed(3)})`; ctx!.lineWidth = 2.5;
        ctx!.beginPath(); ctx!.arc(W / 2, W / 2, R * (1 + k * 0.6), 0, Math.PI * 2); ctx!.stroke();
      }
    }
  }

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    t += dt;
    if (!ptr.down) vel += (SPIN - vel) * Math.min(1, dt * 1.5);
    rot += vel * dt;
    draw();
    raf = visible && !document.hidden ? requestAnimationFrame(frame) : 0;
    if (!raf) last = 0;
  }
  const wake = (): void => { if (reduce) { draw(); return; } if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };

  size();
  new ResizeObserver(() => { size(); if (reduce || !raf) draw(); }).observe(canvas);
  new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; wake(); }).observe(canvas);
  document.addEventListener('visibilitychange', wake);
  new MutationObserver(() => { if (!raf) draw(); }).observe(html, { attributes: true, attributeFilter: ['data-theme'] });

  const local = (e: PointerEvent): void => { const r = canvas.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; };
  canvas.addEventListener('pointerdown', (e) => { ptr.down = true; ptr.px = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    local(e);
    if (ptr.down) { vel = (e.clientX - ptr.px) * 0.6; rot += (e.clientX - ptr.px) / R; ptr.px = e.clientX; }
    if (reduce) draw();
  });
  const up = (): void => { ptr.down = false; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => { ptr.x = ptr.y = -1e4; });
  addEventListener('m2c:release', () => { shock = t; for (let i = 0; i < arcs.length; i++) arcs[i] = { ...newArc(), t0: t + i * 0.08 }; wake(); });
  draw();
}
