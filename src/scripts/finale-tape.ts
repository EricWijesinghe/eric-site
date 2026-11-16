// Support, "the address, bit by bit": the bits on the strands are the UTF-8 bytes of the repository address shown
// below them (built in Support.astro, which checks they decode back). This script only adds behaviour: per-item
// delays for the CSS decode light (--d: a byte's step down its strand, --i: a character's place), starting it
// when the tape itself scrolls in, replay on the address, and the inspect readout (point at a byte to see its
// character, at a character to see its byte). Without it, or with reduced motion, everything is simply shown.

const pad2 = (n: number): string => String(n).padStart(2, '0');
const START_AT = 0.25; // share of the tape in view before the light runs
const TAP_HALF = 22; // px: a 44 px tall touch target around each byte's row (the phone waves are ~54 px apart)
const TAP_SIDE = 4; // px: half the gap between neighbouring bytes

export function mountTape(root: HTMLElement): void {
  const items = [...root.querySelectorAll<SVGElement | HTMLElement>('.by, .ch')];
  const readout = root.querySelector<HTMLElement>('[data-readout]');
  const addr = root.querySelector<HTMLElement>('.fin-addr');
  if (!items.length || !readout || !addr) return;
  const byIndex = new Map<number, (SVGElement | HTMLElement)[]>();
  const chars: string[] = [];
  const bits: string[] = [];
  for (const el of items) {
    const i = Number(el.dataset.i);
    el.style.setProperty('--i', String(i));
    if (el.dataset.d) el.style.setProperty('--d', el.dataset.d);
    byIndex.set(i, [...(byIndex.get(i) ?? []), el]);
    if (el.classList.contains('ch')) chars[i] = el.textContent ?? '';
    else bits[i] = el.textContent ?? '';
  }
  root.classList.add('tape-ready');

  // Its own observer, not the reveal timing: the light starts as soon as a quarter of the tape is on screen,
  // and the carrier shimmer runs only while it stays there.
  new IntersectionObserver((es) => {
    const on = es[es.length - 1].isIntersecting;
    root.classList.toggle('is-live', on);
    if (on) root.classList.add('is-run');
  }, { threshold: START_AT }).observe(root);

  // Toggling between two identical keyframe sets restarts the light without a forced reflow.
  const replay = (): void => { root.classList.toggle('alt'); };
  addr.addEventListener('pointerenter', replay);
  addr.addEventListener('focus', replay);

  let hot = -1;
  const light = (i: number): void => {
    if (i === hot) return;
    byIndex.get(hot)?.forEach((el) => el.classList.remove('is-hot'));
    hot = i;
    if (i < 0 || bits[i] === undefined) { hot = -1; readout.textContent = ''; return; }
    byIndex.get(i)?.forEach((el) => el.classList.add('is-hot'));
    const value = parseInt(bits[i], 2);
    readout.textContent = `byte ${pad2(i)} · ${bits[i]} · 0x${value.toString(16).padStart(2, '0')} · ${chars[i] ?? ''}`;
  };
  const indexOf = (t: EventTarget | null): number => {
    const el = t instanceof Element ? t.closest<SVGElement | HTMLElement>('.by, .ch') : null;
    return el ? Number(el.dataset.i) : -1;
  };
  root.addEventListener('pointerover', (e) => { if (e.pointerType !== 'touch') light(indexOf(e.target)); });
  // A finger lifting fires pointerleave: a touch reading must survive it, so only a mouse or pen clears here.
  root.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') light(-1); });
  // A phone byte's glyph box is about 12 px tall; a finger gets the byte whose row is within TAP_HALF of it.
  const shown = items.filter((el) => el.classList.contains('by'));
  const nearest = (x: number, y: number): number => {
    let best = -1, bestD = Infinity;
    const box = root.getBoundingClientRect();
    if (y < box.top - TAP_HALF || y > box.bottom + TAP_HALF) return best;
    for (const el of shown) {
      const r = el.getBoundingClientRect();
      if (!r.width || Math.abs(y - (r.top + r.bottom) / 2) > TAP_HALF || x < r.left - TAP_SIDE || x > r.right + TAP_SIDE) continue;
      const d = Math.abs(x - (r.left + r.right) / 2);
      if (d < bestD) { bestD = d; best = Number(el.dataset.i); }
    }
    return best;
  };
  // Touch: a tap on a byte holds its reading until the next tap, anywhere else clears it.
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const i = root.contains(e.target as Node) ? indexOf(e.target) : -1;
    light(i >= 0 ? i : nearest(e.clientX, e.clientY));
  });
}
