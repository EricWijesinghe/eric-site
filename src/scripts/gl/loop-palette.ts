// The loop's colours come from the --sk-* tokens on #skills (skills.css), the single source of truth for
// both themes. Read at mount and whenever html[data-theme] changes, then eased numerically over
// THEME_MS so the canvas recolours with the CSS around it. Halo sprites are rebuilt while it eases.

export type Rgb = [number, number, number];

export interface Palette {
  hues: Rgb[];
  track: Rgb;
  trackA: number;
  caption: Rgb;
  core: Rgb;
  shell: Rgb;
  label: Rgb;
  knock: Rgb;
  /** 1 = dark theme (additive light), 0 = light theme (normal alpha ink). Eased like the colours. */
  glow: number;
}

const HUE_COUNT = 6;
const THEME_MS = 350;
const SPRITE_PX = 64;

let probe: CanvasRenderingContext2D | null = null;

/** Any CSS colour string to RGB, via the canvas's own parser (handles hex, rgb() and named colours). */
function toRgb(css: string, fallback: Rgb): Rgb {
  probe ??= document.createElement('canvas').getContext('2d');
  if (!probe || !css.trim()) return fallback;
  probe.fillStyle = '#000';
  probe.fillStyle = css.trim();
  const v = probe.fillStyle;
  if (v.startsWith('#')) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) as Rgb;
  const m = v.match(/[\d.]+/g);
  return m && m.length >= 3 ? [+m[0]!, +m[1]!, +m[2]!] : fallback;
}

function read(host: HTMLElement): Palette {
  const cs = getComputedStyle(host);
  const c = (name: string, fb: Rgb): Rgb => toRgb(cs.getPropertyValue(name), fb);
  const ice: Rgb = [191, 244, 255];
  return {
    hues: Array.from({ length: HUE_COUNT }, (_, i) => c(`--sk-h${i}`, [56, 225, 255])),
    track: c('--sk-track', ice),
    trackA: parseFloat(cs.getPropertyValue('--sk-track-a')) || 0.4,
    caption: c('--sk-caption', ice),
    core: c('--sk-core', [56, 225, 255]),
    shell: c('--sk-shell', ice),
    label: c('--sk-label', [243, 251, 255]),
    knock: c('--sk-knock', [2, 5, 11]),
    glow: parseFloat(cs.getPropertyValue('--sk-glow')) || 0,
  };
}

const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
const mixRgb = (a: Rgb, b: Rgb, k: number): Rgb => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];

function lerp(a: Palette, b: Palette, k: number): Palette {
  return {
    hues: b.hues.map((h, i) => mixRgb(a.hues[i] ?? h, h, k)),
    track: mixRgb(a.track, b.track, k),
    trackA: mix(a.trackA, b.trackA, k),
    caption: mixRgb(a.caption, b.caption, k),
    core: mixRgb(a.core, b.core, k),
    shell: mixRgb(a.shell, b.shell, k),
    label: mixRgb(a.label, b.label, k),
    knock: mixRgb(a.knock, b.knock, k),
    glow: mix(a.glow, b.glow, k),
  };
}

export const rgba = (c: Rgb, a: number): string =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

/** A soft round halo per hue, stamped with drawImage instead of shadowBlur (far cheaper per star). */
function buildSprite(c: Rgb, glow: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SPRITE_PX;
  const g = cv.getContext('2d');
  if (!g) return cv;
  const h = SPRITE_PX / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  // Dark: a bright core fading out (drawn additively). Light: a faint tinted disc under a solid dot.
  grad.addColorStop(0, rgba(c, mix(0.22, 0.9, glow)));
  grad.addColorStop(0.25, rgba(c, mix(0.12, 0.32, glow)));
  grad.addColorStop(1, rgba(c, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  return cv;
}

export class LoopPalette {
  now: Palette;
  sprites: HTMLCanvasElement[] = [];
  private from: Palette;
  private to: Palette;
  private t0 = -1;

  constructor(private host: HTMLElement) {
    this.now = this.from = this.to = read(host);
    this.rebuild();
  }

  /** Starts a numeric ease to the tokens now in force (call on theme change). */
  retarget(t: number, snap: boolean): void {
    this.from = this.now;
    this.to = read(this.host);
    this.t0 = snap ? -1 : t;
    if (snap) this.now = this.to;
    this.rebuild();
  }

  /** Advances the ease; returns true while it is still moving (the scene keeps drawing). */
  step(t: number): boolean {
    if (this.t0 < 0) return false;
    const k = Math.min(1, (t - this.t0) / THEME_MS);
    const e = k * k * (3 - 2 * k);
    this.now = lerp(this.from, this.to, e);
    this.rebuild();
    if (k >= 1) this.t0 = -1;
    return k < 1;
  }

  private rebuild(): void {
    this.sprites = this.now.hues.map((h) => buildSprite(h, this.now.glow));
  }
}
