// The release (energy-overlay.ts): where each glyph goes. Eric (2026-11-17): nothing appears from nowhere, a long
// hold gives a huge burst, and the energy goes everywhere. Round 12: "when scattering on leaving the click is not
// uniform". Round 12b, measured on screen 200 ms after a release: the even directions were not even where they
// landed (E-SE 42 % of the pixels, NW-N 2.5 %), because they left from his shoulders, the downward ones ran along
// his body off the fold and the upward ones squeezed past his head into two strips. Now every glyph travels a
// straight ray from one centre (his chin), so it stays in its own sector of the screen; the sectors are filled to an
// equal share, counting what the flung orbit already sends there (fillDirs); and each reaches a share of the room
// on ITS side (no minimum run), so the short way up and the long way left are covered at the same pace.

export interface Path { bx: number; by: number; cx: number; cy: number; c2x: number; c2y: number; ex: number; ey: number }
export interface View { w: number; h: number }
/** One released direction: a screen-space unit vector. */
export interface Dir { dx: number; dy: number }

const TAU = 2 * Math.PI;
export const SECTORS = 8; // 45 deg each, from east, clockwise on screen
const OFF = 40; // px past the screen's edge a full-power path ends, so it leaves rather than stops at the edge

export const sectorOf = (dx: number, dy: number): number => Math.floor(((Math.atan2(dy, dx) + TAU) % TAU) / (TAU / SECTORS)) % SECTORS;

/** n directions that, added to `have` (how many already leave in each sector), give every sector an equal share:
    each sector gets what it lacks, spread evenly inside it with a little jitter, the whole set shuffled (so the
    burst's front, the first out, is even too). */
export function fillDirs(n: number, have: readonly number[]): Dir[] {
  const even = (n + have.reduce((a, b) => a + b, 0)) / SECTORS;
  const lack = have.map((h) => Math.max(0, even - h)), sum = lack.reduce((a, b) => a + b, 0) || 1;
  const out: Dir[] = [];
  lack.forEach((l, s) => {
    const m = Math.round((l / sum) * n);
    for (let j = 0; j < m; j++) {
      const a = ((s + (j + 0.2 + 0.6 * Math.random()) / m) * TAU) / SECTORS;
      out.push({ dx: Math.cos(a), dy: Math.sin(a) });
    }
  });
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Distance from a point along a direction to just past the screen's edge. */
export function edgeDist(x: number, y: number, dx: number, dy: number, v: View): number {
  const tx = dx > 1e-3 ? (v.w - x) / dx : dx < -1e-3 ? -x / dx : Infinity;
  const ty = dy > 1e-3 ? (v.h - y) / dy : dy < -1e-3 ? -y / dy : Infinity;
  return Math.max(0, Math.min(tx, ty)) + OFF;
}

/** A straight path: share f of the way to the screen's edge (f > 1 leaves it), never more than cap px. */
export function route(p: Path, sx: number, sy: number, dx: number, dy: number, f: number, cap: number, v: View): void {
  const D = Math.min(cap, f * edgeDist(sx, sy, dx, dy, v));
  p.bx = sx; p.by = sy; p.ex = sx + dx * D; p.ey = sy + dy * D;
  p.cx = sx + (p.ex - sx) / 3; p.cy = sy + (p.ey - sy) / 3; p.c2x = sx + ((p.ex - sx) * 2) / 3; p.c2y = sy + ((p.ey - sy) * 2) / 3;
}

/** The point at e (0..1) along a path (a cubic curve). */
export function along(p: Path, e: number): [number, number] {
  const i = 1 - e, a = i * i * i, b = 3 * i * i * e, c = 3 * i * e * e, d = e * e * e;
  return [a * p.bx + b * p.cx + c * p.c2x + d * p.ex, a * p.by + b * p.cy + c * p.c2y + d * p.ey];
}
