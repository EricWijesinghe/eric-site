// The Signal palette for the Projects scenes, dark and pearl, and the page-theme state that picks between them.
// Canvas cannot read CSS variables cheaply, so the values live here; every scene reads them through the
// PALETTE/RGB proxies, so a theme switch takes effect on the next draw.
// Scenes follow the page theme. Dark is the Signal palette (mirrors the --sig-* tokens of
// global.css); light is a pearl set with the same hues, deeper so strokes read on white and drawn
// at normal alpha. Canvas cannot read CSS variables cheaply, so the values live here.
const DARK_P = {
  void: '#02050b',
  deep: '#050d1a',
  navy: '#0a1830',
  blue: '#12386a',
  azure: '#1f6fd1',
  cyan: '#38e1ff',
  teal: '#19d3c5',
  ice: '#bff4ff',
  white: '#f3fbff',
  indigo: '#4b3cff',
  violet: '#8b5cf6',
  magenta: '#e04cff',
  emerald: '#2df5a0',
  alert: '#ff5d73', // threat marks only, in tiny doses (UNICRON, the fuzzer's crash, a blocked prompt)
};
const LIGHT_P: typeof DARK_P = {
  void: '#eef7fc',
  deep: '#e2f0f8',
  navy: '#d6e8f4',
  blue: '#8fb8d8',
  azure: '#1f6fd1',
  cyan: '#0a5a9c', // ink-cyan: strokes read at 3:1+ on pearl (the dark cyan hologram is unchanged)
  teal: '#0c8c86',
  ice: '#0a4f6b',
  white: '#06203a',
  indigo: '#4b3cff',
  violet: '#7c4dff',
  magenta: '#c02fd6',
  emerald: '#119e6a',
  alert: '#e0344f',
};

/** A box in the painter's frame, and a point in it. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Pt {
  x: number;
  y: number;
}

/** Triplets for the aurora, tints and glyphs, which need alpha at draw time. */
export type Rgb = readonly [number, number, number];
const DARK_RGB = {
  indigo: [75, 60, 255],
  violet: [139, 92, 246],
  magenta: [224, 76, 255],
  emerald: [45, 245, 160],
  azure: [31, 111, 209],
  cyan: [56, 225, 255],
} as const satisfies Record<string, Rgb>;
const LIGHT_RGB = {
  indigo: [75, 60, 255],
  violet: [110, 70, 235],
  magenta: [192, 47, 214],
  emerald: [17, 158, 106],
  azure: [25, 100, 200],
  cyan: [10, 90, 156],
} as const satisfies Record<string, Rgb>;

// Theme state: data-theme wins; without it the scene follows the system preference, as global.css does.
const lightMedia = window.matchMedia('(prefers-color-scheme: light)');
let light = false;
const themeSubs = new Set<() => void>();
function readTheme(): void {
  const t = document.documentElement.dataset.theme;
  light = t ? t === 'light' : lightMedia.matches;
}
function notifyTheme(): void {
  readTheme();
  themeSubs.forEach((fn) => fn());
}
readTheme();
new MutationObserver(notifyTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});
lightMedia.addEventListener('change', notifyTheme);

/** True on the pearl (light) palette, for the few drawings that switch a fill rather than a tint. */
export const isLight = (): boolean => light;

/** Runs `fn` whenever the page theme changes, so a scene repaints in the new palette at once. */
export function onThemeChange(fn: () => void): void {
  themeSubs.add(fn);
}

// Read through proxies: every draw sees the theme in force, including colours captured at load.
type PaletteKey = keyof typeof DARK_P;
export type RgbKey = keyof typeof DARK_RGB;
export const PALETTE: Readonly<Record<PaletteKey, string>> = new Proxy({} as Record<PaletteKey, string>, {
  get: (_t, k) => (light ? LIGHT_P : DARK_P)[k as PaletteKey],
});
export const RGB: Readonly<Record<RgbKey, Rgb>> = new Proxy({} as Record<RgbKey, Rgb>, {
  get: (_t, k) => (light ? LIGHT_RGB : DARK_RGB)[k as RgbKey],
});

// Channel triplets for raw rgb() strings: caption ink, glass fills and hairlines per theme.
export const txt = (): string => (light ? '6 32 58' : '191 244 255');
export const glass = (): string => (light ? '255 255 255' : '10 24 48');
export const hair = (): string => (light ? '10 60 90' : '120 220 255');
/** The bright flash of the seal: white on pearl, ice on void. */
export const flashRgb = (): string => (light ? '255 255 255' : '243 251 255');
/**
 * Theme ink at alpha `a`: text and captions. On pearl, alpha is lifted so every caption keeps its contrast;
 * the hierarchy comes from size and position, not from fading the words out.
 */
export const ink = (a: number): string => `rgb(${txt()} / ${light ? Math.min(1, a * 0.2 + 0.8) : a})`;
/**
 * A palette colour at alpha `a`. On pearl, strokes and fills are scaled up so meaningful marks stay visible;
 * `raw` skips that for washes (aurora, glows) that must stay soft on light too.
 */
export const tint = (k: RgbKey, a: number): string => rgbOf(k, light ? Math.min(1, a * 1.8) : a);
export const rgbOf = (k: RgbKey, a: number): string => `rgb(${RGB[k].join(' ')} / ${a})`;
/**
 * Ink ramp for light-theme lines. Rings, grids and bench lines are drawn in these deep blues (never the pale
 * fills), so a meaningful stroke keeps 3:1 against pearl (WCAG 1.4.11). Hues without an ink entry keep LIGHT_RGB.
 */
const LIGHT_INK: Partial<Record<RgbKey, Rgb>> = {
  cyan: [10, 63, 134], // #0a3f86
  azure: [31, 111, 209], // #1f6fd1
  indigo: [75, 60, 255], // #4b3cff
};
// Measured: ink #0a3f86 at 0.6 over pearl is about 2.2:1 (below 3:1), at 0.85 about 4:1. Hence 0.85, not 0.6.
const LINE_FLOOR = 0.85;
/**
 * A line stroke (rings, bench lines, grids, rules) at alpha `a`. On pearl it never drops below LINE_FLOOR, so a
 * meaningful line keeps 3:1 against the ground (WCAG 1.4.11). Fills keep `tint`, which stays pale on light.
 */
export const stroke = (k: RgbKey, a: number): string => {
  if (!light) return rgbOf(k, a);
  return `rgb(${(LIGHT_INK[k] ?? RGB[k]).join(' ')} / ${Math.max(LINE_FLOOR, Math.min(1, a * 1.8))})`;
};
/** The hairline colour for rules and grids at alpha `a`; on pearl it is lifted to the same floor. */
export const hairline = (a: number): string => `rgb(${hair()} / ${light ? Math.max(LINE_FLOOR, a) : a})`;
// Pearl needs thicker strokes: 1 px lines break up against the light ground. Dark keeps its widths (approved).
const LIGHT_MIN_LINE = 1.5;
/** Stroke width `w` in px; on pearl no line is thinner than LIGHT_MIN_LINE. */
export const lineW = (w: number): number => (light ? Math.max(w, LIGHT_MIN_LINE) : w);

export const MONO = '12px "JetBrains Mono", ui-monospace, monospace';
