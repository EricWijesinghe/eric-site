// The attack-surface graph of the UNICRON illustration. Hosts carry a severity mark; nearest-neighbour
// links show where a path could run; one illustrative path walks six hops and names each hop with a MITRE
// ATT&CK tactic (names only). Every value here is generated from a seed for the drawing. None of it is a
// scan result, no host has an address, and nothing here is counted on screen.
import { caption, clamp01, ink, isLight, MONO, PALETTE as P, rgbOf, rng, stroke, tint, type Pt, type Rect, type RgbKey, type Spot } from './scene-core';
import { lineW } from './scene-core';

export const HOSTS = 22; // how many dots the drawing scatters; never shown as a figure
export const TACTICS = [
  'Reconnaissance',
  'Initial Access',
  'Execution',
  'Privilege Escalation',
  'Lateral Movement',
  'Exfiltration',
] as const;
export const EDGES = TACTICS.length; // one hop per tactic
const TICKS_MIN = 3; // service ticks drawn round an enumerated host: decoration, not ports
const TICKS_SPAN = 3;
export const LIST_ROW = 44; // px: one tactic row under a narrow radar, a full touch target
const LIST_TWO_W = 340; // px: below this width the list is one column, so no two names touch
/** Columns of the narrow tactic list: two when they fit side by side, else one. */
export const listCols = (w: number): number => (w >= LIST_TWO_W ? 2 : 1);
const TICK_GAP = 14; // px from the narrow radar's rim to its tactic numbers
const CLUSTER_PX = 24; // hosts nearer than this share one hotspot
const HOST_R = 3; // px: a host dot reads as a target, not a speck
const RING_GAP = 30; // px from the radar's rim to the tactic names round it
const PEARL_LINE_A = 0.3; // pearl: spokes and links are 1px hairlines; the sweep carries the weight
// Severity 0 is no finding. The colours follow the palette; critical alone takes the threat mark.
const SEVERITY: readonly { name: string; colour: RgbKey | 'alert' }[] = [
  { name: 'none', colour: 'cyan' },
  { name: 'low', colour: 'emerald' },
  { name: 'medium', colour: 'azure' },
  { name: 'high', colour: 'magenta' },
  { name: 'critical', colour: 'alert' },
];

export interface Host {
  x: number; // unit-disc position, scaled to the radar at draw time
  y: number;
  services: number;
  links: number[]; // index of the nearest neighbour: an attack path
  ticks: number; // service ticks once enumerated
  sev: number; // index into SEVERITY
}
export interface Graph {
  hosts: Host[];
  path: number[]; // host indices along the illustrative path: EDGES + 1 of them
  entry: number;
}

/** Hosts scattered over the radar, with their links, ports and severity, all from one seed. */
function buildHosts(): Host[] {
  const rand = rng(0x0c3a);
  return Array.from({ length: HOSTS }, () => {
    const a = rand() * Math.PI * 2;
    const r = 0.22 + 0.74 * Math.sqrt(rand());
    const ticks = TICKS_MIN + Math.floor(rand() * TICKS_SPAN);
    const services = 1 + Math.floor(rand() * 3);
    const sev = Math.floor(rand() * SEVERITY.length);
    return { x: r * Math.cos(a), y: r * Math.sin(a), services, links: [], ticks, sev };
  });
}

function nearestIndex(hosts: Host[], from: number, skip: ReadonlySet<number>): number {
  let best = -1;
  let bestD = Infinity;
  hosts.forEach((o, j) => {
    if (j === from || skip.has(j)) return;
    const d = (o.x - hosts[from].x) ** 2 + (o.y - hosts[from].y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  });
  return best;
}

/** Each host links to its nearest neighbour: the surface a path can cross. */
function link(hosts: Host[]): void {
  hosts.forEach((h, i) => h.links.push(nearestIndex(hosts, i, new Set())));
}

/** The illustrative path: from the entry host, always to the nearest host not yet on the path. */
function walk(hosts: Host[], entry: number): number[] {
  const path = [entry];
  const seen = new Set<number>([entry]);
  for (let k = 0; k < EDGES; k++) {
    const next = nearestIndex(hosts, path[path.length - 1], seen);
    path.push(next);
    seen.add(next);
  }
  return path;
}

export function buildGraph(): Graph {
  const hosts = buildHosts();
  link(hosts);
  const entry = Math.floor(rng(0x5e7)() * HOSTS);
  return { hosts, path: walk(hosts, entry), entry };
}

/** Stage 1 onward reveals hosts in order, one slice of the stage each: a sweep, not a switch. */
export function reveal(stage: number, from: number, i: number): number {
  return clamp01((stage - from) * HOSTS - i);
}

/** Hairline links between hosts, and the centre spokes: the surface, drawn quietly. */
export function drawLinks(g: CanvasRenderingContext2D, hosts: Host[], at: (h: Host) => Pt, cx: number, cy: number): void {
  const light = isLight();
  g.lineWidth = light ? 1 : lineW(1);
  hosts.forEach((h) => {
    const p = at(h);
    g.strokeStyle = light ? rgbOf('cyan', PEARL_LINE_A) : stroke('cyan', 0.08);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(p.x, p.y);
    g.stroke();
    for (const j of h.links) {
      const q = at(hosts[j]);
      g.strokeStyle = light ? rgbOf('magenta', PEARL_LINE_A) : stroke('magenta', 0.12);
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(q.x, q.y);
      g.stroke();
    }
  });
}

/** Each host: a dot, its illustrative port ticks once enumerated, a service ring, and a severity mark once scanned. */
export function drawHosts(
  g: CanvasRenderingContext2D,
  hosts: Host[],
  at: (h: Host) => Pt,
  stage: number,
  ping: (i: number) => number,
  hover: number,
  t: number,
): void {
  hosts.forEach((h, i) => {
    const p = at(h);
    const pinged = ping(i);
    const ports = reveal(stage, 1, i);
    for (let k = 0; k < h.ticks && ports > 0; k++) {
      const a = t * 0.1 + (k * Math.PI * 2) / h.ticks;
      g.strokeStyle = stroke('cyan', (0.3 + 0.5 * pinged) * ports);
      g.beginPath();
      g.moveTo(p.x + Math.cos(a) * 7, p.y + Math.sin(a) * 7);
      g.lineTo(p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 10);
      g.stroke();
    }
    for (let s = 0; s < h.services; s++) {
      const a = Math.atan2(h.y, h.x) + (s - 1) * 0.5;
      g.strokeStyle = stroke('azure', 0.45 + 0.4 * pinged);
      g.beginPath();
      g.arc(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, 2.6, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = ink(0.5 + 0.5 * pinged);
    g.beginPath();
    g.arc(p.x, p.y, HOST_R + pinged * 1.5 + (i === hover ? 1.5 : 0), 0, Math.PI * 2);
    g.fill();
    const found = reveal(stage, 2, i) * (h.sev > 0 ? 1 : 0);
    if (found > 0) {
      const sev = SEVERITY[h.sev];
      g.strokeStyle = sev.colour === 'alert' ? P.alert : tint(sev.colour, 0.9 * found);
      g.lineWidth = lineW(1.5);
      g.beginPath();
      g.arc(p.x, p.y, 6 + (1 - found) * 4, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = lineW(1);
    }
  });
}

/** The path, one hop at a time from stage 3 on; each finished hop carries its tactic name. */
export function drawPath(
  g: CanvasRenderingContext2D,
  hosts: Host[],
  at: (h: Host) => Pt,
  path: number[],
  stage: number,
  numbered: boolean, // narrow scenes number each hop (the list under the radar names it); wide ones name them on the ring
): void {
  const progress = clamp01(stage - 3) * EDGES;
  for (let e = 0; e < EDGES; e++) {
    const k = clamp01(progress - e);
    if (k <= 0) continue;
    const a = at(hosts[path[e]]);
    const b = at(hosts[path[e + 1]]);
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k;
    g.strokeStyle = P.ice;
    g.lineWidth = lineW(2);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(x, y);
    g.stroke();
    g.lineWidth = lineW(1);
    if (numbered && k >= 1) caption(g, String(e + 1), (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 6, ink(0.95));
  }
}

/** A tactic name's hit box: its centre (the focusable spot) and half extents. */
export interface TacticHit {
  spot: Spot;
  hw: number;
  hh: number;
}

const tacticState = (progress: number, e: number): 'active' | 'done' | 'ahead' =>
  progress > e && progress < e + 1 ? 'active' : progress >= e + 1 ? 'done' : 'ahead';
const tacticInk = (st: string): string => (st === 'active' ? P.ice : ink(st === 'done' ? 0.95 : 0.75));

/**
 * The tactic chain as a ring round the radar, clockwise from the top: the hop being walked is lit, the walked
 * ones stay readable. Returns a hit box per name.
 */
export function drawTacticRing(g: CanvasRenderingContext2D, cx: number, cy: number, radius: number, stage: number): TacticHit[] {
  const progress = clamp01(stage - 3) * EDGES;
  const rl = radius + RING_GAP;
  g.font = MONO;
  return TACTICS.map((name, e) => {
    const a = -Math.PI / 2 + (e * Math.PI * 2) / EDGES;
    const x = cx + Math.cos(a) * rl;
    const y = cy + Math.sin(a) * rl + 4;
    const tw = g.measureText(name).width;
    const cos = Math.cos(a);
    const left = cos > 0.2 ? x : cos < -0.2 ? x - tw : x - tw / 2;
    caption(g, name, left, y, tacticInk(tacticState(progress, e)));
    return { spot: { x: left + tw / 2, y: y - 4, label: `ATT&CK tactic: ${name}` }, hw: tw / 2 + 4, hh: 10 };
  });
}

/**
 * Narrow stages: numbered ticks round the radar, and the six names as a two-column list under it, each row a
 * 44 px target. The number on the ring, on the walked hop and in the list is the same.
 */
export function drawTacticList(g: CanvasRenderingContext2D, cx: number, cy: number, radius: number, box: Rect, stage: number): TacticHit[] {
  const progress = clamp01(stage - 3) * EDGES;
  const cols = listCols(box.w);
  const colW = box.w / cols;
  g.font = MONO;
  return TACTICS.map((name, e) => {
    const st = tacticState(progress, e);
    const a = -Math.PI / 2 + (e * Math.PI * 2) / EDGES;
    g.textAlign = 'center';
    caption(g, String(e + 1), cx + Math.cos(a) * (radius + TICK_GAP), cy + Math.sin(a) * (radius + TICK_GAP) + 4, tacticInk(st));
    g.textAlign = 'left';
    const col = e % cols;
    const row = Math.floor(e / cols);
    const x = box.x + col * colW;
    const y = box.y + row * LIST_ROW + LIST_ROW / 2;
    caption(g, `${e + 1} ${name}`, x, y + 4, tacticInk(st));
    return { spot: { x: x + colW / 2, y, label: `ATT&CK tactic: ${name}` }, hw: colW / 2, hh: LIST_ROW / 2 };
  });
}

/** The index of the tactic under `p`, or -1. */
export function tacticAt(hits: readonly TacticHit[], p: Pt | null): number {
  if (!p) return -1;
  return hits.findIndex((h) => Math.abs(h.spot.x - p.x) <= h.hw && Math.abs(h.spot.y - p.y) <= h.hh);
}

/** Hotspots for the hosts: hosts nearer than CLUSTER_PX share one, so every target can be picked by touch. */
export function hostSpots(hosts: Host[], at: (h: Host) => Pt): Spot[] {
  const groups: { x: number; y: number; n: number; first: number }[] = [];
  hosts.forEach((h, k) => {
    const p = at(h);
    const near = groups.find((c) => Math.hypot(c.x - p.x, c.y - p.y) < CLUSTER_PX);
    if (!near) groups.push({ ...p, n: 1, first: k });
    else [near.x, near.y, near.n] = [(near.x * near.n + p.x) / (near.n + 1), (near.y * near.n + p.y) / (near.n + 1), near.n + 1];
  });
  return groups.map((c) => ({ x: c.x, y: c.y, label: c.n > 1 ? 'illustrative host cluster' : `illustrative host ${c.first + 1}` }));
}

/** Severity key: each mark's colour, drawn in a row. */
export function drawLegend(g: CanvasRenderingContext2D, x: number, y: number): void {
  let cx = x;
  g.font = MONO;
  for (const s of SEVERITY.slice(1)) {
    const colour = s.colour === 'alert' ? P.alert : tint(s.colour, 0.95);
    g.fillStyle = colour;
    g.beginPath();
    g.arc(cx + 4, y - 4, 3.5, 0, Math.PI * 2);
    g.fill();
    caption(g, s.name, cx + 12, y, ink(0.8));
    cx += 12 + g.measureText(s.name).width + 16;
  }
}

/** The inspect line for a host. */
export function hostText(h: Host, k: number): string {
  const mark = h.sev === 0 ? 'no finding' : `${SEVERITY[h.sev].name} severity`;
  return `Host ${k}: ${mark} once scanned. Illustration, not a scan result.`;
}

