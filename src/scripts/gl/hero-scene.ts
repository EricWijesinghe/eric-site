// Hero: a breathing point lattice (the post-quantum metaphor, literally) with sparse bonds,
// a hexagonal emblem frame, pointer repulsion, scroll dolly and a slow camera drift.
// Positions are static; every bit of motion happens in the vertex shader.
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  NormalBlending,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
} from './three';
import { cssColor, onThemeChange, startLoop } from './loop';

const NX = 38;
const NY = 7;
const NZ = 30;
const STEP = 0.95;
const BOND_CHANCE = 0.16;
const POINT_SIZE = 78;

// Shared by points and bonds so a bond always meets its two points.
const DISPLACE = /* glsl */ `
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uAspect;
  attribute float aSeed;
  varying float vGlow;
  varying float vSeed;
  varying float vFog;
  vec4 place(vec3 p) {
    float w = sin(p.x * 0.33 + uTime * 0.55 + aSeed) * cos(p.z * 0.28 + uTime * 0.4);
    p.y += w * 0.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 clip = projectionMatrix * mv;
    vec2 d = (clip.xy / clip.w - uPointer) * vec2(uAspect, 1.0);
    float infl = smoothstep(0.42, 0.0, length(d));
    mv.xy += normalize(d + 1e-4) * infl * 0.07 * -mv.z;
    vGlow = infl + max(w, 0.0) * 0.3;
    vSeed = aSeed;
    vFog = smoothstep(36.0, 7.0, -mv.z) * smoothstep(1.5, 4.0, -mv.z);
    return mv;
  }
`;

const POINT_VS = /* glsl */ `
  uniform float uSize;
  ${DISPLACE}
  void main() {
    vec4 mv = place(position);
    gl_Position = projectionMatrix * mv;
    float big = step(0.955, aSeed);
    gl_PointSize = uSize * (1.0 + vGlow * 1.4 + big * 1.3) / -mv.z;
  }
`;

const LINE_VS = /* glsl */ `
  ${DISPLACE}
  void main() { gl_Position = projectionMatrix * place(position); }
`;

const FS_HEAD = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform float uAlpha;
  varying float vGlow;
  varying float vSeed;
  varying float vFog;
  vec3 tint() {
    vec3 col = mix(uA, uB, clamp(vGlow, 0.0, 1.0));
    return mix(col, uC, step(0.955, vSeed));
  }
`;

const POINT_FS = /* glsl */ `
  ${FS_HEAD}
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, r), 1.7) * vFog * (0.68 + vGlow * 0.7) * uAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(tint(), a);
  }
`;

const LINE_FS = /* glsl */ `
  ${FS_HEAD}
  void main() { gl_FragColor = vec4(tint(), vFog * (0.3 + vGlow * 0.55) * uAlpha); }
`;

function buildLattice(): { geometry: BufferGeometry; bonds: BufferGeometry } {
  const pos: number[] = [];
  const seed: number[] = [];
  const index = (i: number, j: number, k: number): number => (i * NY + j) * NZ + k;
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) {
      for (let k = 0; k < NZ; k++) {
        pos.push((i - (NX - 1) / 2) * STEP, (j - (NY - 1) / 2) * STEP * 1.2, (k - NZ + 4) * STEP);
        seed.push(Math.random());
      }
    }
  }
  const bondPos: number[] = [];
  const bondSeed: number[] = [];
  const link = (a: number, b: number): void => {
    bondPos.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
    bondSeed.push(seed[a], seed[b]);
  };
  for (let i = 0; i < NX - 1; i++) {
    for (let j = 0; j < NY - 1; j++) {
      for (let k = 0; k < NZ - 1; k++) {
        if (Math.random() > BOND_CHANCE) continue;
        const a = index(i, j, k);
        const axis = Math.floor(Math.random() * 3);
        link(a, axis === 0 ? index(i + 1, j, k) : axis === 1 ? index(i, j + 1, k) : index(i, j, k + 1));
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
  const bonds = new BufferGeometry();
  bonds.setAttribute('position', new Float32BufferAttribute(bondPos, 3));
  bonds.setAttribute('aSeed', new Float32BufferAttribute(bondSeed, 1));
  return { geometry, bonds };
}

function hexRing(radius: number, material: LineBasicMaterial): LineLoop {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    pts.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return new LineLoop(g, material);
}

export function mountHero(canvas: HTMLCanvasElement, host: HTMLElement): void {
  const scene = new Scene();
  const camera = new PerspectiveCamera(52, 1, 0.1, 80);
  const uniforms = {
    uTime: { value: 0 },
    uPointer: { value: [9, 9] as [number, number] },
    uAspect: { value: 1 },
    uSize: { value: POINT_SIZE },
    uA: { value: new Color() },
    uB: { value: new Color() },
    uC: { value: new Color() },
    uAlpha: { value: 1 },
  };
  const { geometry, bonds } = buildLattice();
  const pointMat = new ShaderMaterial({ uniforms, vertexShader: POINT_VS, fragmentShader: POINT_FS, transparent: true, depthWrite: false });
  const lineMat = new ShaderMaterial({ uniforms, vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false });
  const lattice = new Group();
  lattice.add(new Points(geometry, pointMat), new LineSegments(bonds, lineMat));
  lattice.position.y = -1.6;
  scene.add(lattice);

  const ringMat = new LineBasicMaterial({ transparent: true, opacity: 1, depthWrite: false });
  const ringMat2 = new LineBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false });
  const frame = new Group();
  const rings = [hexRing(2.1, ringMat), hexRing(1.6, ringMat2), hexRing(1.05, ringMat)];
  rings.forEach((r) => {
    // WebGL lines are 1px; two offset copies give the frame a visible stroke weight.
    for (const k of [1.012, 0.988]) {
      const copy = r.clone();
      copy.scale.setScalar(k);
      r.add(copy);
    }
    frame.add(r);
  });
  scene.add(frame);

  const applyTheme = (): void => {
    const light = document.documentElement.dataset.theme === 'light';
    uniforms.uA.value.set(cssColor('--gl-a'));
    uniforms.uB.value.set(cssColor('--gl-b'));
    uniforms.uC.value.set(cssColor('--gl-c'));
    uniforms.uAlpha.value = light ? 0.8 : 1;
    const blending = light ? NormalBlending : AdditiveBlending;
    for (const m of [pointMat, lineMat, ringMat, ringMat2]) {
      m.blending = blending;
      m.needsUpdate = true;
    }
    ringMat.color.set(cssColor('--gl-c'));
    ringMat2.color.set(cssColor('--gl-a'));
  };
  applyTheme();
  onThemeChange(applyTheme);

  let px = 9;
  let py = 9;
  let sx = 0;
  let sy = 0;
  host.addEventListener(
    'pointermove',
    (e) => {
      const r = canvas.getBoundingClientRect();
      px = ((e.clientX - r.left) / r.width) * 2 - 1;
      py = -(((e.clientY - r.top) / r.height) * 2 - 1);
    },
    { passive: true },
  );
  host.addEventListener('pointerleave', () => {
    px = 9;
    py = 9;
  });

  startLoop({
    canvas,
    scene,
    camera,
    onResize: (w, h, dpr) => {
      uniforms.uAspect.value = w / h;
      uniforms.uSize.value = POINT_SIZE * dpr * Math.min(h / 800, 1.2);
      const narrow = w / h < 1;
      frame.position.set(narrow ? 0 : 5.2, narrow ? -2.8 : 0.6, 0);
      frame.scale.setScalar(narrow ? 0.7 : 1);
    },
    onFrame: ({ t, dt }) => {
      uniforms.uTime.value = t;
      // Ease the pointer so the repulsion swells and settles rather than snapping.
      const far = px > 2;
      const k = 1 - Math.exp(-dt * 6);
      sx += ((far ? 0 : px) - sx) * k;
      sy += ((far ? 0 : py) - sy) * k;
      uniforms.uPointer.value[0] = far ? 9 : px;
      uniforms.uPointer.value[1] = far ? 9 : py;

      const progress = Math.min(window.scrollY / Math.max(host.offsetHeight, 1), 1.2);
      camera.position.set(Math.sin(t * 0.05) * 1.4 + sx * 0.9, 1.5 + Math.sin(t * 0.07) * 0.35 + sy * 0.5 - progress * 1.2, 12.5 - progress * 6);
      camera.lookAt(0, -progress * 1.5, -4);
      lattice.rotation.y = Math.sin(t * 0.03) * 0.12 + progress * 0.35;

      frame.rotation.set(sy * 0.3 + Math.sin(t * 0.2) * 0.15, sx * 0.4 + t * 0.15, 0);
      rings[1].rotation.set(t * 0.3, t * 0.2, 0);
      rings[2].rotation.set(-t * 0.25, 0, t * 0.4);
    },
  });
}
