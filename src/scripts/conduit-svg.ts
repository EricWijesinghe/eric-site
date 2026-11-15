// SVG building blocks for the conduit overlay (conduit.ts): node markup and the soft mask gradients.
// Split out so conduit.ts stays under the file-size ceiling; the layout decisions stay in conduit.ts.
import type { Anchor } from './conduit-geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HALO_R = 7;
const DOT_R = 1.2;
// Fades the line into the section above at every section top (the mask is 43% there, then full).
const FADE_PX = 120;
// The lead-in brightens from 35% at the figure to full by LEAD_BRIGHT_AT of the way to its first node.
const LEAD_BRIGHT_AT = 0.7;
const LEAD_PAD_PX = 12;

export const f = (n: number): string => n.toFixed(1);

export function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

// A node is a luminous dot with a soft radial halo: no ring, no tick, nothing hard-edged.
export function makeNode(a: Anchor): SVGElement {
  const g = svgEl('g', { class: 'cd-node' });
  const cy = f(a.y);
  const cx = f(a.x);
  g.append(svgEl('circle', { class: 'cd-halo', cx, cy, r: HALO_R }), svgEl('circle', { class: 'cd-dot', cx, cy, r: DOT_R }));
  return g;
}

// Soft mask edges: section tops fade in, and the lead-in from the figure starts dim (no hard wire).
export function setFades(group: SVGGElement, sections: number[], start: Anchor, first: Anchor, w: number): void {
  const lead = svgEl('linearGradient', {
    id: 'cd-lead-fade',
    gradientUnits: 'userSpaceOnUse',
    x1: f(start.x),
    y1: f(start.y),
    x2: f(first.x),
    y2: f(first.y),
  });
  lead.append(
    // Colours come from the theme tokens in flow.css, so the lead recolours with the page theme.
    svgEl('stop', { class: 'cd-lead-0', offset: 0 }),
    svgEl('stop', { class: 'cd-lead-1', offset: LEAD_BRIGHT_AT }),
  );
  const leadX = Math.min(start.x, first.x) - LEAD_PAD_PX;
  const leadTop = Math.min(start.y, first.y);
  const leadBox = svgEl('rect', {
    x: f(leadX),
    y: f(leadTop),
    width: f(Math.abs(start.x - first.x) + 2 * LEAD_PAD_PX),
    height: f(Math.abs(first.y - start.y) + LEAD_PAD_PX),
    fill: 'url(#cd-lead-fade)',
  });
  const tops = sections.map((y) => svgEl('rect', { x: 0, y: f(y), width: w, height: FADE_PX, fill: 'url(#cd-fade-in)' }));
  group.replaceChildren(...tops, lead, leadBox); // lead last: its dim edge wins where bands overlap
}
