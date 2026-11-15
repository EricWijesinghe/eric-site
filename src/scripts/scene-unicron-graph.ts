// The attack-surface graph of the UNICRON illustration. Hosts carry a severity mark and illustrative
// ports; nearest-neighbour links show where a path could run; one illustrative path walks six hops and
// names each hop with a MITRE ATT&CK tactic. Every value here is generated from a seed for the drawing.
// None of it is a scan result, and the scene says so.
import { caption, clamp01, ink, PALETTE as P, rng, stroke, tint, type Pt, type RgbKey } from './scene-core';
import { lineW } from './scene-core';

export const HOSTS = 22;
export const TACTICS = [
  { id: 'TA0043', name: 'Reconnaissance' },
  { id: 'TA0001', name: 'Initial Access' },
  { id: 'TA0002', name: 'Execution' },
  { id: 'TA0004', name: 'Privilege Escalation' },
  { id: 'TA0008', name: 'Lateral Movement' },
  { id: 'TA0010', name: 'Exfiltration' },
] as const;
export const EDGES = TACTICS.length; // one hop per tactic
const PORTS = [22, 25, 53, 80, 443, 3306, 5432, 8080];
// Severity 0 is no finding. The colours follow the palette; critical alone takes the threat mark.
const SEVERITY: readonly { name: string; colour: RgbKey | 'alert' }[] = [
  { name: 'none', colour: 'cyan' },
  { name: 'low', colour: 'emerald' },
  { name: 'medium', colour: 'azure' },
  { name: 'high', colour: 'magenta' },
  { name: 'critical', colour: 'alert' },
];
const LIST_ROW0 = 22; // the tactic list's first row, under its caption
const ROW_H = 20;
const CHAIN_LABEL = 'MITRE ATT&CK · TACTICS';

export interface Host {
  x: number; // unit-disc position, scaled to the radar at draw time
  y: number;
  services: number;
  links: number[]; // index of the nearest neighbour: an attack path
  ports: number[]; // illustrative only: shown on hover, never a real scan result
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
    const count = 3 + Math.floor(rand() * 3);
    const ports = Array.from({ length: count }, () => PORTS[Math.floor(rand() * PORTS.length)]);
    const services = 1 + Math.floor(rand() * 3);
    const sev = Math.floor(rand() * SEVERITY.length);
    return { x: r * Math.cos(a), y: r * Math.sin(a), services, links: [], ports, sev };
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
  g.lineWidth = lineW(1);
  hosts.forEach((h) => {
    const p = at(h);
    g.strokeStyle = stroke('cyan', 0.08);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(p.x, p.y);
    g.stroke();
    for (const j of h.links) {
      const q = at(hosts[j]);
      g.strokeStyle = stroke('magenta', 0.12);
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
    for (let k = 0; k < h.ports.length && ports > 0; k++) {
      const a = t * 0.1 + (k * Math.PI * 2) / h.ports.length;
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
    g.arc(p.x, p.y, 2.2 + pinged * 1.5 + (i === hover ? 1.5 : 0), 0, Math.PI * 2);
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
    if (k >= 1) caption(g, TACTICS[e].name, (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 6, ink(0.9));
  }
}

/** The tactic chain as a column: the hop being walked is lit, the walked ones stay readable. */
export function drawTacticList(g: CanvasRenderingContext2D, x: number, y: number, stage: number): void {
  const progress = clamp01(stage - 3) * EDGES;
  caption(g, CHAIN_LABEL, x, y, ink(0.78));
  TACTICS.forEach((tac, e) => {
    const row = y + LIST_ROW0 + e * ROW_H;
    const active = progress > e && progress < e + 1;
    const done = progress >= e + 1;
    caption(g, `${tac.id}  ${tac.name}`, x, row, active ? P.ice : ink(done ? 0.85 : 0.4));
  });
}

/** Severity key: each mark's colour, drawn in a row. */
export function drawLegend(g: CanvasRenderingContext2D, x: number, y: number): void {
  let cx = x;
  g.font = '12px "JetBrains Mono", ui-monospace, monospace';
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

/** The hover caption of a host: its severity and its illustrative ports. */
export function hostCaption(h: Host): string {
  return `${SEVERITY[h.sev].name} · illustrative ports ${h.ports.join(' · ')}`;
}

