// The words stay clean (Eric 2026-11-17: "premium, not a toy"). The hero's copy column is one quiet box (its name,
// lines and buttons together, energy-release.ts bends released glyphs round it), while the fade uses each line of
// it on its own, so the open space between the short lines and his shoulder still shows the swarm. Every heading,
// paragraph and button further down the page is its own box: no glyph draws inside one, they fade in over a short
// margin around it.

const PAD = 28; // px of clear space around the words
const FALL = 24; // px over which a glyph fades back in beyond that

export interface Quiet { column: DOMRect | null; boxes: DOMRect[] }

export function readQuiet(viewH: number): Quiet {
  const kids = document.querySelectorAll<HTMLElement>('.m2c-copy > *, .m2c-copy .m2c-word'); // the words: the name overflows its own box
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  const boxes: DOMRect[] = [];
  kids.forEach((el) => {
    const k = el.getBoundingClientRect();
    if (!k.width || !k.height) return;
    boxes.push(k);
    l = Math.min(l, k.left); t = Math.min(t, k.top); r = Math.max(r, k.right); b = Math.max(b, k.bottom);
  });
  const column = l < r ? new DOMRect(l, t, r - l, b - t) : null;
  document.querySelectorAll<HTMLElement>('main h2, main p, main .btn').forEach((el) => {
    if (el.closest('.m2c-copy')) return;
    const k = el.getBoundingClientRect();
    if (k.bottom > -PAD && k.top < viewH + PAD && k.width) boxes.push(k);
  });
  return { column, boxes };
}

const gap = (b: DOMRect, x: number, y: number): number => Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));

/** 0 inside a box and its margin, rising to 1 over FALL px beyond it. */
export function quietAlpha(q: Quiet, x: number, y: number): number {
  let a = 1;
  for (const b of q.boxes) {
    const d = gap(b, x, y);
    if (d < PAD + FALL) a = Math.min(a, Math.max(0, (d - PAD) / FALL));
  }
  return a * a * (3 - 2 * a);
}
