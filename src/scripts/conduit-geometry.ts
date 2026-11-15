// Pure geometry for the conduit: a smooth cubic path through anchor points, sampled into a
// polyline so the draw front, the nodes and the packets are all placed by arc length.
// No DOM here, so it can be checked without a browser.

export interface Anchor {
  x: number;
  y: number;
}

export interface Pt extends Anchor {
  /** Arc length from the start, in CSS px. */
  s: number;
}

export interface Conduit {
  d: string;
  pts: Pt[];
  total: number;
  /** Arc length at the end of each node leg, in node order. */
  nodeS: number[];
}

const SAMPLES_PER_LEG = 28;
const LEAD_DROP = 0.6;
const LEAD_ARRIVE = 0.25;

const f = (n: number): string => n.toFixed(1);

function cubic(a: Anchor, c1: Anchor, c2: Anchor, b: Anchor, t: number): Anchor {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
    y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y,
  };
}

/**
 * Start (under the figure), then each node, then the tail. The first leg is a plain S from the
 * figure down to the first heading. Later legs swing `bulge` px to alternating sides, so the line
 * weaves down the gutter rather than running ruler-straight. Control y values sit on the midline,
 * so y never decreases along the path, which sAtY relies on.
 */
export function buildConduit(start: Anchor, nodes: Anchor[], tail: Anchor, bulge: number): Conduit {
  const chain = [start, ...nodes, tail];
  const pts: Pt[] = [{ x: start.x, y: start.y, s: 0 }];
  const nodeS: number[] = [];
  let d = `M${f(start.x)} ${f(start.y)}`;
  let s = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i];
    const b = chain[i + 1];
    if (!a || !b) break;
    const dy = b.y - a.y;
    const side = i === 0 ? 0 : (i % 2 === 0 ? 1 : -1) * bulge;
    // The lead-in drops from the figure first and only then sweeps left, so it never reads as a wire
    // crossing the page. Both handles keep y between a.y and b.y, so the path stays monotone in y.
    const c1 = i === 0 ? { x: a.x, y: a.y + dy * LEAD_DROP } : { x: a.x + side, y: a.y + dy / 2 };
    const c2 = i === 0 ? { x: b.x, y: b.y - dy * LEAD_ARRIVE } : { x: b.x - side, y: b.y - dy / 2 };
    d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(b.x)} ${f(b.y)}`;
    let prev: Anchor = a;
    for (let k = 1; k <= SAMPLES_PER_LEG; k++) {
      const p = cubic(a, c1, c2, b, k / SAMPLES_PER_LEG);
      s += Math.hypot(p.x - prev.x, p.y - prev.y);
      pts.push({ x: p.x, y: p.y, s });
      prev = p;
    }
    if (i < nodes.length) nodeS.push(s);
  }
  return { d, pts, total: s, nodeS };
}

/** Point at arc length s, clamped to the path ends. */
export function pointAt(pts: Pt[], s: number): Anchor {
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return { x: 0, y: 0 };
  if (s <= first.s) return first;
  if (s >= last.s) return last;
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const m = pts[mid];
    if (m && m.s <= s) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  if (!a || !b) return last;
  const span = b.s - a.s;
  const t = span > 0 ? (s - a.s) / span : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Arc length at which the path reaches page y (the reading line), clamped to its ends. */
export function sAtY(pts: Pt[], y: number): number {
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return 0;
  if (y <= first.y) return first.s;
  if (y >= last.y) return last.s;
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const m = pts[mid];
    if (m && m.y < y) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  if (!a || !b) return last.s;
  const dy = b.y - a.y;
  const t = dy > 0 ? (y - a.y) / dy : 0;
  return a.s + (b.s - a.s) * t;
}
