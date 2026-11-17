// Decrypting titles: when the current reaches a section, the canvas (behind the content) draws one row of cycling
// hex and binary glyphs in the heading's box, and the heading's own --scan mask (flow.css) reveals the real title
// left to right over it. The cipher only shows ahead of the scan front, so the two meet at the soft edge. The real
// text never leaves the DOM; this is paint only.
import { rgbStyle, type Palette } from './flow-palette';
import { chordPos } from './conduit';
import { hash } from './flow-streams';

interface Run {
  x: number;
  y: number;
  /** Box width (the scan runs over it) and text width (the cipher covers only the words). */
  w: number;
  textW: number;
  size: number;
  t0: number;
  seed: number;
}

const LIFE_MS = 1300;
// Matches the title's transition in flow.css: --scan 0% -> 120% over 1.1 s, soft edge 14% of the width.
const SCAN_MS = 1100;
const SCAN_END = 1.2;
const SCAN_EDGE = 0.14;
const CHAR_MS = 60;
const SIZE_RATIO = 0.62;
const CHAR_ADVANCE = 0.62;
const ALPHA = 0.7;
const FADE_OUT_MS = 200;
const GLYPHS = '0123456789abcdef0101';
const FONT_FAMILY = '"JetBrains Mono", ui-monospace, monospace';
// The title's scan runs on cubic-bezier(.4, 0, .2, 1) (flow.css); solved here so the cipher's front follows it.
const P1 = [0.4, 0] as const;
const P2 = [0.2, 1] as const;
const NEWTON_STEPS = 8;

function bez(t: number, a: number, b: number): number {
  const u = 1 - t;
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
}

function ease(x: number): number {
  let t = x;
  for (let i = 0; i < NEWTON_STEPS; i++) {
    const u = 1 - t;
    const dx = 3 * u * u * P1[0] + 6 * u * t * (P2[0] - P1[0]) + 3 * t * t * (1 - P2[0]);
    if (Math.abs(dx) < 1e-6) break;
    t = Math.min(1, Math.max(0, t - (bez(t, P1[0], P2[0]) - x) / dx));
  }
  return bez(t, P1[1], P2[1]);
}

export class Cipher {
  private runs: Run[] = [];

  start(title: Element, now: number): void {
    const r = title.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(title).fontSize) || r.height;
    const size = fs * SIZE_RATIO;
    // The box carries 0.22em of padding for descenders (flow.css): the line itself is the rest.
    const lineH = r.height - fs * 0.22;
    const range = document.createRange();
    range.selectNodeContents(title);
    const textW = Math.min(r.width, range.getBoundingClientRect().width || r.width);
    this.runs = [
      ...this.runs.filter((run) => now - run.t0 < LIFE_MS),
      { x: r.left, y: r.top + window.scrollY + lineH / 2, w: r.width, textW, size, t0: now, seed: Math.floor(now) },
    ];
  }

  busy(): boolean {
    return this.runs.length > 0;
  }

  paint(ctx: CanvasRenderingContext2D, now: number, scroll: number, pal: Palette): void {
    this.runs = this.runs.filter((run) => now - run.t0 < LIFE_MS);
    if (this.runs.length === 0) return;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const run of this.runs) {
      const age = now - run.t0;
      const front = ease(Math.min(1, age / SCAN_MS)) * SCAN_END * run.w;
      const fade = Math.min(1, (LIFE_MS - age) / FADE_OUT_MS);
      const step = run.size * CHAR_ADVANCE;
      const count = Math.floor(run.textW / step);
      const tick = Math.floor(age / CHAR_MS);
      ctx.font = `${run.size.toFixed(1)}px ${FONT_FAMILY}`;
      ctx.fillStyle = rgbStyle(pal.at(chordPos(run.y)).a);
      for (let i = 0; i < count; i++) {
        const cx = i * step;
        // Ahead of the scan front only: inside the soft edge the cipher fades as the title fades in.
        const ahead = Math.min(1, Math.max(0, (cx - front) / (SCAN_EDGE * run.w)));
        if (ahead <= 0) continue;
        const ch = GLYPHS[Math.floor(hash(run.seed, i, tick) * GLYPHS.length)] ?? '0';
        ctx.globalAlpha = ALPHA * ahead * fade;
        ctx.fillText(ch, run.x + cx, run.y - scroll);
      }
    }
    ctx.globalAlpha = 1;
  }
}
