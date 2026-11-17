// The hero's ink for the current theme. Canvases read it every frame, and a MutationObserver on
// data-theme tells them to repaint, so the toggle switches the hero live with no reload.
// Dark: additive light on the void. Light: normal-alpha strokes in deep azure and navy on pearl.

export interface Ink {
  light: boolean;
  /** Primary stroke: cyan on dark, deep azure on light (rgb triplet). */
  line: string;
  /** Highlight: ice on dark, navy on light. */
  ice: string;
  /** Hot core of a packet or spark: white on dark, bright cyan on light (navy read as dirt on the letters). */
  core: string;
  /** Secondary accent: violet on dark, indigo on light. */
  accent: string;
  /** Teal stroke: teal on dark, deep teal on light. */
  teal: string;
  /** Compositing for light on the canvas: additive on dark, normal over pearl on light. */
  blend: GlobalCompositeOperation;
  /** Alpha multiplier: light strokes need more ink to read on pearl. */
  gain: number;
}

const DARK: Ink = {
  light: false,
  line: '56,225,255',
  ice: '191,244,255',
  core: '243,251,255',
  accent: '139,92,246',
  teal: '25,211,197',
  blend: 'lighter',
  gain: 1.35,
};

const LIGHT: Ink = {
  light: true,
  line: '11,95,191',
  ice: '18,56,106',
  core: '0,168,222',
  accent: '75,60,255',
  teal: '10,125,120',
  blend: 'source-over',
  gain: 1.6,
};

const listeners = new Set<() => void>();

const pickInk = (): Ink => (document.documentElement.dataset.theme === 'light' ? LIGHT : DARK);
let current: Ink = typeof document === 'undefined' ? DARK : pickInk();

if (typeof document !== 'undefined') {
  new MutationObserver(() => {
    current = pickInk();
    listeners.forEach((fn) => fn());
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

/** The ink in force right now. */
export const inkNow = (): Ink => current;

/** Calls `fn` after each theme change; returns the unsubscribe. */
export function onInkChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
