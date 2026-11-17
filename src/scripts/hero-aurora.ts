// Colourful light behind the copy: slow nebula blooms across the stage's spectrum. They are drawn with
// additive blending as light, not shapes, and kept faint so the name and the copy stay AA readable.
import { clamp } from './hero-loop';
import { inkNow } from './hero-theme';

interface Bloom { rgb: string; x: number; y: number; r: number; speed: number; phase: number }

// Ratios of the stage box. The figure's side (right) gets the dimmer blooms so he still dominates it.
const BLOOMS: readonly Bloom[] = [
  { rgb: '56,225,255', x: 0.16, y: 0.3, r: 0.5, speed: 0.07, phase: 0 },
  { rgb: '75,60,255', x: 0.4, y: 0.8, r: 0.46, speed: 0.05, phase: 1.7 },
  { rgb: '139,92,246', x: 0.04, y: 0.7, r: 0.42, speed: 0.06, phase: 3.1 },
  { rgb: '224,76,255', x: 0.5, y: 0.12, r: 0.36, speed: 0.045, phase: 4.4 },
  { rgb: '45,245,160', x: 0.28, y: 0.5, r: 0.34, speed: 0.08, phase: 2.2 },
  { rgb: '31,111,209', x: 0.9, y: 0.06, r: 0.44, speed: 0.04, phase: 5 },
];
const DRIFT = 0.07; // share of the box a bloom wanders by
const BASE_ALPHA = 0.2;
const CHARGE_ALPHA = 0.1;
const LIGHT_BLOOM = 0.55;
const TAU = Math.PI * 2;

/** Paints the blooms at time `t` (seconds). `c` is the charge level, which brightens them. */
export function drawAurora(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, c: number): void {
  const unit = Math.max(w, h);
  const ink = inkNow();
  ctx.save();
  ctx.globalCompositeOperation = ink.blend;
  for (const b of BLOOMS) {
    const cx = (b.x + DRIFT * Math.sin(t * b.speed * TAU + b.phase)) * w;
    const cy = (b.y + DRIFT * Math.cos(t * b.speed * TAU * 0.8 + b.phase)) * h;
    const r = b.r * unit;
    // Light: pastel blooms over pearl, so the same spectrum sits at lower alpha with normal compositing.
    const a = clamp((BASE_ALPHA + CHARGE_ALPHA * c) * (ink.light ? LIGHT_BLOOM : 1), 0, 1);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(${b.rgb},${a.toFixed(3)})`);
    grad.addColorStop(0.45, `rgba(${b.rgb},${(a * 0.35).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${b.rgb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
}
