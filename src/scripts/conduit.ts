// The conduit: one line of light from the singularity down the whole page (Conduit.astro).
// It draws itself to the reading line as you scroll, lights a node at each section heading (and
// reveals that section as the front arrives), and sends a packet train down its full length when
// Eric releases a charge. Path maths: conduit-geometry.ts. Reduced motion: drawn, lit, still.
import { revealGroup } from './reveal';
import { buildConduit, pointAt, sAtY, type Anchor, type Conduit } from './conduit-geometry';
import { f, makeNode, setFades, svgEl } from './conduit-svg';

// Same breakpoint as the hero's stacked layout (hero.css): copy sits under the figure there.
const STACKED_QUERY = '(max-width: 1023px), (orientation: portrait)';
const PHONE_X = 6;
const GUTTER_OFFSET_PX = 44;
const MIN_GUTTER_X_PX = 10;
// A cubic S with handles this far off the gutter swings about 0.29 of it: ~25px on desktop.
const BULGE_PX = 86;
// Stacked layouts: no swing at all. Any bulge would bend the line into the 16px copy column, so it runs
// straight down the gutter from under the copy.
const PHONE_BULGE_PX = 0;
const TAIL_PX = 200;
const TAIL_INSET_PX = 24;
const START_DROP_PX = 2;
const DEFAULT_FIG_X = 0.7;
const READ_LINE = 0.55;
// A short seed of light always shows leaving the figure, so the line visibly starts at the hero.
const SEED_DRAW = 0.035;
const DRAW_EASE = 0.16;
const DRAW_EPSILON = 0.0005;
const END_SLACK_PX = 4;
const MAX_STEP_S = 0.05;
const IDLE_SPEED_PX = 320;
const TRAIN_SPEED_PX = 1100;
const TRAIN_SIZE = 18;
const TRAIN_GAP_MS = 70;
const TRICKLE_MIN_MS = 2800;
const TRICKLE_SPAN_MS = 1800;
const MAX_PACKETS = 60;
const FLASH_MS = 900;
const RELEASE_MS = 1600;
// Breathing room around a section eyebrow that the line stops short of.
const CUT_PAD_PX = 10;
const CUT_RADIUS_PX = 4;
// The line is only animated while main is near the viewport; the margin starts it just before it arrives.
const VISIBLE_MARGIN_PX = 200;

interface Parts {
  host: HTMLElement;
  root: HTMLElement;
  svg: SVGSVGElement;
  glow: SVGPathElement;
  core: SVGPathElement;
  nodes: SVGGElement;
  packets: SVGGElement;
  cut: SVGGElement;
  fade: SVGGElement;
  head: SVGCircleElement;
  headGlow: SVGCircleElement;
}

type NodeAnchor = Anchor;

interface NodeState {
  s: number;
  group: SVGElement;
  section: Element;
  lit: boolean;
  revealed: boolean;
  flashUntil: number;
}

interface Packet {
  s: number;
  v: number;
  el: SVGElement;
}

function readParts(): Parts | null {
  const host = document.getElementById('main');
  const root = host?.querySelector<HTMLElement>('.conduit');
  const svg = root?.querySelector<SVGSVGElement>('svg');
  const glow = svg?.querySelector<SVGPathElement>('.cd-glow');
  const core = svg?.querySelector<SVGPathElement>('.cd-core');
  const nodes = svg?.querySelector<SVGGElement>('.cd-nodes');
  const packets = svg?.querySelector<SVGGElement>('.cd-packets');
  const cut = svg?.querySelector<SVGGElement>('.cd-cut');
  const fade = svg?.querySelector<SVGGElement>('.cd-fade');
  const head = svg?.querySelector<SVGCircleElement>('.cd-head');
  const headGlow = svg?.querySelector<SVGCircleElement>('.cd-head-glow');
  if (!host || !root || !svg || !glow || !core || !nodes || !packets || !cut || !fade || !head || !headGlow) return null;
  return { host, root, svg, glow, core, nodes, packets, cut, fade, head, headGlow };
}

// The figure's body axis (--fig-x) sets where the line leaves the hero; phone centres it.
function startAnchor(stage: HTMLElement | null, hr: DOMRect, width: number): Anchor {
  if (!stage) return { x: width * DEFAULT_FIG_X, y: 0 };
  const sr = stage.getBoundingClientRect();
  const raw = parseFloat(getComputedStyle(stage).getPropertyValue('--fig-x'));
  const fx = Number.isFinite(raw) ? raw : DEFAULT_FIG_X;
  return { x: sr.left - hr.left + fx * sr.width, y: sr.bottom - hr.top - START_DROP_PX };
}

// Nodes ride the gutter GUTTER_OFFSET_PX left of each heading. Narrow screens, where the heading
// sits too close to the edge for that, use the thin phone gutter instead.
function nodeAnchor(h: HTMLElement, hr: DOMRect, gutter: boolean): NodeAnchor {
  const r = h.getBoundingClientRect();
  const left = r.left - hr.left;
  const roomy = left >= GUTTER_OFFSET_PX + MIN_GUTTER_X_PX;
  const x = gutter || !roomy ? PHONE_X : left - GUTTER_OFFSET_PX;
  return { x, y: r.top - hr.top + r.height / 2 };
}

function mount(p: Parts): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let geo: Conduit | null = null;
  let nodes: NodeState[] = [];
  const packets: Packet[] = [];
  let target = 0;
  let cur = 0;
  let raf = 0;
  let last = 0;
  let queued = false;
  let visible = true;

  const request = (): void => {
    if (!raf && visible) raf = requestAnimationFrame(tick);
  };

  const light = (n: NodeState): void => {
    n.lit = true;
    n.group.classList.add('is-lit');
    if (!n.revealed) {
      n.revealed = true;
      revealGroup(n.section);
    }
  };

  const paint = (now: number): void => {
    if (!geo) return;
    const s = cur * geo.total;
    const dash = String(1 - cur);
    p.glow.setAttribute('stroke-dashoffset', dash);
    p.core.setAttribute('stroke-dashoffset', dash);
    const hp = pointAt(geo.pts, s);
    for (const el of [p.head, p.headGlow]) {
      el.setAttribute('cx', f(hp.x));
      el.setAttribute('cy', f(hp.y));
      el.setAttribute('opacity', cur > 0 ? '1' : '0');
    }
    for (const n of nodes) {
      if (!n.lit && s >= n.s) light(n);
      n.group.classList.toggle('is-flash', n.flashUntil > now);
    }
  };

  const spawn = (v: number, train: boolean): void => {
    if (packets.length >= MAX_PACKETS) return;
    const el = svgEl('circle', { class: train ? 'cd-pk cd-pk--train' : 'cd-pk', r: train ? 3 : 1.8, opacity: 0 });
    p.packets.append(el);
    packets.push({ s: 0, v, el });
  };

  const stepPackets = (dt: number, now: number): void => {
    if (!geo) return;
    const drawn = cur * geo.total;
    for (let i = packets.length - 1; i >= 0; i--) {
      const pk = packets[i];
      if (!pk) continue;
      const prev = pk.s;
      pk.s += pk.v * dt;
      if (pk.s >= geo.total) {
        pk.el.remove();
        packets.splice(i, 1);
        continue;
      }
      const at = pointAt(geo.pts, pk.s);
      const seen = pk.s <= drawn;
      pk.el.setAttribute('cx', f(at.x));
      pk.el.setAttribute('cy', f(at.y));
      pk.el.setAttribute('opacity', seen ? '1' : '0');
      if (seen) {
        for (const n of nodes) if (prev < n.s && pk.s >= n.s) n.flashUntil = now + FLASH_MS;
      }
    }
  };

  const tick = (now: number): void => {
    raf = 0;
    if (!geo) return;
    const dt = last ? Math.min(MAX_STEP_S, (now - last) / 1000) : 0;
    last = now;
    cur += (target - cur) * DRAW_EASE;
    if (Math.abs(target - cur) < DRAW_EPSILON) cur = target;
    stepPackets(dt, now);
    paint(now);
    if (cur !== target || packets.length > 0 || nodes.some((n) => n.flashUntil > now)) request();
    else last = 0;
  };

  const updateTarget = (): void => {
    if (!geo) return;
    const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - END_SLACK_PX;
    if (reduce || atEnd) {
      target = 1;
      return;
    }
    if (geo.total <= 0) return;
    const readY = window.innerHeight * READ_LINE - p.host.getBoundingClientRect().top;
    target = Math.max(SEED_DRAW, sAtY(geo.pts, readY) / geo.total);
  };

  const setNodes = (heads: HTMLElement[], anchors: NodeAnchor[], g: Conduit): void => {
    p.nodes.replaceChildren();
    nodes = anchors.map((a, i) => {
      const group = makeNode(a);
      p.nodes.append(group);
      return {
        s: g.nodeS[i] ?? g.total,
        group,
        section: heads[i]?.closest('section') ?? p.host,
        lit: false,
        revealed: false,
        flashUntil: 0,
      };
    });
  };

  const build = (): void => {
    const hr = p.host.getBoundingClientRect();
    const w = p.host.offsetWidth;
    const h = p.host.offsetHeight;
    p.svg.setAttribute('width', String(w));
    p.svg.setAttribute('height', String(h));
    p.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const stacked = window.matchMedia(STACKED_QUERY).matches;
    p.root.classList.toggle('is-stacked', stacked);
    // Stacked layouts put the name and lede under the figure, so the line would cut through them. CSS masks
    // it above the copy block; it then leaves from underneath the copy. Desktop leaves from the stage bottom.
    const stage = document.querySelector<HTMLElement>('.m2c-stage');
    const copy = document.querySelector<HTMLElement>('.m2c-copy');
    const cutEl = stacked ? (copy ?? stage) : stage;
    const cutY = cutEl ? cutEl.getBoundingClientRect().bottom - hr.top : 0;
    p.root.style.setProperty('--cd-skip', `${cutY}px`);
    // Eyebrows are cut out of the line so the stroke stops short of their text.
    p.cut.replaceChildren(
      ...Array.from(p.host.querySelectorAll<HTMLElement>('.section-label')).map((el) => {
        // The label is a block; the knockout follows its text, not its full-width box.
        const range = document.createRange();
        range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        return svgEl('rect', {
          x: f(r.left - hr.left - CUT_PAD_PX),
          y: f(r.top - hr.top - CUT_PAD_PX),
          width: f(r.width + 2 * CUT_PAD_PX),
          height: f(r.height + 2 * CUT_PAD_PX),
          rx: CUT_RADIUS_PX,
          fill: '#000',
        });
      }),
    );
    const heads = Array.from(p.host.querySelectorAll<HTMLElement>(':scope > section h2.section-title'));
    const anchors = heads.map((hd) => nodeAnchor(hd, hr, stacked));
    const lastA = anchors[anchors.length - 1];
    if (!lastA) {
      geo = null;
      return;
    }
    const lastSection = heads[heads.length - 1]?.closest('section');
    const bottom = lastSection ? lastSection.getBoundingClientRect().bottom - hr.top : h;
    const tailY = Math.max(lastA.y + 1, Math.min(bottom - TAIL_INSET_PX, lastA.y + TAIL_PX));
    const figStart = startAnchor(document.querySelector<HTMLElement>('.m2c-sing'), hr, w);
    // Stacked: the whole line runs down the gutter from just under the copy block. A diagonal lead-in from the
    // figure's axis would sweep across the section eyebrows and headings (measured at 768 wide), so it is dropped.
    const low = stacked ? cutY + START_DROP_PX : figStart.y;
    const start = stacked ? { x: PHONE_X, y: low } : { x: figStart.x, y: low };
    const sectionTops = heads.map((hd) => (hd.closest('section')?.getBoundingClientRect().top ?? hr.top) - hr.top);
    setFades(p.fade, sectionTops, start, lastA, w);
    geo = buildConduit(start, anchors, { x: lastA.x, y: tailY }, stacked ? PHONE_BULGE_PX : BULGE_PX);
    p.glow.setAttribute('d', geo.d);
    p.core.setAttribute('d', geo.d);
    setNodes(heads, anchors, geo);
    updateTarget();
    cur = target;
    paint(performance.now());
  };

  const scheduleBuild = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      build();
      request();
    });
  };

  const scheduleTrickle = (): void => {
    const wait = TRICKLE_MIN_MS + Math.random() * TRICKLE_SPAN_MS;
    window.setTimeout(() => {
      if (!document.hidden && visible) {
        spawn(IDLE_SPEED_PX, false);
        request();
      }
      scheduleTrickle();
    }, wait);
  };

  const onRelease = (): void => {
    if (reduce) return;
    p.root.classList.add('is-release');
    window.setTimeout(() => p.root.classList.remove('is-release'), RELEASE_MS);
    for (let i = 0; i < TRAIN_SIZE; i++) {
      window.setTimeout(() => {
        spawn(TRAIN_SPEED_PX, true);
        request();
      }, i * TRAIN_GAP_MS);
    }
  };

  const onCharge = (e: Event): void => {
    const level = (e as CustomEvent<{ level?: number }>).detail?.level;
    if (typeof level !== 'number' || !Number.isFinite(level)) return;
    p.root.style.setProperty('--charge', String(Math.min(1, Math.max(0, level))));
  };

  p.glow.setAttribute('pathLength', '1');
  p.core.setAttribute('pathLength', '1');
  p.glow.setAttribute('stroke-dasharray', '1 1');
  p.core.setAttribute('stroke-dasharray', '1 1');
  window.addEventListener(
    'scroll',
    () => {
      if (!visible) return;
      updateTarget();
      request();
    },
    { passive: true },
  );
  window.addEventListener('m2c:charge', onCharge);
  window.addEventListener('m2c:release', onRelease);
  new ResizeObserver(scheduleBuild).observe(p.host);
  // Off-screen (past the contact section, or before the hero ends and main has not arrived) the line
  // stops ticking; returning re-targets the draw front and resumes the loop.
  new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) {
        updateTarget();
        request();
      }
    },
    { rootMargin: `${VISIBLE_MARGIN_PX}px 0px` },
  ).observe(p.host);
  void document.fonts?.ready.then(scheduleBuild);
  if (!reduce) scheduleTrickle();
  build();
  request();
}

const parts = readParts();
if (parts) mount(parts);
