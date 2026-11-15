// The embedding space of the AI x security illustration: benign and malicious inputs as two clusters in
// a two-dimensional projection, with the classifier's boundary between them. The rule is nearest
// centroid: a point is flagged when it lies nearer the malicious centre, which is the same as lying on
// that side of the perpendicular bisector of the two centres. Points are generated from a seed for the
// drawing only; the probe is placed by the reader, or drifts on its own when nobody points.
import { caption, clamp01, ink, PALETTE as P, rng, rrect, stroke, tint, glass, type Pt, type Rect } from './scene-core';
import { lineW } from './scene-core';

export interface Cloud {
  x: number; // 0..1 across the box
  y: number; // 0..1 up the box
  bad: boolean;
}

const BENIGN: Pt = { x: 0.27, y: 0.64 };
const MALICIOUS: Pt = { x: 0.74, y: 0.34 };
const N_BENIGN = 26;
const N_MALICIOUS = 14;
const SPREAD_BENIGN = 0.11;
const SPREAD_MALICIOUS = 0.09;
const PAD = 14;
const DOT_R = 2.6;
const PROBE_R = 5;
const PROBE_SWING_S = 7; // the drifting probe crosses the boundary and back in this long
const BOUNDARY_REACH = 2; // half-length of the boundary line, in box units: long enough to clip to the box
const CHIP_PAD = 8;
const CAPTION = 'EMBEDDING SPACE';

/** Sum of uniforms: a soft bell with no tails, enough for a cloud. */
const bell = (rand: () => number): number => rand() + rand() + rand() - 1.5;

function makeCloud(): Cloud[] {
  const rand = rng(0xe3b0);
  const benign = Array.from({ length: N_BENIGN }, () => ({
    x: clamp01(BENIGN.x + bell(rand) * SPREAD_BENIGN),
    y: clamp01(BENIGN.y + bell(rand) * SPREAD_BENIGN),
    bad: false,
  }));
  const malicious = Array.from({ length: N_MALICIOUS }, () => ({
    x: clamp01(MALICIOUS.x + bell(rand) * SPREAD_MALICIOUS),
    y: clamp01(MALICIOUS.y + bell(rand) * SPREAD_MALICIOUS),
    bad: true,
  }));
  return [...benign, ...malicious];
}

const CLOUD = makeCloud();

/** Nearest centroid: flagged when the point is nearer the malicious centre than the benign one. */
export function isMalicious(p: Pt): boolean {
  const mx = (BENIGN.x + MALICIOUS.x) / 2;
  const my = (BENIGN.y + MALICIOUS.y) / 2;
  return (p.x - mx) * (MALICIOUS.x - BENIGN.x) + (p.y - my) * (MALICIOUS.y - BENIGN.y) > 0;
}

/** The probe's place: where the reader put it, else drifting from one cluster to the other. */
export function probeAt(t: number, placed: Pt | null): Pt {
  if (placed) return placed;
  const s = 0.5 + 0.5 * Math.sin((t / PROBE_SWING_S) * Math.PI * 2);
  return { x: BENIGN.x + (MALICIOUS.x - BENIGN.x) * s, y: BENIGN.y + (MALICIOUS.y - BENIGN.y) * s };
}

/** Maps a unit point into the box, inside its padding. */
const toBox = (box: Rect, p: Pt): Pt => ({
  x: box.x + PAD + p.x * (box.w - PAD * 2),
  y: box.y + PAD + (1 - p.y) * (box.h - PAD * 2),
});

/** Whether a point (in the painter frame) lies inside the space, so a probe can be placed there. */
export const inSpace = (box: Rect, p: Pt): boolean =>
  p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;

/** The inverse of toBox: a point in the painter frame, as a unit point of the space. */
export const toUnit = (box: Rect, p: Pt): Pt => ({
  x: clamp01((p.x - box.x - PAD) / (box.w - PAD * 2)),
  y: clamp01(1 - (p.y - box.y - PAD) / (box.h - PAD * 2)),
});

/** Draws the space. `probe` is a unit point the reader placed, or null to let it drift; returns the verdict. */
export function drawEmbed(g: CanvasRenderingContext2D, box: Rect, t: number, probe: Pt | null): string {
  caption(g, CAPTION, box.x + 10, box.y + 18, ink(0.78));

  // The boundary: the perpendicular bisector of the two centres, clipped to the box.
  const mx = (BENIGN.x + MALICIOUS.x) / 2;
  const my = (BENIGN.y + MALICIOUS.y) / 2;
  const dx = -(MALICIOUS.y - BENIGN.y);
  const dy = MALICIOUS.x - BENIGN.x;
  const a = toBox(box, { x: mx - dx * BOUNDARY_REACH, y: my - dy * BOUNDARY_REACH });
  const b = toBox(box, { x: mx + dx * BOUNDARY_REACH, y: my + dy * BOUNDARY_REACH });
  g.save();
  rrect(g, box.x, box.y, box.w, box.h, 14);
  g.clip();
  g.strokeStyle = stroke('violet', 0.75);
  g.lineWidth = lineW(1.5);
  g.setLineDash([5, 5]);
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke();
  g.setLineDash([]);
  g.restore();

  for (const c of CLOUD) {
    const q = toBox(box, c);
    g.fillStyle = c.bad ? tint('magenta', 0.9) : tint('cyan', 0.85);
    g.beginPath();
    g.arc(q.x, q.y, DOT_R, 0, Math.PI * 2);
    g.fill();
  }
  const bq = toBox(box, BENIGN);
  const mq = toBox(box, MALICIOUS);
  caption(g, 'benign', bq.x - 24, bq.y + 26, ink(0.9));
  caption(g, 'malicious', mq.x - 30, mq.y + 26, tint('magenta', 0.95));

  const at = probeAt(t, probe);
  const bad = isMalicious(at);
  const pq = toBox(box, at);
  g.strokeStyle = bad ? P.alert : P.ice;
  g.lineWidth = lineW(2);
  g.beginPath();
  g.arc(pq.x, pq.y, PROBE_R + 2 * clamp01(0.5 + 0.5 * Math.sin(t * 3)), 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = lineW(1);
  const label = bad ? 'flagged' : 'benign';
  const width = label.length * 7.2 + CHIP_PAD * 2;
  const lx = Math.min(pq.x + 12, box.x + box.w - width - 6);
  g.fillStyle = `rgb(${glass()} / 0.75)`;
  rrect(g, lx, pq.y - 24, width, 20, 6);
  g.fill();
  caption(g, label, lx + CHIP_PAD, pq.y - 10, bad ? P.alert : ink(0.95));
  return bad ? 'flagged' : 'benign';
}
