// Colours for the skills constellation. Each token is read from the stage element, so the section's
// light-theme override (sections-signal-skills.css) reaches the scene without any theme branch here.
import { Color, type Float32BufferAttribute } from './three';
import { cssColor } from './loop';

export interface HueSet {
  rings: readonly string[];
  groups: readonly string[];
  stars: readonly string[];
  blooms: readonly string[];
}

export interface Palette {
  cyan: Color;
  ice: Color;
  /** Deep ink (--text): light theme draws rings and glyphs in it, so they hold 3:1 on pearl. */
  ink: Color;
  rings: Color[];
  groups: Color[];
  stars: Color[];
  blooms: Color[];
}

/** Every colour the scene uses, read from the stage so light and dark tokens both apply. */
export function readPalette(root: Element, hues: HueSet): Palette {
  const col = (token: string): Color => new Color(cssColor(token, '#ffffff', root));
  return {
    cyan: col('--sig-cyan'),
    ice: col('--sig-ice'),
    ink: col('--text'),
    rings: hues.rings.map((t) => col(t)),
    groups: hues.groups.map((t) => col(t)),
    stars: hues.stars.map((t) => col(t)),
    blooms: hues.blooms.map((t) => col(t)),
  };
}

/** Colours every point from a palette by index, so a theme change repaints without rebuilding. */
export function paintCloud(color: Float32BufferAttribute, colors: readonly Color[]): void {
  const first = colors[0] ?? new Color();
  for (let i = 0; i < color.count; i++) {
    const col = colors[i % colors.length] ?? first;
    color.setXYZ(i, col.r, col.g, col.b);
  }
  color.needsUpdate = true;
}
