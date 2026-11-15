// Eric (2026-11-16): energizing must reach the whole page and the circle around him must look powerful. While he
// charges, binary and code glyphs stream in from every edge of the screen, are captured by the energy ring around
// him and spiral inward, concentrating like matter falling into a black hole; the ring tightens and burns brighter.
// On release everything erupts outward from that core like a big bang, past every edge, and the page's headings
// surge for a moment. One fixed canvas over the page (pointer-events none, aria-hidden); it draws only while there
// is energy, so an idle page costs nothing. Glyphs stay faint over words and over his face. Reduced motion: off.

const GLYPHS = ['0', '1', '0', '1', '0', '1', '0x', 'fn', 'let', '->', '::', '{}', 'impl', 'u8', 'ff', 'c9'];
const MAX_FREE = 260;
const SPAWN_PER_S = 280; // glyphs entering from the screen edges at full charge
const SURGE_MS = 1300;
const BANG_S = 1.6;

// A glyph is free (flying in or blown out) or captured (spiralling in the ring: angle, radius, angular speed).
interface Glyph { x: number; y: number; vx: number; vy: number; g: string; hue: number; life: number; cap: boolean; a: number; r: number; w: number }

const DARK = { ink: ['#38e1ff', '#8b5cf6', '#2df5a0', '#e04cff', '#bff4ff'], hot: '191 244 255', edge: '56 225 255', violet: '139 92 246', blend: 'lighter' as GlobalCompositeOperation };
const LIGHT = { ink: ['#0b5fbf', '#5b2bd6', '#047857', '#a21caf', '#0a1830'], hot: '11 95 191', edge: '11 95 191', violet: '91 43 214', blend: 'source-over' as GlobalCompositeOperation };

export function mountEnergy(canvas: HTMLCanvasElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const html = document.documentElement;
  const stage = document.querySelector<HTMLElement>('.m2c-sing');
  let W = 0, H = 0, dpr = 1, level = 0, held = 0;
  let disc = { x: innerWidth * 0.7, y: innerHeight * 0.75, u: innerHeight * 0.7 }; // stage-relative until aimed
  let fig: { x: number; y: number; w: number; h: number } | null = null;
  let core: [number, number] = [0, 0], ringR = 200;
  const glyphs: Glyph[] = [];
  let bang = -1, raf = 0, last = 0, t = 0, spawnAcc = 0;
  const quiet: DOMRect[] = [];

  function size(): void {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  size();
  addEventListener('resize', size);
  addEventListener('m2c:layout', (e) => {
    const d = (e as CustomEvent<{ fig: typeof fig; disc?: typeof disc }>).detail;
    fig = d.fig;
    if (d.disc) disc = d.disc;
  });

  function aim(): void {
    const r = stage?.getBoundingClientRect();
    if (r) core = [r.left + disc.x, r.top + disc.y];
    ringR = disc.u * 0.5 * (1 - 0.22 * level); // the ring tightens as it gathers
    quiet.length = 0;
    document.querySelectorAll<HTMLElement>('.m2c-copy, main h2, main p, main .btn').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.bottom > 0 && b.top < H && b.width) quiet.push(b);
    });
    if (r && fig) quiet.push(new DOMRect(r.left + fig.x + fig.w * 0.22, r.top + fig.y, fig.w * 0.56, fig.h * 0.55)); // his face
  }
  const inQuiet = (x: number, y: number): boolean => quiet.some((b) => x > b.left - 8 && x < b.right + 8 && y > b.top - 8 && y < b.bottom + 8);
  const ring = (a: number, r: number): [number, number] => [core[0] + Math.cos(a) * r, core[1] + Math.sin(a) * r * 0.3]; // the disk plane, seen tilted

  function spawn(): void {
    const side = Math.floor(Math.random() * 4), s = Math.random();
    const x = side === 0 ? s * W : side === 1 ? W + 10 : side === 2 ? s * W : -10;
    const y = side === 0 ? -10 : side === 1 ? s * H : side === 2 ? H + 10 : s * H;
    glyphs.push({ x, y, vx: 0, vy: 0, g: GLYPHS[Math.floor(Math.random() * GLYPHS.length)], hue: Math.floor(Math.random() * 5), life: 1, cap: false, a: 0, r: 0, w: 0 });
  }

  function bigBang(k: number): void {
    bang = t;
    const n = Math.round(160 + 120 * k);
    for (const p of glyphs) { // everything captured is thrown out along its orbit's tangent and away from the core
      if (!p.cap) continue;
      const [x, y] = ring(p.a, p.r), out = Math.atan2(y - core[1], x - core[0]), sp = 520 + Math.random() * 600;
      Object.assign(p, { x, y, cap: false, vx: Math.cos(out) * sp, vy: Math.sin(out) * sp, life: 1 });
    }
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, sp = 420 + Math.random() * 900;
      glyphs.push({ x: core[0], y: core[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, g: GLYPHS[i % GLYPHS.length], hue: i % 5, life: 1, cap: false, a: 0, r: 0, w: 0 });
    }
  }

  function drawRing(pal: typeof DARK): void {
    const glow = Math.max(level, bang >= 0 ? Math.max(0, 1 - (t - bang) / 0.6) : 0);
    if (glow < 0.01) return;
    // the energy ring around him: a burning ellipse in the disk plane, wider glow behind a hot core line
    for (const [w, a] of [[16, 0.10], [7, 0.22], [2.2, 0.85]] as const) {
      ctx!.strokeStyle = `rgb(${w > 3 ? pal.violet : pal.hot} / ${(a * glow).toFixed(3)})`;
      ctx!.lineWidth = w * (0.7 + 0.6 * glow);
      ctx!.beginPath(); ctx!.ellipse(core[0], core[1], ringR, ringR * 0.3, 0, 0, Math.PI * 2); ctx!.stroke();
    }
    // the gathering core: a photon ring that shrinks and burns hotter as the energy concentrates
    const cr = 26 * (1.4 - level) + 4;
    const g = ctx!.createRadialGradient(core[0], core[1], cr * 0.5, core[0], core[1], cr * 3.2);
    g.addColorStop(0, `rgb(${pal.hot} / 0)`); g.addColorStop(0.35, `rgb(${pal.hot} / ${(0.7 * glow).toFixed(3)})`); g.addColorStop(1, `rgb(${pal.violet} / 0)`);
    ctx!.fillStyle = g; ctx!.beginPath(); ctx!.arc(core[0], core[1], cr * 3.2, 0, Math.PI * 2); ctx!.fill();
  }

  function drawBang(pal: typeof DARK): void {
    if (bang < 0) return;
    const k = (t - bang) / BANG_S;
    if (k >= 1) { bang = -1; return; }
    const R = k * Math.hypot(W, H) * 1.1;
    // the flash at the core, then a shell of light leaving the screen at every edge
    if (k < 0.25) {
      const f = ctx!.createRadialGradient(core[0], core[1], 0, core[0], core[1], 260);
      f.addColorStop(0, `rgb(${pal.hot} / ${(0.9 * (1 - k * 4)).toFixed(3)})`); f.addColorStop(1, `rgb(${pal.hot} / 0)`);
      ctx!.fillStyle = f; ctx!.fillRect(0, 0, W, H);
    }
    const s = ctx!.createRadialGradient(core[0], core[1], Math.max(0, R - 70), core[0], core[1], R + 8);
    s.addColorStop(0, `rgb(${pal.edge} / 0)`); s.addColorStop(0.85, `rgb(${pal.edge} / ${(0.5 * (1 - k)).toFixed(3)})`); s.addColorStop(1, `rgb(${pal.edge} / 0)`);
    ctx!.fillStyle = s; ctx!.fillRect(0, 0, W, H);
  }

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; t += dt;
    const pal = html.dataset.theme === 'light' ? LIGHT : DARK;
    held = level > 0.01 ? held + dt : 0;
    aim();
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, H);
    ctx!.globalCompositeOperation = pal.blend;
    if (level > 0.01) { // the screen's edges pull toward him
      const e = ctx!.createRadialGradient(core[0], core[1], Math.min(W, H) * 0.4, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      e.addColorStop(0, `rgb(${pal.edge} / 0)`); e.addColorStop(1, `rgb(${pal.edge} / ${(0.26 * level).toFixed(3)})`);
      ctx!.fillStyle = e; ctx!.fillRect(0, 0, W, H);
    }
    drawRing(pal);
    spawnAcc += SPAWN_PER_S * level * dt;
    while (spawnAcc >= 1 && glyphs.length < MAX_FREE * 2) { spawn(); spawnAcc -= 1; }
    ctx!.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
    ctx!.textAlign = 'center'; ctx!.textBaseline = 'middle';
    for (let i = glyphs.length - 1; i >= 0; i--) {
      const p = glyphs[i];
      let x: number, y: number, size = 1;
      if (p.cap) { // spiralling inward, faster the deeper it falls
        p.w += dt * (1.2 + 3 * level);
        p.a += p.w * dt;
        p.r *= 1 - dt * (0.25 + 0.9 * level);
        [x, y] = ring(p.a, p.r);
        size = 0.6 + 0.4 * (p.r / ringR);
        if (p.r < 6 || level < 0.01) p.life -= dt * 3;
      } else if (level > 0.01 && bang < 0) { // flying in toward the ring; captured on reaching it
        const dx = core[0] - p.x, dy = core[1] - p.y, d = Math.hypot(dx, dy) || 1;
        const sp = 240 + 620 * level;
        p.vx += ((dx / d) * sp - p.vx) * Math.min(1, dt * 3); p.vy += ((dy / d) * sp - p.vy) * Math.min(1, dt * 3);
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (d < ringR * 1.05) { p.cap = true; p.a = Math.atan2((p.y - core[1]) / 0.3, p.x - core[0]); p.r = Math.min(d, ringR); p.w = 2 + Math.random() * 2; }
        x = p.x; y = p.y;
      } else { // blown outward (the big bang), or fading out when the charge stops
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.986; p.vy *= 0.986;
        p.life -= dt * (bang >= 0 ? 0.55 : 1.8);
        x = p.x; y = p.y;
      }
      if (p.life <= 0 || x < -80 || x > W + 80 || y < -80 || y > H + 80) { glyphs.splice(i, 1); continue; }
      ctx!.globalAlpha = Math.max(0, Math.min(1, p.life)) * (inQuiet(x, y) ? 0.12 : p.cap ? 0.95 : 0.7);
      ctx!.fillStyle = pal.ink[p.hue];
      if (size !== 1) { ctx!.save(); ctx!.translate(x, y); ctx!.scale(size, size); ctx!.fillText(p.g, 0, 0); ctx!.restore(); }
      else ctx!.fillText(p.g, x, y);
    }
    ctx!.globalAlpha = 1;
    drawBang(pal);
    if (level > 0.01 || glyphs.length || bang >= 0) raf = requestAnimationFrame(frame);
    else { raf = 0; last = 0; ctx!.clearRect(0, 0, W, H); }
  }
  const wake = (): void => { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); };

  addEventListener('m2c:charge', (e) => {
    level = Math.max(0, Math.min(1, (e as CustomEvent<{ level: number }>).detail.level));
    html.style.setProperty('--m2c-energy', level.toFixed(3));
    if (level > 0.01) wake();
  });
  let surgeTimer = 0;
  addEventListener('m2c:release', (e) => {
    const d = (e as CustomEvent<{ k: number; auto: boolean }>).detail;
    if (d.auto) return; // an idle pulse stays inside the hero; only his own release reaches the whole page
    aim();
    bigBang(Math.min(1.5, Math.max(0.6, d.k)));
    wake();
    html.classList.add('m2c-surge');
    window.clearTimeout(surgeTimer);
    surgeTimer = window.setTimeout(() => html.classList.remove('m2c-surge'), SURGE_MS);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; } else wake(); });
}
