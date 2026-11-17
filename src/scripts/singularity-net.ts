// The world's computing network, CPU side: a deep field of compute nodes joined by thin edges.
// Idle, packets flow outward from him along the edges. Charging pulls the field toward him and
// reverses the traffic into him. A release strikes nodes, and the energy relays node to node across
// every edge, so the wave reaches the whole canvas. Nothing here touches GL: the hero turns the
// ribbons and dots it reports into draw calls.
import { NET } from './singularity-config';
import { clamp, mix, rng, smooth, type Pt } from './singularity-math';
import { drawNode, nodeStyle, pointOn, routeInto, TRACE_BEND, TRACE_PTS, type NodeStyle } from './singularity-compute';
import type { Ink } from './singularity-ink';
import { ICE } from './singularity-palette';

const NEG = -1e9; // "never struck" (a hit time far in the past)
// Thinner than this, a ribbon line breaks into dashes where its quad misses pixel centres.
const LINE_MIN_PX = 1.5;
const PORTRAIT_CALM = 0.55; // idle edge brightness on a portrait canvas
const TRACE_IDLE = 0.2; // idle brightness of a trace; the packets and the wave are what the eye follows

/** What the field needs from the frame: canvas size and device-px centre, his hub, rotation and charge. */
export interface NetCam { W: number; H: number; dc: Pt; hub: Pt; rot: number; charge: number; dpr: number }

interface Packet { from: number; to: number; p: number; dur: number; hops: number; inward: boolean; big: boolean }
interface Relay { t: number; from: number; to: number }

export class WorldNet {
  readonly n: number;
  readonly sx: Float32Array;
  readonly sy: Float32Array;
  private readonly pu: Float32Array;
  private readonly pv: Float32Array;
  private readonly pz: Float32Array;
  private readonly near: Float32Array; // 1 at the front of the field, 0 at the back
  private readonly prox: Float32Array; // 1 at his disk, 0 at the field's edge
  private readonly hit: Float64Array; // when a release strikes each node
  private readonly glow: Float32Array; // decaying flash from packets that arrive
  private readonly roots: number[];
  private readonly rnd: () => number;
  private readonly style: NodeStyle[]; // what each node computes with: chip, tile, tower or core, its colour and clock
  private readonly trace: Pt[]; // scratch: one trace's route, rewritten per edge
  private readonly route: Pt[]; // scratch: a packet's trace, rewritten per packet
  private edges: [number, number][] = [];
  private adj: number[][] = [];
  private depth: Int32Array = new Int32Array(0);
  private packets: Packet[] = [];
  private relays: Relay[] = [];
  private outAcc = 0;
  private inAcc = 0;
  private hubGlow = 0;

  constructor(seed: number) {
    const n = NET.nodes;
    this.n = n;
    this.rnd = rng(seed);
    this.pu = new Float32Array(n); this.pv = new Float32Array(n); this.pz = new Float32Array(n);
    this.sx = new Float32Array(n); this.sy = new Float32Array(n);
    this.near = new Float32Array(n); this.prox = new Float32Array(n);
    this.hit = new Float64Array(n).fill(NEG); this.glow = new Float32Array(n);
    this.placeNodes();
    this.style = Array.from({ length: n }, () => nodeStyle(this.rnd));
    this.trace = Array.from({ length: TRACE_PTS }, (): Pt => [0, 0]);
    this.route = Array.from({ length: TRACE_PTS }, (): Pt => [0, 0]);
    this.roots = this.byDistance((i) => this.pu[i] ** 2 + this.pv[i] ** 2).slice(0, NET.roots);
    this.joinNodes();
  }

  private placeNodes(): void {
    // Best-candidate sampling spreads the nodes evenly without a visible grid.
    for (let i = 0; i < this.n; i++) {
      let bu = 0, bv = 0, bd = -1;
      for (let k = 0; k < 8; k++) {
        const cu = this.rnd() * 2 - 1, cv = this.rnd() * 2 - 1;
        let d = Infinity;
        for (let j = 0; j < i; j++) d = Math.min(d, (cu - this.pu[j]) ** 2 + (cv - this.pv[j]) ** 2);
        if (d > bd) { bd = d; bu = cu; bv = cv; }
      }
      this.pu[i] = bu; this.pv[i] = bv; this.pz[i] = this.rnd() * 2 - 1;
    }
  }

  private dist2(i: number, j: number): number {
    return (this.pu[i] - this.pu[j]) ** 2 + (this.pv[i] - this.pv[j]) ** 2 + (0.8 * (this.pz[i] - this.pz[j])) ** 2;
  }

  private byDistance(key: (i: number) => number): number[] {
    return Array.from({ length: this.n }, (_, i) => i).sort((a, b) => key(a) - key(b));
  }

  /** Nearest-neighbour edges, then the stragglers joined to the traffic: the field is always one network. */
  private joinNodes(): void {
    const seen = new Set<number>();
    const add = (a: number, b: number): void => {
      if (a === b || a < 0 || b < 0) return;
      const lo = Math.min(a, b), hi = Math.max(a, b), key = lo * this.n + hi;
      if (!seen.has(key)) { seen.add(key); this.edges.push([lo, hi]); }
    };
    for (let i = 0; i < this.n; i++) {
      const near = Array.from({ length: this.n }, (_, j) => j).filter((j) => j !== i).sort((a, b) => this.dist2(i, a) - this.dist2(i, b));
      for (let k = 0; k < NET.neighbours; k++) add(i, near[k]);
    }
    let depth = this.wire();
    while (depth.some((d) => d < 0)) {
      let bi = -1, bj = -1, bd = Infinity;
      for (let i = 0; i < this.n; i++) if (depth[i] < 0) for (let j = 0; j < this.n; j++) if (depth[j] >= 0 && this.dist2(i, j) < bd) { bd = this.dist2(i, j); bi = i; bj = j; }
      add(bi, bj);
      depth = this.wire();
    }
  }

  /** Rebuilds adjacency from the edge list and returns hop depth from the roots (-1 if unreached). */
  private wire(): Int32Array {
    this.adj = Array.from({ length: this.n }, () => []);
    for (const [a, b] of this.edges) { this.adj[a].push(b); this.adj[b].push(a); }
    const depth = new Int32Array(this.n).fill(-1);
    const queue: number[] = [];
    for (const r of this.roots) { depth[r] = 0; queue.push(r); }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      for (const j of this.adj[i]) if (depth[j] < 0) { depth[j] = depth[i] + 1; queue.push(j); }
    }
    this.depth = depth;
    return depth;
  }

  /** Node positions on the field for this frame: slow rotation, perspective, and the pull toward him while charging. */
  project(cam: NetCam): void {
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    const spanX = cam.W * NET.spread, spanY = cam.H * NET.spread;
    for (let i = 0; i < this.n; i++) {
      const u = this.pu[i], z = this.pz[i];
      const x = u * c + z * s, zr = -u * s + z * c;
      const f = 1 / (1 + zr * 0.42);
      let px = cam.dc[0] + x * spanX * f, py = cam.dc[1] + this.pv[i] * spanY * f;
      const prox = clamp(1 - Math.hypot(px - cam.dc[0], py - cam.dc[1]) / spanX, 0, 1);
      const lean = prox * cam.charge * NET.pull;
      px = mix(px, cam.dc[0], lean); py = mix(py, cam.dc[1], lean);
      this.sx[i] = px; this.sy[i] = py;
      this.near[i] = clamp((zr + 1) / 2, 0, 1); this.prox[i] = prox;
    }
  }

  /**
   * The nodes a release reaches first: one per sector of the field around his hub, so the relay fans out in
   * every direction. Within a sector the far nodes are favoured, so the reach runs out to the canvas edges.
   */
  launchNodes(hub: Pt, count: number): number[] {
    const best = new Array<number>(count).fill(-1), score = new Array<number>(count).fill(-1);
    for (let i = 0; i < this.n; i++) {
      const dx = this.sx[i] - hub[0], dy = this.sy[i] - hub[1];
      const sector = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * count) % count;
      const s = Math.hypot(dx, dy) * (0.5 + this.rnd());
      if (s > score[sector]) { score[sector] = s; best[sector] = i; }
    }
    return best.filter((i) => i >= 0);
  }

  /**
   * A release strikes these nodes at these times. The energy then relays one hop per NET.hopDelay
   * (multi-source Dijkstra over the edges), and every edge the wave crosses sends a packet.
   */
  strike(starts: { node: number; t: number }[]): void {
    const n = this.n, dist = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
    for (const s of starts) dist[s.node] = Math.min(dist[s.node], s.t);
    for (let k = 0; k < n; k++) {
      let best = -1;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (best < 0 || dist[i] < dist[best])) best = i;
      if (best < 0) break;
      done[best] = 1;
      for (const j of this.adj[best]) dist[j] = Math.min(dist[j], dist[best] + NET.hopDelay);
    }
    for (let i = 0; i < n; i++) if (dist[i] < Infinity) this.hit[i] = dist[i];
    const relays: Relay[] = [];
    for (const [a, b] of this.edges) {
      if (dist[a] === Infinity || dist[b] === Infinity) continue;
      if (dist[b] === dist[a] + NET.hopDelay) relays.push({ t: dist[a], from: a, to: b });
      else if (dist[a] === dist[b] + NET.hopDelay) relays.push({ t: dist[b], from: b, to: a });
    }
    this.relays = this.relays.concat(relays).sort((x, y) => x.t - y.t);
  }

  /** Advances the traffic. `hub` is his chest in device px, where idle packets leave and charged ones return. */
  step(t: number, dt: number, cam: NetCam): void {
    this.outAcc += dt * NET.idleRate * (1 - cam.charge);
    this.inAcc += dt * NET.chargeRate * cam.charge;
    while (this.outAcc >= 1) { this.outAcc -= 1; this.spawnOut(); }
    while (this.inAcc >= 1) { this.inAcc -= 1; this.spawnIn(); }
    while (this.relays.length && this.relays[0].t <= t) {
      const r = this.relays.shift()!;
      this.packets.push({ from: r.from, to: r.to, p: 0, dur: 0.22, hops: 0, inward: false, big: true });
    }
    const alive: Packet[] = [];
    for (const k of this.packets) {
      k.p += dt / k.dur;
      if (k.p < 1) alive.push(k); else this.arrive(k, alive);
    }
    this.packets = alive;
    const decay = Math.exp(-dt * 4);
    for (let i = 0; i < this.n; i++) this.glow[i] *= decay;
    this.hubGlow *= Math.exp(-dt * 2.5);
  }

  private spawnOut(): void {
    if (this.packets.length >= NET.maxPackets) return;
    const root = this.roots[Math.floor(this.rnd() * this.roots.length)];
    this.packets.push({ from: -1, to: root, p: 0, dur: 0.5, hops: 4, inward: false, big: false });
  }

  private spawnIn(): void {
    if (this.packets.length >= NET.maxPackets) return;
    const from = Math.floor(this.rnd() * this.n);
    if (this.depth[from] < 1) return;
    const to = this.pick(from, -1);
    if (to >= 0) this.packets.push({ from, to, p: 0, dur: 0.5, hops: 0, inward: true, big: false });
  }

  /** A random neighbour one hop further out (dir 1) or nearer the roots (dir -1); -1 when there is none. */
  private pick(i: number, dir: number): number {
    const options = this.adj[i].filter((j) => this.depth[j] === this.depth[i] + dir);
    return options.length ? options[Math.floor(this.rnd() * options.length)] : -1;
  }

  private arrive(k: Packet, out: Packet[]): void {
    if (k.to < 0) { this.hubGlow = 1; return; } // back at him
    this.glow[k.to] = Math.max(this.glow[k.to], 0.6);
    if (k.inward) {
      // the traffic gathers toward the roots, then into him
      const next = this.depth[k.to] === 0 ? -1 : this.pick(k.to, -1);
      if (next >= 0 || this.depth[k.to] === 0) out.push({ from: k.to, to: next, p: 0, dur: 0.45, hops: 0, inward: true, big: false });
      return;
    }
    if (k.hops > 0) {
      const next = this.pick(k.to, 1);
      if (next >= 0) out.push({ from: k.to, to: next, p: 0, dur: 0.45, hops: k.hops - 1, inward: false, big: false });
    }
  }

  private at(i: number, hub: Pt): Pt {
    return i < 0 ? hub : [this.sx[i], this.sy[i]];
  }

  /** Emits this frame's traces, computing nodes, packets and his hub. Points in his head zone are dropped by the ink. */
  paint(t: number, cam: NetCam, ink: Ink): void {
    const { charge, dpr, hub } = cam;
    const calm = cam.W < cam.H ? PORTRAIT_CALM : 1; // a tall canvas has the same nodes in less room: keep the idle field quieter
    for (const [a, b] of this.edges) {
      const s = Math.min(this.hit[a], this.hit[b]), e = Math.max(this.hit[a], this.hit[b]);
      // a trace lights as the wave crosses it and fades behind the front
      const lit = smooth(s, s + 0.07, t) * Math.exp(-Math.max(0, t - e) * 2.4);
      const near = (this.near[a] + this.near[b]) / 2;
      const I = (TRACE_IDLE + 0.35 * charge * near) * calm + 0.9 * lit;
      const A: Pt = [this.sx[a], this.sy[a]], B: Pt = [this.sx[b], this.sy[b]];
      routeInto(this.trace, A, B, (a + b) & 1, TRACE_BEND * dpr);
      ink.path(this.trace, Math.max(LINE_MIN_PX, 1.1 * dpr), I, mix3(this.style[a].hue, this.style[b].hue));
    }
    for (let i = 0; i < this.n; i++) {
      const flash = t >= this.hit[i] ? Math.exp(-(t - this.hit[i]) * 3.2) : 0;
      const lit = Math.min(1, flash + this.glow[i]);
      const alpha = clamp(0.5 + 0.35 * this.near[i] + charge * 0.7 * this.prox[i] + 0.6 * this.glow[i], 0, 1);
      drawNode(ink, { x: this.sx[i], y: this.sy[i], near: this.near[i], lit, charge, t, dpr, alpha, style: this.style[i] });
    }
    for (const k of this.packets) {
      const A = this.at(k.from, hub), B = this.at(k.to, hub);
      routeInto(this.route, A, B, (k.from + k.to) & 1, TRACE_BEND * dpr);
      const p = pointOn(this.route, smooth(0, 1, k.p));
      ink.point(p[0], p[1], (k.big ? 2.8 : 2.2) * dpr, ICE, k.big ? 1 : 0.9);
    }
    if (this.hubGlow > 0.01) ink.point(hub[0], hub[1], 26 * dpr * this.hubGlow, ICE, 0.5 * this.hubGlow);
  }
}

/** The colour of a trace between two nodes: the midpoint of their hues. */
function mix3(a: NodeStyle['hue'], b: NodeStyle['hue']): NodeStyle['hue'] {
  return [mix(a[0], b[0], 0.5), mix(a[1], b[1], 0.5), mix(a[2], b[2], 0.5)];
}
