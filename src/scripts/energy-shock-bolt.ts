// Lightning for the charge's electric shocks: the page's objects (energy-shock.ts) and the name's thunder
// (energy-shock-name.ts). Eric (round 12): "thundering also not realistic". The first cut re-randomised every bolt
// every frame (a boiling scribble), drew one even-width line and had no forks. Real lightning keeps ONE channel for
// its whole life, forks into thinner branches that die out, is brightest and widest at its root, and strobes: a
// stroke, dark, a re-strike down the same channel, then a faint last one. So the channel is built once per bolt,
// branches hang off it, the width tapers, and the brightness follows a fixed re-strike pattern instead of noise.

export interface Path { xs: number[]; ys: number[] }
export interface Bolt { main: Path; forks: Path[]; seed: number }

const LEVELS = 6; // 65 points: fine kinks at every scale, still cheap for dozens of bolts
const DECAY = 0.52; // each finer level's kinks reach this share of the coarser one's
const FORK_P = 0.09, FORK_LEN = [0.18, 0.42] as const, FORK_TURN = [0.35, 0.8] as const; // per point; share of the chord; radians

function channel(ax: number, ay: number, bx: number, by: number, rough: number, levels: number): Path {
  let xs = [ax, bx], ys = [ay, by], k = rough;
  for (let l = 0; l < levels; l++) {
    const nx: number[] = [xs[0]], ny: number[] = [ys[0]];
    for (let i = 1; i < xs.length; i++) {
      const dx = xs[i] - xs[i - 1], dy = ys[i] - ys[i - 1], off = (Math.random() - 0.5) * 2 * k;
      // the kink is perpendicular to this segment, so the channel keeps heading from a to b
      nx.push(xs[i - 1] + dx / 2 - dy * off, xs[i]);
      ny.push(ys[i - 1] + dy / 2 + dx * off, ys[i]);
    }
    xs = nx; ys = ny; k *= DECAY;
  }
  return { xs, ys };
}

/** A bolt from a to b with its forks; `rough` is the first kink's reach as a share of the chord. Build it once. */
export function bolt(ax: number, ay: number, bx: number, by: number, rough = 0.3, forks = true): Bolt {
  const main = channel(ax, ay, bx, by, rough, LEVELS), out: Path[] = [];
  const chord = Math.hypot(bx - ax, by - ay), dir = Math.atan2(by - ay, bx - ax);
  if (forks && chord > 24) {
    for (let i = 4; i < main.xs.length - 8; i++) {
      if (Math.random() > FORK_P) continue;
      const turn = (Math.random() < 0.5 ? -1 : 1) * (FORK_TURN[0] + Math.random() * (FORK_TURN[1] - FORK_TURN[0]));
      const len = chord * (FORK_LEN[0] + Math.random() * (FORK_LEN[1] - FORK_LEN[0])) * (1 - i / main.xs.length);
      const x = main.xs[i], y = main.ys[i];
      out.push(channel(x, y, x + Math.cos(dir + turn) * len, y + Math.sin(dir + turn) * len, rough * 1.2, LEVELS - 2));
    }
  }
  return { main, forks: out, seed: Math.random() };
}

/** Every point of a bolt, forks included, so a caller can keep the whole of it clear of something. */
export const boltPoints = (b: Bolt): Path[] => [b.main, ...b.forks];

/** Brightness over a bolt's life (age 0..1): stroke, dark gap, re-strike, faint last stroke. The seed shifts it. */
export function strobe(age: number, seed: number): number {
  const g = 0.22 + 0.1 * seed; // the first stroke's length
  if (age < g) return 1;
  if (age < g + 0.12) return 0.08;
  if (age < g + 0.34) return 0.85 * (1 - (age - g - 0.12) / 0.5);
  if (age < g + 0.44) return 0.05;
  return age < 1 ? 0.45 * (1 - age) : 0;
}

function stroke(ctx: CanvasRenderingContext2D, p: Path, col: string, alpha: number, w0: number, w1: number): void {
  // drawn in a few runs whose width steps down along the channel: a taper without a stroke per segment
  const RUNS = 4, n = p.xs.length - 1;
  ctx.strokeStyle = `rgba(${col},${Math.min(1, alpha).toFixed(3)})`;
  for (let r = 0; r < RUNS; r++) {
    const i0 = Math.floor((n * r) / RUNS), i1 = Math.floor((n * (r + 1)) / RUNS);
    ctx.lineWidth = w0 + ((w1 - w0) * r) / (RUNS - 1);
    ctx.beginPath();
    ctx.moveTo(p.xs[i0], p.ys[i0]);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(p.xs[i], p.ys[i]);
    ctx.stroke();
  }
}

/**
 * Wide soft glow, then the thin hot core; forks thinner and dimmer. rgb triplets as 'r,g,b'. `air` scales the widest
 * glow: on the light page it is ink, not light, and at full strength it smeared into blue blobs round each bolt.
 */
export function strokeBolt(ctx: CanvasRenderingContext2D, b: Bolt, glow: string, core: string, alpha: number, width: number, air = 1): void {
  if (alpha <= 0.01) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  stroke(ctx, b.main, glow, alpha * 0.14 * air, width * 4, width * 2); // the air it lights
  stroke(ctx, b.main, glow, alpha * 0.4, width * 2.2, width * 1);
  for (const f of b.forks) {
    stroke(ctx, f, glow, alpha * 0.32, width * 1.8, width * 0.5);
    stroke(ctx, f, core, alpha * 0.6, width * 0.6, width * 0.2);
  }
  stroke(ctx, b.main, core, alpha, width, width * 0.45);
}
