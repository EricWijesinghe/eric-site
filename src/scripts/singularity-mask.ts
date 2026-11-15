// Where the graphic must stay quiet. The copy blocks (name, roles, bio, actions) are read from the DOM each frame,
// so the mask follows them at every breakpoint; his face is dimmed in figure px so no release line crosses it.
// Dimming, not hiding: the energy still passes behind the words and the face keeps its cyan detail.
import type { Gain } from './singularity-ink';
import type { HeadBox } from './singularity-zone';
import type { Pt } from './singularity-math';

const COPY_SEL = '.m2c-eyebrow, .m2c-name-wrap, .m2c-roles, .m2c-bio, .hero-actions';
const COPY_GAIN = 0.22; // the text's backdrop: quiet enough that the name keeps its contrast in both themes
const COPY_PAD = 14; // css px around each text block
const FACE_GAIN = 0.3; // his face and head: a release reads as energy around him, not across his features
const FACE_PAD = 26; // figure px beyond the head box

/** Fills `out` with one gain per copy block, in device px relative to the engine canvas. */
export function copyGains(root: HTMLElement, dpr: number, out: Gain[]): void {
  out.length = 0;
  const r = root.getBoundingClientRect();
  const blocks = root.parentElement?.querySelectorAll<HTMLElement>(COPY_SEL) ?? [];
  for (const el of blocks) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    out.push({
      x0: Math.max(0, (b.left - r.left - COPY_PAD) * dpr),
      y0: Math.max(0, (b.top - r.top - COPY_PAD) * dpr),
      x1: (b.right - r.left + COPY_PAD) * dpr,
      y1: (b.bottom - r.top + COPY_PAD) * dpr,
      k: COPY_GAIN,
    });
  }
}

/** The face gain for this frame's figure placement (origin and scale in device px). */
export function faceGain(head: HeadBox, fo: Pt, s: number): Gain {
  return {
    x0: fo[0] + (head.x0 - FACE_PAD) * s,
    x1: fo[0] + (head.x1 + FACE_PAD) * s,
    y0: fo[1] + (head.y0 - FACE_PAD) * s,
    y1: fo[1] + (head.y1 + FACE_PAD) * s,
    k: FACE_GAIN,
  };
}
