// Draws the still parts of the skills loop for one frame: track, gates, captions, the Rust core, the
// stars, the selected group's spokes and the canvas labels. The pulse and its morphs are loop-pulse.ts.
// Everything fades to nothing in the outer EDGE of the canvas (no frame, no mask, no seam).
import { ALL_STARS, PHASE_ARC, PHASES, RING, ordinal } from '../../data/spectrum';
import { lift, project3, projectRing, TAU, wrap, type Pluck, type Projected, type View } from './loop-geom';
import { rgba, type Palette } from './loop-palette';
import { spreadLabels, type LabelBox } from './orbit-spread';

export const FONT_PX = 12;
const MONO_FAMILY = '"JetBrains Mono", ui-monospace, monospace';
export const MONO = `${FONT_PX}px ${MONO_FAMILY}`;
/** Phase captions: the near one grows by this much, and none fades below this alpha (about 4.5:1 dark). */
const CAPTION_GROW_PX = 2;
const CAPTION_MIN_A = 0.85;
const EDGE = 0.12;
const TRACK_STEPS = 144;
// Inside the track, like lane markings: outside belongs to the skill names.
const CAPTION_R = 0.8;
const STAR_PX = 3.4;
const HALO_PX = 24;
const FLASH_MS = 900;
export const SPARK_MS = 1400;
const LABEL_GAP = 8;
/** Fraction of a phase arc from its middle: the caption is hidden inside the first, back by the second. */
const CAPTION_HIDE = [0.42, 0.58] as const;
/** Narrow phones keep only the two strongest names (the pulse's newest sparks, or the pick). */
const SMALL_W = 400;
const SMALL_LABELS = 2;
const FULL_A = 0.99;

export interface CoreState {
  spin: number;
  /** 0 = shell drifting, 1 = shell snapped to the crystal (after CHECK, from alignT; -1 = never). */
  align: number;
  alignT: number;
  /** Crystal edge the BREAK strike left flickering (-1 = none) and the edge healed at the last CHECK. */
  damaged: number;
  healed: number;
  damageT: number;
  healT: number;
}

export type LabelMode = 'front' | 'min';

export interface Frame {
  g: CanvasRenderingContext2D;
  w: number;
  h: number;
  t: number;
  v: View;
  pal: Palette;
  sprites: HTMLCanvasElement[];
  plucks: readonly Pluck[];
  /** Entry sweep 0..1 (1 = the whole track drawn) and per-star ignition 0..1. */
  sweep: number;
  ignite: Float32Array;
  phase: number;
  sel: number;
  hover: number;
  labels: LabelMode;
  /** Per ALL_STARS id: time of the last flash and of the last spark (name shown). */
  flash: Float64Array;
  spark: Float64Array;
  core: CoreState;
  /** Vertical px the canvas bleeds past the stage, top and bottom: the falloff starts there. */
  bleed: number;
  /** Ring angle of the pulse head, or -1 when no pulse is drawn. */
  pulse: number;
}

const smooth = (a: number, b: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Alpha multiplier that dissolves anything drawn near the canvas sides or in the bleed bands. */
export function edgeFade(f: Frame, x: number, y: number): number {
  const ex = EDGE * f.w;
  return smooth(0, ex, x) * smooth(0, ex, f.w - x) * smooth(0, f.bleed, y) * smooth(0, f.bleed, f.h - y);
}

/** Depth to alpha: the near side reads brighter than the far side. */
export const depthAlpha = (z: number): number => 0.42 + 0.58 * ((1 - z) / 2);
/** Depth alpha for the theme: ink on the light page keeps a higher floor, so far marks hold 3:1 (WCAG 1.4.11). */
const LIGHT_DEPTH_LIFT = 0.75;
export const depthK = (f: Frame, z: number): number => {
  const d = depthAlpha(z);
  return d + (1 - d) * LIGHT_DEPTH_LIFT * (1 - f.pal.glow);
};

export const starPos = (f: Frame, i: number, out?: Projected): Projected => {
  if (i === 0) return coreCentre(f, out);
  const s = ALL_STARS[i]!;
  return projectRing(s.angle, lift(s.angle, f.t, f.plucks), f.v, 1, out);
};

const CORE_H = 0.16;
export const coreCentre = (f: Frame, out?: Projected): Projected => project3(0, CORE_H, 0, f.v, out);

const tmpA: Projected = { x: 0, y: 0, s: 1, z: 0 };
const tmpB: Projected = { x: 0, y: 0, s: 1, z: 0 };

/** The track, one hairline whose alpha follows depth; the active phase's arc is drawn at 2 px. */
export function drawTrack(f: Frame, near: boolean): void {
  const { g, pal } = f;
  const reach = f.sweep * TAU;
  for (let i = 0; i < TRACK_STEPS; i++) {
    const a0 = (i / TRACK_STEPS) * TAU;
    if (a0 > reach) break;
    const a1 = Math.min(((i + 1) / TRACK_STEPS) * TAU, reach);
    const p = projectRing(a0, lift(a0, f.t, f.plucks), f.v, 1, tmpA);
    if (p.z <= 0 !== near) continue;
    const q = projectRing(a1, lift(a1, f.t, f.plucks), f.v, 1, tmpB);
    const active = Math.floor(a0 / PHASE_ARC) === f.phase;
    const a = pal.trackA * depthK(f, p.z) * edgeFade(f, p.x, p.y) * (active ? 1.6 : 1);
    g.strokeStyle = rgba(active ? pal.caption : pal.track, a);
    g.lineWidth = active ? 2 : 1;
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(q.x, q.y);
    g.stroke();
  }
}

/** Five gate ticks across the track and the phase captions just outside it. */
export function drawGates(f: Frame, near: boolean, captions: 'all' | 'front', avoid: readonly LabelBox[]): void {
  const { g, pal } = f;
  g.font = MONO;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  PHASES.forEach((ph, k) => {
    const a = k * PHASE_ARC;
    if (a > f.sweep * TAU) return;
    const p = projectRing(a, 0, f.v, 0.95, tmpA);
    if (p.z <= 0 !== near) return;
    const q = projectRing(a, 0, f.v, 1.05, tmpB);
    g.strokeStyle = rgba(pal.caption, 0.7 * depthK(f, p.z) * edgeFade(f, p.x, p.y));
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(q.x, q.y);
    g.stroke();
    const c = projectRing(a + PHASE_ARC / 2, 0, f.v, CAPTION_R, tmpA);
    if (captions === 'front' && k !== f.phase) return;
    // Every caption stays readable (canvas text is invisible to axe): depth shows in size, not in fading.
    const px = FONT_PX + Math.round(CAPTION_GROW_PX * ((1 - c.z) / 2));
    g.font = `${px}px ${MONO_FAMILY}`;
    // A caption steps aside while the pulse's morph is drawn inside its own arc, and for any skill name over it.
    const clear = f.pulse < 0 ? 1 : smooth(CAPTION_HIDE[0] * PHASE_ARC, CAPTION_HIDE[1] * PHASE_ARC, Math.abs(wrap(a + PHASE_ARC / 2 - f.pulse)));
    const hw = g.measureText(`${ordinal(k)} ${ph.name}`).width / 2;
    if (avoid.some((b) => Math.abs(b.x - c.x) < b.hw + hw && Math.abs(b.y - c.y) < b.hh + px / 2)) return;
    g.fillStyle = rgba(pal.caption, clear * Math.max(CAPTION_MIN_A, depthK(f, c.z)) * edgeFade(f, c.x, c.y) * smooth(0.2, 1, f.sweep));
    g.fillText(`${ordinal(k)} ${ph.name}`, c.x, c.y);
  });
  g.font = MONO;
}

/* ---------- the Rust core: an icosahedron crystal inside an octahedron shell ---------- */

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO: [number, number, number][] = [];
for (const [a, b] of [[1, PHI], [-1, PHI], [1, -PHI], [-1, -PHI]] as const)
  ICO.push([0, a, b], [a, b, 0], [b, 0, a]);
const ICO_EDGES: [number, number][] = [];
ICO.forEach((p, i) =>
  ICO.forEach((q, j) => {
    // Neighbours on an icosahedron with these coordinates sit exactly 2 apart.
    if (j > i && Math.abs(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) - 2) < 1e-6) ICO_EDGES.push([i, j]);
  }),
);
export const CORE_EDGE_COUNT = ICO_EDGES.length;
const OCT: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const OCT_EDGES: [number, number][] = [];
// Every pair of octahedron vertices is an edge except the opposite pairs.
OCT.forEach((p, i) => OCT.forEach((q, j) => j > i && !p.every((v, k) => v === -q[k]!) && OCT_EDGES.push([i, j])));

const ICO_R = 0.13 / Math.hypot(1, PHI);
const OCT_R = 0.24;
const CORE_TIP = 0.5;

function wire(f: Frame, pts: [number, number, number][], edges: [number, number][], r: number, rot: number, style: (e: number, z: number) => [number, number]): void {
  const { g } = f;
  const cy = Math.cos(rot);
  const sy = Math.sin(rot);
  const ct = Math.cos(CORE_TIP);
  const st = Math.sin(CORE_TIP);
  const proj = pts.map(([x, y, z]) => {
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y2 = y * ct - z1 * st;
    const z2 = y * st + z1 * ct;
    const q = project3(x1 * r, CORE_H + y2 * r, z2 * r, f.v, { x: 0, y: 0, s: 1, z: 0 });
    q.z = z2 / Math.hypot(x, y, z); // depth on the solid's own -1..1 scale, for alpha
    return q;
  });
  edges.forEach(([i, j], e) => {
    const p = proj[i]!;
    const q = proj[j]!;
    const [a, wdt] = style(e, (p.z + q.z) / 2);
    if (a <= 0.002) return;
    g.lineWidth = wdt;
    g.globalAlpha = a;
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(q.x, q.y);
    g.stroke();
  });
  g.globalAlpha = 1;
}

export function drawCore(f: Frame): void {
  const { g, pal, core } = f;
  const c = coreCentre(f, tmpA);
  const fade = edgeFade(f, c.x, c.y) * smooth(0, 0.4, f.sweep);
  const sel = f.sel === 0 || f.hover === 0 ? 1 : 0;
  if (pal.glow > 0.01) {
    const rad = f.v.r * 0.42;
    const grad = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, rad);
    grad.addColorStop(0, rgba(pal.core, (0.2 + 0.12 * sel) * pal.glow * fade));
    grad.addColorStop(1, rgba(pal.core, 0));
    g.fillStyle = grad;
    g.fillRect(c.x - rad, c.y - rad, rad * 2, rad * 2);
  }
  const heal = Math.exp(-(f.t - core.healT) / 2500);
  const flicker = core.damaged >= 0 ? 0.25 + 0.75 * Math.abs(Math.sin(f.t * 0.031) * Math.sin(f.t * 0.017)) : 1;
  g.strokeStyle = rgba(pal.core, 1);
  wire(f, ICO, ICO_EDGES, ICO_R, core.spin, (e, z) => {
    const base = (0.5 + 0.45 * depthK(f, z) + 0.25 * sel) * fade;
    if (e === core.damaged) return [base * flicker, 1.2];
    if (e === core.healed) return [Math.min(1, base * (1 + heal)), 1.2 + heal];
    return [base, 1.2];
  });
  g.strokeStyle = rgba(pal.shell, 1);
  const drift = 0.6 * Math.sin(f.t * 0.00021) + 0.5;
  wire(f, OCT, OCT_EDGES, OCT_R, core.spin + drift * (1 - core.align), (_e, z) => [(0.28 + 0.3 * depthK(f, z)) * fade, 1]);
}

/* ---------- stars, lock ring, spokes ---------- */

export function drawStars(f: Frame, near: boolean): void {
  const { g, pal } = f;
  const additive = pal.glow > 0.5;
  for (let i = 1; i < ALL_STARS.length; i++) {
    const p = starPos(f, i, tmpA);
    if (p.z <= 0 !== near) continue;
    const s = ALL_STARS[i]!;
    const lit = f.ignite[i - 1] ?? 1;
    if (lit <= 0) continue;
    const flash = Math.max(0, 1 - (f.t - f.flash[i]!) / FLASH_MS);
    const focus = i === f.sel || i === f.hover ? 1 : 0;
    const a = depthK(f, p.z) * edgeFade(f, p.x, p.y) * lit;
    const hue = pal.hues[s.group]!;
    const halo = HALO_PX * p.s * (1 + 0.8 * flash + 0.5 * focus);
    g.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    g.globalAlpha = Math.min(1, a * (0.75 + flash));
    g.drawImage(f.sprites[s.group]!, p.x - halo / 2, p.y - halo / 2, halo, halo);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const r = STAR_PX * p.s * (1 + 0.35 * flash + 0.3 * focus);
    g.beginPath();
    g.arc(p.x, p.y, r, 0, TAU);
    g.fillStyle = rgba(additive ? [255, 255, 255] : hue, a);
    if (!additive) {
      g.lineWidth = 1;
      g.strokeStyle = rgba(pal.knock, a);
      g.fill();
      g.stroke();
    } else {
      g.fill();
      g.beginPath();
      g.arc(p.x, p.y, r + 1.2, 0, TAU);
      g.strokeStyle = rgba(hue, a);
      g.lineWidth = 1.4;
      g.stroke();
    }
  }
}

/** A slow four-arc lock ring around the selected star (or the core). */
export function drawLock(f: Frame): void {
  if (f.sel < 0) return;
  const { g, pal } = f;
  const p = starPos(f, f.sel, tmpA);
  const hue = f.sel === 0 ? pal.core : pal.hues[ALL_STARS[f.sel]!.group]!;
  const r = (f.sel === 0 ? f.v.r * 0.3 : 12 * p.s) + 2 * Math.sin(f.t * 0.003);
  const rot = f.t * 0.0007;
  g.strokeStyle = rgba(hue, 0.95 * edgeFade(f, p.x, p.y));
  g.lineWidth = 1.5;
  for (let k = 0; k < 4; k++) {
    const a = rot + (k * TAU) / 4;
    g.beginPath();
    g.arc(p.x, p.y, r, a + 0.25, a + TAU / 4 - 0.25);
    g.stroke();
  }
}

const SPOKE_STEPS = 18;
const SPOKE_LIFT = 0.22;

/** Curved spokes from the core to every member of the selected star's group, a dash travelling out. */
export function drawSpokes(f: Frame): void {
  const focus = f.sel >= 0 ? f.sel : f.hover;
  if (focus < 0) return;
  const { g, pal } = f;
  const group = ALL_STARS[focus]!.group;
  const hue = pal.hues[group]!;
  g.setLineDash([5, 7]);
  g.lineDashOffset = -f.t * 0.02;
  g.lineWidth = 1.2;
  RING.forEach((s) => {
    if (s.group !== group) return;
    const end = lift(s.angle, f.t, f.plucks);
    g.beginPath();
    for (let k = 0; k <= SPOKE_STEPS; k++) {
      const u = k / SPOKE_STEPS;
      const a = s.angle + f.v.yaw;
      const h = (1 - u) * 0.16 + u * end + SPOKE_LIFT * 4 * u * (1 - u);
      const p = project3(Math.cos(a) * u, h, Math.sin(a) * u, f.v, tmpA);
      if (k) g.lineTo(p.x, p.y);
      else g.moveTo(p.x, p.y);
    }
    const tip = starPos(f, ALL_STARS.indexOf(s), tmpB);
    g.strokeStyle = rgba(hue, (f.sel >= 0 ? 0.7 : 0.4) * edgeFade(f, tip.x, tip.y));
    g.stroke();
  });
  g.setLineDash([]);
}

/* ---------- labels: radially outward, three tiers, knockout stroke, no pills ---------- */

export interface Label extends LabelBox {
  text: string;
  sx: number;
  sy: number;
  a: number;
}

const FRONT_Z = -0.45;
const TIER_PX = [16, 30, 44] as const;

/** Places the visible skill names (radially outward, tiered, spread apart); drawn later by paintLabels. */
export function layoutLabels(f: Frame): Label[] {
  const { g } = f;
  g.font = MONO;
  const centre = project3(0, 0, 0, f.v, tmpB);
  const cx = centre.x;
  const cy = centre.y;
  const out: Label[] = [];
  let tier = 0;
  const group = f.sel > 0 ? ALL_STARS[f.sel]!.group : -1;
  for (let i = 1; i < ALL_STARS.length; i++) {
    const s = ALL_STARS[i]!;
    const p = starPos(f, i, tmpA);
    const sparkK = Math.max(0, 1 - (f.t - f.spark[i]!) / SPARK_MS);
    const front = f.labels === 'front' && p.z < FRONT_Z && (f.ignite[i - 1] ?? 1) >= 1;
    const show = i === f.sel || i === f.hover || sparkK > 0 || front || (f.labels === 'front' && s.group === group);
    if (!show) continue;
    const k = i === f.sel || i === f.hover ? 1 : Math.max(sparkK > 0 ? smooth(0, 0.25, sparkK) : 0, front ? smooth(FRONT_Z, FRONT_Z - 0.25, p.z) : 0, s.group === group ? 1 : 0);
    const dx = p.x - cx;
    const dy = (p.y - cy) * 1.6;
    const len = Math.hypot(dx, dy) || 1;
    const off = TIER_PX[tier++ % TIER_PX.length]!;
    const hw = g.measureText(s.name).width / 2 + 3;
    out.push({ text: s.name, sx: p.x, sy: p.y, x: p.x + (dx / len) * (off + hw * 0.6), y: p.y + (dy / len) * off, hw, hh: FONT_PX / 2 + 2, a: k * edgeFade(f, p.x, p.y) });
  }
  if (f.w <= SMALL_W && out.length > SMALL_LABELS) {
    out.sort((p, q) => q.a - p.a);
    out.length = SMALL_LABELS;
  }
  spreadLabels(out, { width: f.w, height: f.h, pad: 4 }, LABEL_GAP);
  // A fading name never draws through a fully lit one: it goes at once instead of ghosting under it.
  for (const l of out) {
    if (l.a >= FULL_A) continue;
    if (out.some((m) => m.a >= FULL_A && Math.abs(m.x - l.x) < m.hw + l.hw && Math.abs(m.y - l.y) < m.hh + l.hh)) l.a = 0;
  }
  return out;
}

export function paintLabels(f: Frame, out: readonly Label[]): void {
  const { g, pal } = f;
  g.font = MONO;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  for (const l of out) {
    const a = l.a * edgeFade(f, l.x, l.y);
    if (a <= 0.01) continue;
    g.strokeStyle = rgba(pal.caption, 0.45 * a);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(l.sx, l.sy);
    g.lineTo(l.x - Math.sign(l.x - l.sx) * Math.min(l.hw, Math.abs(l.x - l.sx)) * 0.9, l.y);
    g.stroke();
    g.strokeStyle = rgba(pal.knock, 0.9 * a);
    g.lineWidth = 3;
    g.strokeText(l.text, l.x, l.y);
    g.fillStyle = rgba(pal.label, a);
    g.fillText(l.text, l.x, l.y);
  }
}
