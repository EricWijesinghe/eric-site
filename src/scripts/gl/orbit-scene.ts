// Skills orbit: six skill groups circle a Rust core on three tilted rings. The DOM buttons
// (real, focusable, in the HTML) are pinned to the projected node positions each frame, so
// the scene is decoration and the buttons stay the interface.
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  PerspectiveCamera,
  PointLight,
  AmbientLight,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WireframeGeometry,
} from './three';
import { cssColor, onThemeChange, startLoop } from './loop';

// Ring 0 carries the six nodes, evenly spaced and turning together so labels never pile up;
// the inner two are decoration that precesses around the core.
const RINGS = [
  { radius: 4.2, tiltX: -1.08, tiltZ: -0.1, precess: 0 },
  { radius: 2.2, tiltX: 1.35, tiltZ: 0.45, precess: 0.12 },
  { radius: 3.0, tiltX: 0.75, tiltZ: -0.6, precess: -0.08 },
];
const NODE_SPEED = 0.09;
const PROJECT_MIN_WIDTH = 480;
const STARS = 500;
const SLOW = 0.15;

const HALO_VS = /* glsl */ `
  attribute float aSize;
  attribute float aTone;
  uniform float uScale;
  varying float vTone;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / -mv.z;
    vTone = aTone;
  }
`;
const HALO_FS = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uC;
  uniform float uAlpha;
  varying float vTone;
  void main() {
    float a = pow(smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)), 2.2) * uAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(uA, uC, vTone), a);
  }
`;

function ringLoop(radius: number, material: LineBasicMaterial): LineLoop {
  const pts: number[] = [];
  const segments = 128;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return new LineLoop(g, material);
}

function starField(): BufferGeometry {
  const pos: number[] = [];
  const size: number[] = [];
  const tone: number[] = [];
  for (let i = 0; i < STARS; i++) {
    const r = 7 + Math.random() * 9;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 2 - 1);
    pos.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.6, r * Math.sin(ph) * Math.sin(th) - 4);
    size.push(1 + Math.random() * 2.5);
    tone.push(Math.random() < 0.2 ? 1 : 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aSize', new Float32BufferAttribute(size, 1));
  g.setAttribute('aTone', new Float32BufferAttribute(tone, 1));
  return g;
}

export function mountOrbit(canvas: HTMLCanvasElement, host: HTMLElement): void {
  const buttons = Array.from(host.querySelectorAll<HTMLElement>('[data-node]'));
  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0, 1.2, 11);
  camera.lookAt(0, 0, 0);

  const uniforms = { uA: { value: new Color() }, uC: { value: new Color() }, uAlpha: { value: 1 }, uScale: { value: 30 } };
  const haloMat = new ShaderMaterial({ uniforms, vertexShader: HALO_VS, fragmentShader: HALO_FS, transparent: true, depthWrite: false });
  const ringMat = new LineBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false });
  const linkMat = new LineBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false });
  const coreMat = new MeshStandardMaterial({ metalness: 0.8, roughness: 0.3, emissiveIntensity: 0.55 });
  const wireMat = new LineBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false });

  const world = new Group();
  scene.add(world);
  const core = new Mesh(new IcosahedronGeometry(0.75, 1), coreMat);
  const shell = new LineSegments(new WireframeGeometry(new IcosahedronGeometry(1.05, 1)), wireMat);
  world.add(core, shell);
  const key = new PointLight(0xffffff, 60, 20);
  key.position.set(3, 4, 5);
  scene.add(new AmbientLight(0xffffff, 0.45), key);

  const ringGroups = RINGS.map((r) => {
    const g = new Group();
    g.rotation.set(r.tiltX, 0, r.tiltZ);
    g.add(ringLoop(r.radius, ringMat));
    world.add(g);
    return g;
  });

  // Node i rides ring i % 3, the two on a ring sit opposite each other.
  const nodeGeo = new BufferGeometry();
  const nodePos = new Float32BufferAttribute(new Float32Array((buttons.length + 1) * 3), 3);
  nodeGeo.setAttribute('position', nodePos);
  nodeGeo.setAttribute('aSize', new Float32BufferAttribute([...buttons.map(() => 9), 26], 1));
  nodeGeo.setAttribute('aTone', new Float32BufferAttribute([...buttons.map((_, i) => (i % 2 ? 1 : 0)), 1], 1));
  const halos = new Points(nodeGeo, haloMat);
  const stars = new Points(starField(), haloMat);
  scene.add(halos, stars);

  const linkGeo = new BufferGeometry();
  const linkPos = new Float32BufferAttribute(new Float32Array(6), 3);
  linkGeo.setAttribute('position', linkPos);
  const link = new LineSegments(linkGeo, linkMat);
  scene.add(link);

  const applyTheme = (): void => {
    const light = document.documentElement.dataset.theme === 'light';
    uniforms.uA.value.set(cssColor('--gl-a'));
    uniforms.uC.value.set(cssColor('--gl-c'));
    uniforms.uAlpha.value = light ? 0.7 : 1;
    haloMat.blending = light ? NormalBlending : AdditiveBlending;
    haloMat.needsUpdate = true;
    ringMat.color.set(cssColor('--gl-a'));
    wireMat.color.set(cssColor('--gl-b'));
    linkMat.color.set(cssColor('--gl-c'));
    coreMat.color.set(cssColor('--gl-c'));
    coreMat.emissive.set(cssColor('--gl-c'));
    key.color.set(cssColor('--gl-b'));
  };
  applyTheme();
  onThemeChange(applyTheme);

  // Orbits slow while pointed at, and stop while a node has keyboard focus so it holds still.
  let pointed = false;
  let focused = false;
  host.addEventListener('pointerenter', () => (pointed = true));
  host.addEventListener('pointerleave', () => (pointed = false));
  host.addEventListener('focusin', () => (focused = true));
  host.addEventListener('focusout', () => (focused = false));

  let width = 1;
  let height = 1;
  let project = false;
  let speed = 1;
  let spin = -Math.PI / 2;
  const v = new Vector3();

  startLoop({
    canvas,
    scene,
    camera,
    onResize: (w, h, dpr) => {
      width = w;
      height = h;
      project = w >= PROJECT_MIN_WIDTH;
      host.classList.toggle('is-projected', project);
      uniforms.uScale.value = 30 * dpr * Math.min(h / 600, 1.3);
      camera.position.z = project ? 11 : 13;
      if (!project) buttons.forEach((b) => b.style.removeProperty('transform'));
    },
    onFrame: ({ t, dt }) => {
      speed += ((focused ? 0 : pointed ? SLOW : 1) - speed) * (1 - Math.exp(-dt * 3));
      const active = Number(host.dataset.active ?? -1);
      world.rotation.y = Math.sin(t * 0.1) * 0.15;
      core.rotation.set(t * 0.2, t * 0.3, 0);
      shell.rotation.set(-t * 0.1, t * 0.15, 0);
      stars.rotation.y = t * 0.01;

      spin += dt * NODE_SPEED * speed;
      ringGroups.forEach((g, i) => (g.rotation.y = t * RINGS[i].precess));
      scene.updateMatrixWorld();
      const r = RINGS[0].radius;
      buttons.forEach((_, i) => {
        const a = spin + (i / buttons.length) * Math.PI * 2;
        v.set(Math.cos(a) * r, Math.sin(a) * r, 0).applyMatrix4(ringGroups[0].matrixWorld);
        nodePos.setXYZ(i, v.x, v.y, v.z);
        if (i === active) linkPos.setXYZ(1, v.x, v.y, v.z);
        if (project) {
          const depth = v.z;
          v.project(camera);
          const x = ((v.x + 1) / 2) * width;
          const y = ((1 - v.y) / 2) * height;
          const s = 0.82 + (depth + 4.3) * 0.045;
          buttons[i].style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${s.toFixed(3)})`;
          buttons[i].style.zIndex = String(Math.round(depth * 10) + 100);
        }
      });
      nodePos.setXYZ(buttons.length, 0, 0, 0);
      nodePos.needsUpdate = true;
      link.visible = active >= 0;
      linkPos.needsUpdate = true;
    },
  });
}
