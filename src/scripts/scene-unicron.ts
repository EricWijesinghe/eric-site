// UNICRON, as an illustration of an assessment pipeline over an attack-surface graph: recon, enumeration,
// vulnerability scan, validation, report. A radar sweeps the surface; the rail names the stage; hosts
// gain ports, then severity marks; validation walks one attack path named by MITRE ATT&CK tactics; a
// scan terminal scrolls an illustrative log. The target lock follows the pointer (or cycles alone), and a
// press runs the pipeline again. This is the idea of the pipeline, not UNICRON output: UNICRON is a private
// repository, described and never linked.
import {
  caption,
  clamp01,
  easeOut,
  glass,
  ink,
  mountScene,
  MONO,
  PALETTE as P,
  rng,
  rrect,
  STILL_T,
  stroke, tint,
  type Painter,
  type PointerKind,
  type Pt,
} from './scene-core';
import { lineW } from './scene-core';
import { dumpLine, hex } from './scene-glyphs';
import {
  buildGraph,
  drawHosts,
  drawLegend,
  drawLinks,
  drawPath,
  drawTacticList,
  hostCaption,
  HOSTS,
  type Host,
} from './scene-unicron-graph';
import { drawRail, railPos } from './scene-steps';

const STAGES = ['RECON', 'ENUMERATE', 'VULN SCAN', 'VALIDATE', 'REPORT'] as const;
const STAGE_S = 3.6; // seconds per pipeline stage
const REDUCED_STAGE_T = 16.4; // reduced motion: the still frame sits in REPORT, with every stage shown
const RAIL_Y = 12;
const LEGEND_Y = 58;
const TACTIC_Y = 96;
const WIDE_RATIO = 1.15;
const WIDE_RADAR_X = 0.7; // on wide scenes the radar sits right, clear of the terminal and tactic list
const WIDE_RADAR_R = 0.27; // radar radius as a share of the width (wide) ...
const WIDE_RADAR_H = 0.34; // ... or of the height, whichever is smaller
const NARROW_RADAR_R = 0.42;
const SWEEP_RATE = 0.8; // radians per second
const SWEEP_TRAIL = 1.1; // radians of fading trail behind the sweep
const SWEEP_GLOW = 0.2; // peak alpha of the trail at the beam
const LEAD_EDGE = 0.0005; // the beam's leading edge is one hairline, not a wedge
const GLOW_R = 1.25; // violet glow radius, in radar radii
const GLOW_A = 0.16; // violet glow peak alpha
const RINGS: readonly [number, number][] = [
  [1, 0.2],
  [0.66, 0.12],
  [0.33, 0.08],
];
const PING_S = 1.1; // how long a probed host stays lit
const LOCK_CYCLE_S = 9; // seconds per target lock when no pointer is steering it
const LOCK_S = 1.2; // the reticle closes on the target in this long
const SCAN_S = 2.2; // a press spins the sweep up over this long
const SCAN_TURNS = 2; // extra turns the sweep makes during a scan
const PACKETS = 4;
const PACKET_SPEED = 0.16; // edge lengths per second
const PACKET_HOP_TICKS = 6; // how often a packet's bytes re-read along its edge
const HOVER_R = 16; // px: a host this near the pointer is hovered
const TERM_LINE_S = 0.85;
const TERM_ROWS = 6;
const TERM_LH = 16;
const TERM_H = 130;
const TERM_W = 0.46; // the terminal's share of the width on wide scenes
const TERM_PAD = 12;
const TERM_HEADER = 'ILLUSTRATIVE SCAN LOG';
const TERM_LOG = [
  '$ scan surface 198.51.100.0/24',
  '[+] 198.51.100.14  443/tcp open',
  '[+] 198.51.100.14  https',
  '[.] 198.51.100.31  ports filtered',
  '[+] 198.51.100.52  22/tcp open',
  '[!] 198.51.100.52  weak kex',
  '[+] 198.51.100.77  5432/tcp postgres',
  '[.] 198.51.100.90  no open ports',
  '[+] 198.51.100.103 8080/tcp http',
  '[.] 198.51.100.118 host down',
  '[+] 198.51.100.141 53/udp dns',
  '[+] 198.51.100.160 25/tcp smtp',
  `[.] scan complete: ${HOSTS} hosts probed`,
];
// Every log line is followed by a hexdump of its (illustrative) packet, so the panel reads as a capture.
const TERM_LINES: readonly string[] = TERM_LOG.flatMap((line, i) => [line, dumpLine(0x3c0 + i * 131, i * 16)]);
const CAPTION_DUMP = /^[0-9a-f]{4} {2}/;

interface Pad {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A packet's bytes: decorative, re-read every few hops along its edge. */
const hopBytes = (seed: number, u: number): string => `0x${hex(seed + Math.floor(u * PACKET_HOP_TICKS), 4)}`;

/** How long ago the sweep last crossed a host, in radians. */
function angleGap(sweep: number, a: number): number {
  let d = (sweep - a) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return d;
}

function makeScene(_host: HTMLElement, reduce: boolean): Painter {
  const { hosts, path } = buildGraph();
  const rand = rng(0x5e7);
  const packetSeed = Array.from({ length: PACKETS }, () => ({ edge: Math.floor(rand() * HOSTS), offset: rand() }));
  let w = 0;
  let h = 0;
  let wide = true;
  let cx = 0;
  let cy = 0;
  let radius = 0;
  let pointer: Pt | null = null;
  let scanAt = -Infinity; // clock time of the last press; -Infinity = never
  let pipeStart = reduce ? STILL_T - REDUCED_STAGE_T : 0;
  let lockKey = -1;
  let lockAt = 0;

  const pos = (p: Host): Pt => ({ x: cx + p.x * radius, y: cy + p.y * radius });
  const termPad = (): Pad => ({ x: 0, y: h - TERM_H, w: wide ? w * TERM_W : w, h: TERM_H });

  /** The host nearest a point, with its distance. */
  const nearestTo = (p: Pt): { i: number; d: number } => {
    let i = -1;
    let d = Infinity;
    hosts.forEach((o, k) => {
      const q = pos(o);
      const dk = Math.hypot(q.x - p.x, q.y - p.y);
      if (dk < d) {
        d = dk;
        i = k;
      }
    });
    return { i, d };
  };

  /** A press spins the sweep up over SCAN_S, then it settles. Before any press it adds nothing. */
  const scanSpin = (t: number): number =>
    t >= scanAt ? SCAN_TURNS * 2 * Math.PI * easeOut((t - scanAt) / SCAN_S) : 0;

  const overRadar = (): boolean => pointer !== null && Math.hypot(pointer.x - cx, pointer.y - cy) <= radius * 1.05;
  const hoverHost = (): number => {
    if (!pointer || !overRadar()) return -1;
    const n = nearestTo(pointer);
    return n.d <= HOVER_R ? n.i : -1;
  };
  /** The lock: the host nearest the pointer over the radar; else the end of the path once it is walked; else a cycle. */
  const chooseTarget = (t: number, stage: number): number => {
    if (overRadar()) return nearestTo(pointer as Pt).i;
    if (stage >= 3) return path[path.length - 1];
    return Math.floor(t / LOCK_CYCLE_S) % HOSTS;
  };

  const drawGlow = (g: CanvasRenderingContext2D): void => {
    const span = radius * GLOW_R;
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, span);
    glow.addColorStop(0, tint('violet', GLOW_A));
    glow.addColorStop(0.6, tint('violet', GLOW_A * 0.35));
    glow.addColorStop(1, tint('violet', 0));
    g.fillStyle = glow;
    g.fillRect(cx - span, cy - span, span * 2, span * 2);
  };

  /** A feathered sweep: a conic gradient fading in behind the beam, so no hard fan is drawn. */
  const drawSweep = (g: CanvasRenderingContext2D, sweep: number): void => {
    const lead = SWEEP_TRAIL / (Math.PI * 2);
    const grad = g.createConicGradient(sweep - SWEEP_TRAIL, cx, cy);
    grad.addColorStop(0, tint('cyan', 0));
    grad.addColorStop(lead, tint('cyan', SWEEP_GLOW));
    grad.addColorStop(lead + LEAD_EDGE, tint('cyan', 0));
    grad.addColorStop(1, tint('cyan', 0));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, radius, 0, Math.PI * 2);
    g.closePath();
    g.fill();
    g.strokeStyle = ink(0.7);
    g.lineWidth = lineW(1.5);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(sweep) * radius, cy + Math.sin(sweep) * radius);
    g.stroke();
  };

  const drawLock = (g: CanvasRenderingContext2D, target: number, lock: number): void => {
    const tp = pos(hosts[target]);
    const size = 26 - 12 * lock;
    g.strokeStyle = P.cyan;
    g.lineWidth = lineW(1.5);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      g.beginPath();
      g.arc(tp.x, tp.y, size, a - 0.35, a + 0.35);
      g.stroke();
    }
    if (lock >= 1) {
      // The one alert mark in the scene: a tiny dose, on the locked host only.
      g.fillStyle = P.alert;
      g.beginPath();
      g.arc(tp.x, tp.y, 2.6, 0, Math.PI * 2);
      g.fill();
      caption(g, 'target', tp.x + 22, tp.y + 26, P.ice);
    }
  };

  const drawPackets = (g: CanvasRenderingContext2D, t: number): void => {
    g.strokeStyle = ink(0.85);
    g.lineWidth = lineW(1.5);
    for (const pk of packetSeed) {
      const from = hosts[pk.edge];
      const to = hosts[from.links[0]];
      const u = (pk.offset + t * PACKET_SPEED) % 1;
      const a = pos(from);
      const b = pos(to);
      const tail = clamp01(u - 0.08);
      const head = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      g.beginPath();
      g.moveTo(a.x + (b.x - a.x) * tail, a.y + (b.y - a.y) * tail);
      g.lineTo(head.x, head.y);
      g.stroke();
      caption(g, hopBytes(pk.edge * 101, u), head.x + 8, head.y - 8, ink(0.6));
    }
  };

  /** The scan terminal: an illustrative log, scrolled by the clock, in a panel that never clips a line. */
  const drawTerm = (g: CanvasRenderingContext2D, t: number): void => {
    const p = termPad();
    g.fillStyle = `rgb(${glass()} / ${wide ? 0.72 : 0.8})`;
    rrect(g, p.x, p.y, p.w, p.h, 14);
    g.fill();
    g.save();
    rrect(g, p.x, p.y, p.w, p.h, 14);
    g.clip();
    caption(g, TERM_HEADER, p.x + TERM_PAD, p.y + 20, ink(0.6));
    const idx = Math.floor(t / TERM_LINE_S);
    for (let k = 0; k < TERM_ROWS; k++) {
      const line = TERM_LINES[(idx - TERM_ROWS + 1 + k + TERM_LINES.length * TERM_ROWS) % TERM_LINES.length];
      const colour = line.startsWith('$') ? tint('cyan', 0.95) : line.startsWith('[!]') ? P.alert : CAPTION_DUMP.test(line) ? ink(0.5) : ink(0.9);
      caption(g, line, p.x + TERM_PAD, p.y + 40 + k * TERM_LH, colour);
    }
    g.restore();
  };

  const drawHover = (g: CanvasRenderingContext2D, hover: number): void => {
    if (hover < 0) return;
    const p = pos(hosts[hover]);
    const text = hostCaption(hosts[hover]);
    g.font = MONO;
    const tw = g.measureText(text).width;
    const x = p.x + 14 + tw > w ? p.x - 14 - tw : p.x + 14;
    caption(g, text, x, p.y - 14, ink(0.95));
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      wide = w >= h * WIDE_RATIO;
      if (wide) {
        cx = w * WIDE_RADAR_X;
        cy = h * 0.56;
        radius = Math.min(w * WIDE_RADAR_R, h * WIDE_RADAR_H);
      } else {
        const top = TACTIC_Y;
        const bottom = h - TERM_H - 14;
        cx = w / 2;
        cy = (top + bottom) / 2;
        radius = Math.min(w * NARROW_RADAR_R, ((bottom - top) / 2) * 0.92);
      }
    },
    pointer(kind: PointerKind, x: number, y: number, t: number) {
      pointer = kind === 'leave' ? null : { x, y };
      if (kind === 'down') scanAt = t;
    },
    act(t) {
      scanAt = t;
      pipeStart = t;
    },
    draw(g, _cw, _ch, t) {
      const stage = railPos(t - pipeStart, STAGES.length, STAGE_S);
      const sweep = t * SWEEP_RATE + scanSpin(t);
      const target = chooseTarget(t, stage);
      if (target !== lockKey) {
        lockAt = lockKey < 0 && reduce ? t - LOCK_S : t; // the still frame opens on a closed lock
        lockKey = target;
      }
      const lock = clamp01((t - lockAt) / LOCK_S);

      drawRail(g, { x: 0, y: RAIL_Y, w }, STAGES, stage);
      drawLegend(g, 16, LEGEND_Y);
      if (wide) drawTacticList(g, 16, TACTIC_Y, stage);
      drawGlow(g);
      g.lineWidth = lineW(1);
      for (const [k, a] of RINGS) {
        g.strokeStyle = stroke('cyan', a);
        g.beginPath();
        g.arc(cx, cy, radius * k, 0, Math.PI * 2);
        g.stroke();
      }
      drawSweep(g, sweep);
      const ping = (i: number): number => {
        const gap = angleGap(sweep, Math.atan2(hosts[i].y, hosts[i].x));
        return gap < SWEEP_RATE * PING_S ? 1 - gap / (SWEEP_RATE * PING_S) : 0;
      };
      const hover = hoverHost();
      drawLinks(g, hosts, pos, cx, cy);
      drawHosts(g, hosts, pos, stage, ping, hover, t);
      drawPath(g, hosts, pos, path, stage);
      g.fillStyle = P.ice;
      g.beginPath();
      g.arc(cx, cy, 3, 0, Math.PI * 2);
      g.fill();
      drawLock(g, target, lock);
      drawHover(g, hover);
      drawPackets(g, t);
      drawTerm(g, t);
    },
  };
}

export function mountUnicron(host: HTMLElement): void {
  mountScene(host, makeScene);
}
