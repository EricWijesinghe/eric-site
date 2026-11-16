// Geometry for the page-wide energy (energy-overlay.ts): the orbit plane around his torso, seen in perspective, and
// his silhouette (the figure's alpha, sampled once at low resolution) so glyphs can pass behind him, dive into him
// and leave from his outline. Eric (2026-11-17): the old flat ellipse sat at his neck and read as a collar
// tightening, and "the circle is too horizontal": so the plane opens as far as the screen allows (PITCH) and its
// centre stays on his chest, never up at his neck.

export interface Box { x: number; y: number; w: number; h: number }
/** A projected orbit point: viewport px, the perspective scale there, and depth (-1 far .. +1 nearest the viewer). */
export interface Proj { x: number; y: number; s: number; z: number }
/** The orbit as placed this frame: centre in viewport px, radius, and the sine/cosine of how far it is opened. */
export interface Plane { cx: number; cy: number; R: number; sp: number; cp: number }

const DEG = Math.PI / 180;
// All fractions are of the figure box that 'm2c:layout' reports. His chin is at 0.52 of its height and his
// shoulders start at 0.60, so the centre sits on his chest and the far side passes behind his shoulders.
export const ORBIT = {
  cx: 0.54, // his torso's centre (his head axis is at 0.60: the body is turned); singularity-hero.ts reads it too
  cy: 0.68,
  cyMin: 0.61, // to open the plane on a short screen the centre may rise this far: the top of his chest, never his neck
  r: 0.57, // of the figure's height: both ends clear his upper arms, so the far side shows behind him
} as const;
// The plane opens as far as fits between his chest and the fold: 28 deg reads as a tilted circle, under 20 as the
// flat band Eric called "too horizontal". A short screen first lifts the centre, then gives up a little radius.
const PITCH = { max: 28, good: 23, min: 19 } as const;
const ROLL = -6 * DEG; // the plane leans a little: its right end rises behind his shoulder
// The plane is turned toward the viewer on his right (screen left): the nearest point is the lower-left "corner",
// larger, lower and brighter, while the right end recedes behind his shoulder (Eric: "one corner ... larger").
const YAW = 22 * DEG;
const SIN_Y = Math.sin(YAW), COS_Y = Math.cos(YAW);
const FOCAL = 6; // camera distance in radii: a weak lens keeps the circle round; depth is told by size, light and speed
const R_MIN = { tall: 0.85, short: 0.7, shortH: 800 } as const; // the share of the radius a short screen may take back
const PHONE = { w: 600, rW: 0.4, rH: 0.38 } as const; // on a phone the circle is sized to the screen and to him
const FOLD_PX = 60; // the near side's lowest glyph stays this far above the bottom of the screen (plus half its height)
export const OUTER_LANE = 1.07; // the swarm's outer lane runs this far beyond the radius
export const HEAD_LINE = 0.56; // of the figure's height: everything above is his head and neck, kept clear
export const TORSO_TOP = 0.62; // glyphs enter and leave his body below this line (shoulders and chest)
export const FACE = { x: 0.61, y: 0.27, rx: 0.21, ry: 0.29 }; // his head, in figure-box fractions: glyphs vanish over it
const HEAD_CLEAR = 0.25; // released glyphs leave his shoulders this far (figure widths) to either side of his face
const TORSO_BOTTOM = 0.97;
const CHEST_BOTTOM = 0.8; // what falls into him lands on his shoulders and chest, where the eye already is

/** A point of the circle (angle a, radius r in px, lift px above the plane) through the tilt and a pinhole camera. */
export function project(pl: Plane, a: number, r: number, lift = 0): Proj {
  const X = Math.cos(a) * r, Z = Math.sin(a) * r; // a = 90 deg is the point nearest the viewer
  const zp = Z * pl.cp + lift * pl.sp, z = X * -SIN_Y + zp * COS_Y, f = FOCAL * pl.R, s = f / (f - z);
  const x1 = (X * COS_Y + zp * SIN_Y) * s, y1 = (Z * pl.sp - lift * pl.cp) * s;
  const cr = Math.cos(ROLL), sr = Math.sin(ROLL);
  return { x: pl.cx + x1 * cr - y1 * sr, y: pl.cy + x1 * sr + y1 * cr, s, z: z / (pl.R * Math.hypot(SIN_Y, COS_Y * pl.cp)) };
}

/** How far below its centre the projected circle reaches, in radii, for each whole degree of pitch. */
const DROP: number[] = [];
for (let d = PITCH.min; d <= PITCH.max; d++) {
  const pl = { cx: 0, cy: 0, R: 1, sp: Math.sin(d * DEG), cp: Math.cos(d * DEG) };
  DROP[d] = Array.from({ length: 90 }, (_, i) => project(pl, (i / 90) * 2 * Math.PI, 1).y).reduce((a, b) => Math.max(a, b));
}
/** The widest pitch whose near side fits in `room` px at radius R, or 0 when even the flattest does not. */
function fitPitch(R: number, room: number): number {
  for (let d = PITCH.max; d >= PITCH.min; d--) if (DROP[d] * R * OUTER_LANE <= room) return d;
  return 0;
}

/** Where the circle sits this frame. The pitch and centre come from the untightened radius, so the shape holds still
    while it draws in with the charge (`tighten` < 1); `nearPx` is the height of its largest glyph. */
export function placeOrbit(fig: Box, ox: number, oy: number, tighten: number, view: { w: number; h: number }, nearPx: number, axis: number): Plane {
  const top = oy + fig.y, floor = view.h - FOLD_PX - nearPx / 2;
  let R = view.w < PHONE.w ? Math.min(PHONE.rW * view.w, PHONE.rH * fig.h) : fig.h * ORBIT.r;
  let cy = top + fig.h * ORBIT.cy, d = fitPitch(R, floor - cy);
  if (d < PITCH.good) { // a short screen: lift the centre toward the top of his chest to keep the plane open
    cy = Math.max(top + fig.h * ORBIT.cyMin, Math.min(cy, floor - DROP[PITCH.good] * R * OUTER_LANE));
    d = fitPitch(R, floor - cy);
  }
  if (!d) { // still no room: give up a little radius at the flattest pitch allowed
    const keep = view.h < R_MIN.shortH ? R_MIN.short : R_MIN.tall;
    R = Math.max(R * keep, (floor - cy) / (DROP[PITCH.min] * OUTER_LANE));
    d = PITCH.min;
  }
  return { cx: ox + fig.x + fig.w * axis, cy, R: R * tighten, sp: Math.sin(d * DEG), cp: Math.cos(d * DEG) };
}

/** The orbit angle that faces a screen position, so a glyph joins the ring on the side it arrives from. */
export function angleToward(pl: Plane, x: number, y: number): number {
  const dx = x - pl.cx, dy = y - pl.cy, cr = Math.cos(ROLL), sr = Math.sin(ROLL);
  return Math.atan2((-dx * sr + dy * cr) / pl.sp, dx * cr + dy * sr);
}

export const smooth = (a: number, b: number, v: number): number => {
  const k = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** His silhouette in figure-box fractions (0..1 on both axes). */
export interface Body {
  /** His torso's centre line (figure widths): the orbit's axis. */
  axis: number;
  /** Coverage at a point: 1 inside him, 0 outside, soft at the edge. */
  alphaAt(nx: number, ny: number): number;
  /** A random point on his torso or shoulders, never his head. */
  pick(): [number, number];
  /** A point ON his outline, on one side: the top of a shoulder (up) or the outer edge of an upper arm. */
  rim(left: boolean, up: boolean): [number, number];
  /** Where his outline starts at this column, just inside it (shoulders and chest): the end of a falling stream. */
  entry(nx: number): number;
}

const MASK_W = 48, MASK_H = 44; // the figure is 1309 x 1201: about 27 px a cell, soft enough to need no blur
const INSIDE = 0.7;
const SIDE_BOTTOM = 0.84; // released glyphs leave from his shoulders and upper arms, above the fold on most screens
const EDGE = 0.5, STEP = 0.01; // his outline: where the figure's alpha crosses a half; marched in 1 % steps
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** Until the image is in (or if it fails): no occlusion, and a plain ellipse over his chest to aim at. */
export const roughBody: Body = {
  axis: ORBIT.cx,
  alphaAt: () => 0,
  pick: () => {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
    return [ORBIT.cx + Math.cos(a) * r * 0.26, 0.8 + Math.sin(a) * r * 0.14];
  },
  rim: (left, up) => (up ? [left ? rnd(0.12, FACE.x - HEAD_CLEAR) : rnd(FACE.x + HEAD_CLEAR, 0.95), TORSO_TOP + 0.02] : [ORBIT.cx + (left ? -0.36 : 0.36), rnd(TORSO_TOP, SIDE_BOTTOM)]),
  entry: () => TORSO_TOP + 0.08,
};

export async function loadBody(src: string): Promise<Body> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = MASK_W; c.height = MASK_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return roughBody;
  g.drawImage(img, 0, 0, MASK_W, MASK_H);
  const px = g.getImageData(0, 0, MASK_W, MASK_H).data;
  const alpha = new Float32Array(MASK_W * MASK_H);
  const torso: number[] = [];
  let sumX = 0, chestN = 0;
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = px[i * 4 + 3] / 255;
    const ny = (Math.floor(i / MASK_W) + 0.5) / MASK_H;
    if (alpha[i] > INSIDE && ny > TORSO_TOP && ny < TORSO_BOTTOM) torso.push(i);
    if (alpha[i] > INSIDE && ny > TORSO_TOP && ny < CHEST_BOTTOM) { sumX += ((i % MASK_W) + 0.5) / MASK_W; chestN++; }
  }
  if (!chestN) return roughBody;
  const cell = (x: number, y: number): number =>
    alpha[Math.max(0, Math.min(MASK_H - 1, y)) * MASK_W + Math.max(0, Math.min(MASK_W - 1, x))];
  const alphaAt = (nx: number, ny: number): number => {
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return 0;
    const fx = nx * MASK_W - 0.5, fy = ny * MASK_H - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const top = cell(x0, y0) * (1 - tx) + cell(x0 + 1, y0) * tx, bot = cell(x0, y0 + 1) * (1 - tx) + cell(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bot * ty;
  };
  const axis = sumX / chestN;
  const side = (left: boolean, ny: number): number => {
    let nx = axis;
    while (nx > 0 && nx < 1 && alphaAt(nx, ny) > EDGE) nx += left ? -STEP : STEP;
    return nx;
  };
  const top = (nx: number): number => {
    let ny = TORSO_TOP - 0.06;
    while (ny < CHEST_BOTTOM && alphaAt(nx, ny) < EDGE) ny += STEP;
    return ny;
  };
  return {
    axis,
    alphaAt,
    pick() {
      const i = torso[Math.floor(Math.random() * torso.length)];
      return [((i % MASK_W) + Math.random()) / MASK_W, (Math.floor(i / MASK_W) + Math.random()) / MASK_H];
    },
    rim(left, up) {
      if (up) { // the top of a shoulder, well to the side of his face
        const edge = side(left, TORSO_TOP + 0.06), from = left ? edge : FACE.x + HEAD_CLEAR, to = left ? FACE.x - HEAD_CLEAR : edge;
        if (to - from > 0.02) { const nx = rnd(from, to), ny = top(nx); if (ny < CHEST_BOTTOM) return [nx, ny]; }
      }
      const ny = rnd(TORSO_TOP + 0.02, SIDE_BOTTOM);
      return [side(left, ny), ny];
    },
    entry(nx) {
      let ny = TORSO_TOP + 0.02;
      while (ny < CHEST_BOTTOM && alphaAt(nx, ny) < INSIDE) ny += STEP;
      return Math.min(CHEST_BOTTOM, ny + 0.025);
    },
  };
}
