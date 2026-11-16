// The release (energy-overlay.ts): where each glyph goes. Eric (2026-11-17): nothing appears from nowhere, a long
// hold gives a huge burst, and the energy goes everywhere. Measured on the last build: the burst left as one clump
// at the lower left, because the words' quiet box hid the whole left fan and the right fan left the screen at once.
// So every released glyph flies a path chosen up front: out from his outline along an evenly spread fan, as far as
// the power reaches (to the screen's edge and past it at full power), and a path that would cross the words bends
// round them through the open corridor above or below the column. Position along the path eases out (a hard start
// that settles), so the burst has a front and a tail.

export interface Path { bx: number; by: number; cx: number; cy: number; c2x: number; c2y: number; ex: number; ey: number }
export interface View { w: number; h: number }
/** One released direction: screen-space unit vector, which side of him it leaves from, and whether it rises. */
export interface Dir { dx: number; dy: number; left: boolean; up: boolean }

const DEG = Math.PI / 180;
// Screen degrees (y down). The cone his head sits in (-118..-78) is never used; down-left and down-right are thinner.
const FANS = [
  { from: -168, to: -118, share: 0.3, left: true, up: true },
  { from: -78, to: -36, share: 0.27, left: false, up: true }, // he stands right of centre: the right fans climb or
  { from: 112, to: 178, share: 0.23, left: true, up: false },
  { from: 22, to: 72, share: 0.2, left: false, up: false }, // fall rather than run into the near edge and pile there
] as const;
const PAD = 30; // px kept between a bent path and the words
const BEND_MIN = 260; // px: a short throw (a tap) never needs to bend
const CORRIDOR_MIN = 40; // px: a corridor narrower than this is not used
const CORNER = 24; // px: how wide a path rounds the column's corner
const OFF = 40; // px past the screen's edge a full-power path ends, so it leaves rather than stops at the edge
const MIN_RUN = 480; // px: an edge this close is run past, not piled against
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** n directions spread evenly over the fans: stratified within each, so no fan is bare and none is a clump. */
export function fanDirs(n: number): Dir[] {
  const out: Dir[] = [];
  for (const f of FANS) {
    const m = Math.round(n * f.share);
    for (let j = 0; j < m; j++) {
      const a = (f.from + ((j + Math.random()) / m) * (f.to - f.from)) * DEG;
      out.push({ dx: Math.cos(a), dy: Math.sin(a), left: f.left, up: f.up });
    }
  }
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Distance from a point along a direction to just past the screen's edge. */
export function edgeDist(x: number, y: number, dx: number, dy: number, v: View): number {
  const tx = dx > 1e-3 ? (v.w - x) / dx : dx < -1e-3 ? -x / dx : Infinity;
  const ty = dy > 1e-3 ? (v.h - y) / dy : dy < -1e-3 ? -y / dy : Infinity;
  return Math.max(0, Math.min(tx, ty)) + OFF;
}

const hits = (x0: number, y0: number, x1: number, y1: number, l: number, t: number, r: number, b: number): boolean => {
  for (let i = 0; i <= 10; i++) { const x = x0 + ((x1 - x0) * i) / 10, y = y0 + ((y1 - y0) * i) / 10; if (x > l && x < r && y > t && y < b) return true; }
  return false;
};

/** A straight path: share f of the way to the screen's edge (f > 1 leaves it), never more than cap px. One heading
    left across the words bends round the column's top or bottom corner and runs on along the open corridor. */
export function route(p: Path, sx: number, sy: number, dx: number, dy: number, f: number, cap: number, col: DOMRect | null, v: View): void {
  const D = Math.min(cap, f * Math.max(MIN_RUN, edgeDist(sx, sy, dx, dy, v)));
  p.bx = sx; p.by = sy; p.ex = sx + dx * D; p.ey = sy + dy * D;
  p.cx = sx + (p.ex - sx) / 3; p.cy = sy + (p.ey - sy) / 3; p.c2x = sx + ((p.ex - sx) * 2) / 3; p.c2y = sy + ((p.ey - sy) * 2) / 3;
  if (!col || dx >= 0 || D < BEND_MIN) return;
  const l = col.left - PAD, t = col.top - PAD, r = col.right + PAD, b = col.bottom + PAD;
  if (!hits(sx, sy, p.ex, p.ey, l, t, r, b)) return;
  const top = t > CORRIDOR_MIN, bottom = v.h - b > CORRIDOR_MIN;
  if (!top && !bottom) return; // no way round: the quiet fade keeps the words clean
  const up = top && (!bottom || Math.random() < 0.5); // half over the column, half under it
  const wx = Math.max(r + CORNER, sx), wy = up ? rnd(8, t - CORNER) : rnd(b + CORNER, v.h - 8);
  const rest = Math.max(CORNER, f * (wx + OFF)); // the same share of the corridor's length to the screen's edge
  // it climbs (or drops) clear of the words first, then runs along the corridor toward the screen's edge
  p.cx = wx; p.cy = wy; p.c2x = wx - rest * 0.35; p.c2y = wy; p.ex = wx - rest; p.ey = wy;
}

/** The point at e (0..1) along a path (a cubic curve). */
export function along(p: Path, e: number): [number, number] {
  const i = 1 - e, a = i * i * i, b = 3 * i * i * e, c = 3 * i * e * e, d = e * e * e;
  return [a * p.bx + b * p.cx + c * p.c2x + d * p.ex, a * p.by + b * p.cy + c * p.c2y + d * p.ey];
}
