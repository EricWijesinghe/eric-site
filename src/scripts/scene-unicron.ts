// UNICRON, as an illustration of an assessment pipeline over an attack-surface graph: recon, enumeration,
// vulnerability scan, validation, report. A radar sweeps the surface at the centre of the stage; the rail
// names the stage; hosts gain service ticks, then severity marks; validation walks one attack path whose
// hops are named by the MITRE ATT&CK tactics set round the radar; a log names each stage in words. The
// target lock follows the pointer (or cycles alone), and a press runs the pipeline again. This is the idea
// of the pipeline, not UNICRON output: UNICRON is a private repository, described and never linked, and the
// drawing carries no address, port or count.
import {
  caption,
  clamp01,
  easeOut,
  ink,
  isLight,
  mountScene,
  PALETTE as P,
  rgbOf,
  rng,
  STILL_T,
  stroke, tint,
  type Painter,
  type PointerKind,
  type Pt,
  type Spot,
} from './scene-core';
import { lineW } from './scene-core';
import {
  buildGraph,
  drawHosts,
  drawLegend,
  drawLinks,
  drawPath,
  drawTacticList,
  drawTacticRing,
  hostSpots,
  hostText,
  HOSTS,
  LIST_ROW,
  listCols,
  tacticAt,
  TACTICS,
  type Host,
  type TacticHit,
} from './scene-unicron-graph';
import { drawRail, railPos } from './scene-steps';

const STAGES = ['RECON', 'ENUMERATE', 'VULN SCAN', 'VALIDATE', 'REPORT'] as const;
const STAGE_S = 3.6; // seconds per pipeline stage
const REDUCED_STAGE_T = 16.4; // reduced motion: the still frame sits in REPORT, with every stage shown
const RAIL_Y = 12;
const LEGEND_Y = 58;
const TACTIC_Y = 96;
const WIDE_RATIO = 1.15;
const WIDE_TOP = 84; // wide: the top tactic name sits below the legend
const WIDE_RING = 30; // px from the radar's rim to the tactic names (scene-unicron-graph RING_GAP)
const WIDE_BOTTOM = 16;
const LOG_CLEAR = 12; // px between the lowest side tactic name and the log
const LABEL_DROP = 1.5; // 1 + sin(30°): the side names' depth below the radar's top, in ring radii
const NARROW_RADAR_R = 0.4; // leaves room for the tactic numbers round the rim
const PEARL_RING_A = 0.35;
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
const PEARL_GLOW = 0.3; // pearl: the violet glow is a hint, not a lavender wash
const HOVER_R = 16; // px: a host this near the pointer is hovered
const TERM_LINE_S = 0.85;
const TERM_ROWS = 6;
const TERM_LH = 18;
const TERM_H = 130;
const TERM_HEADER = 'ILLUSTRATIVE LOG';
// Stage wording only: no address, port, protocol or count, because UNICRON's output is private.
const TERM_LINES = [
  '$ recon',
  '[+] surface mapped',
  '$ enumerate',
  '[+] services listed',
  '$ scan',
  '[!] weak setting found',
  '[.] findings ranked',
  '$ validate',
  '[+] finding confirmed',
  '$ report',
  '[.] report written',
] as const;


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

  let ring: TacticHit[] = []; // the tactic names (round the radar, or listed under it), from the last frame
  // Narrow: the tactic list under the radar, one 44 px row per line of names.
  const listH = (): number => LIST_ROW * Math.ceil(TACTICS.length / listCols(w));
  const pos = (p: Host): Pt => ({ x: cx + p.x * radius, y: cy + p.y * radius });

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
    const a = GLOW_A * (isLight() ? PEARL_GLOW : 1);
    glow.addColorStop(0, tint('violet', a));
    glow.addColorStop(0.6, tint('violet', a * 0.35));
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
    }
  };

  /** The log: stage wording scrolled by the clock, straight on the surface (no card), bottom left. */
  const drawTerm = (g: CanvasRenderingContext2D, t: number): void => {
    const top = h - TERM_H;
    caption(g, TERM_HEADER, 0, top + 14, ink(0.6));
    const idx = Math.floor(t / TERM_LINE_S);
    for (let k = 0; k < TERM_ROWS; k++) {
      const line = TERM_LINES[(idx - TERM_ROWS + 1 + k + TERM_LINES.length * TERM_ROWS) % TERM_LINES.length];
      const colour = line.startsWith('$') ? tint('cyan', 0.95) : line.startsWith('[!]') ? P.alert : ink(0.9);
      caption(g, line, 0, top + 36 + k * TERM_LH, colour);
    }
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      wide = w >= h * WIDE_RATIO;
      if (wide) {
        // The radar at the centre of the stage, the tactic names round it, the log in the lower-left corner.
        // The lower-left tactic name sits sin(30°) of the ring below the centre: it must clear the log's top.
        const rl = Math.min((h - WIDE_TOP - WIDE_BOTTOM) / 2, (h - TERM_H - LOG_CLEAR - WIDE_TOP) / LABEL_DROP);
        cx = w / 2;
        cy = WIDE_TOP + rl;
        radius = Math.max(0, rl - WIDE_RING);
      } else {
        const top = TACTIC_Y;
        const bottom = h - TERM_H - listH() - 14;
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
    spots(): Spot[] {
      return [...ring.map((r) => r.spot), ...hostSpots(hosts, pos)];
    },
    inspect() {
      const e = tacticAt(ring, pointer);
      if (e >= 0) return `${TACTICS[e]}: an ATT&CK tactic, one hop of the illustrative attack path.`;
      const k = hoverHost();
      return k >= 0 ? hostText(hosts[k], k + 1) : null;
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
      const list = { x: 0, y: h - TERM_H - listH() - 6, w, h: listH() };
      ring = wide ? drawTacticRing(g, cx, cy, radius, stage) : drawTacticList(g, cx, cy, radius, list, stage);
      drawGlow(g);
      g.lineWidth = isLight() ? 1 : lineW(1);
      for (const [k, a] of RINGS) {
        g.strokeStyle = isLight() ? rgbOf('cyan', PEARL_RING_A) : stroke('cyan', a);
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
      drawPath(g, hosts, pos, path, stage, !wide);
      const picked = tacticAt(ring, pointer);
      if (picked >= 0) {
        // The picked tactic lights its own hop of the path, whatever stage the pipeline is in.
        const [ha, hb] = [pos(hosts[path[picked]]), pos(hosts[path[picked + 1]])];
        g.strokeStyle = P.cyan;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(ha.x, ha.y);
        g.lineTo(hb.x, hb.y);
        g.stroke();
        g.lineWidth = lineW(1);
      }
      g.fillStyle = P.ice;
      g.beginPath();
      g.arc(cx, cy, 3, 0, Math.PI * 2);
      g.fill();
      drawLock(g, target, lock);
      drawPackets(g, t);
      drawTerm(g, t);
    },
  };
}

export function mountUnicron(host: HTMLElement): void {
  mountScene(host, makeScene);
}
