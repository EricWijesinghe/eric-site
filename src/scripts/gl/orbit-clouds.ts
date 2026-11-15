// Point clouds for the skills constellation: the glow of each marker, the star field and the far
// nebula. Positions and sizes can be rewritten each frame, so the same buffers serve the whole scene.
import { BufferGeometry, Color, Float32BufferAttribute } from './three';

const STARS = 420;
const NEBULA = 36;

export interface Dot {
  pos: readonly [number, number, number];
  size: number;
  alpha: number;
  color: Color;
}

export interface Cloud {
  geo: BufferGeometry;
  pos: Float32BufferAttribute;
  size: Float32BufferAttribute;
  color: Float32BufferAttribute;
}

/** Shared halo shader: soft round discs. Dark (additive) weights colour by alpha; light (normal blend) takes it as is. */
export const HALO_VS = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / -mv.z;
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;
export const HALO_FS = /* glsl */ `
  uniform float uLight;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float a = pow(smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)), 2.2) * vAlpha;
    if (a < 0.01) discard;
    // Weighting colour by alpha keeps additive discs soft; normal blending would double the falloff and grey them.
    gl_FragColor = vec4(uLight > 0.5 ? vColor : vColor * a, a);
  }
`;

/** A point cloud whose positions and sizes can be rewritten each frame. */
export function cloud(dots: readonly Dot[]): Cloud {
  const n = dots.length;
  const pos = new Float32BufferAttribute(new Float32Array(n * 3), 3);
  const size = new Float32BufferAttribute(new Float32Array(n), 1);
  const alpha = new Float32BufferAttribute(new Float32Array(n), 1);
  const color = new Float32BufferAttribute(new Float32Array(n * 3), 3);
  dots.forEach((d, i) => {
    pos.setXYZ(i, d.pos[0], d.pos[1], d.pos[2]);
    size.setX(i, d.size);
    alpha.setX(i, d.alpha);
    color.setXYZ(i, d.color.r, d.color.g, d.color.b);
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', pos);
  geo.setAttribute('aSize', size);
  geo.setAttribute('aAlpha', alpha);
  geo.setAttribute('aColor', color);
  return { geo, pos, size, color };
}

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;

// Seed colours only: paintCloud() assigns the real ones on mount and on every theme change.
export function starField(colors: readonly Color[]): Cloud {
  const dots: Dot[] = [];
  for (let i = 0; i < STARS; i++) {
    const r = 7 + Math.random() * 9;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 2 - 1);
    dots.push({
      pos: [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.6, r * Math.sin(ph) * Math.sin(th) - 4],
      size: 1 + Math.random() * 2.5,
      alpha: 0.3 + Math.random() * 0.6,
      color: pick(colors),
    });
  }
  return cloud(dots);
}

// Large, faint, far-behind blooms: the colour that makes the stage feel lit from inside.
export function nebula(colors: readonly Color[]): Cloud {
  const dots: Dot[] = [];
  for (let i = 0; i < NEBULA; i++) {
    const r = 6 + Math.random() * 6;
    const th = Math.random() * Math.PI * 2;
    dots.push({
      pos: [Math.cos(th) * r, (Math.random() - 0.5) * 5, Math.sin(th) * r - 5],
      size: 30 + Math.random() * 26,
      alpha: 0.08 + Math.random() * 0.08,
      color: pick(colors),
    });
  }
  return cloud(dots);
}
