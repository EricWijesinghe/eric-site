// One fixed WebGL canvas behind the whole page. Scroll drives parallax and colour; the
// scene is only imported on wide pointer devices, so phones never load it.
import {
  BufferGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  OctahedronGeometry,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
  WireframeGeometry,
} from 'three';

const GRID = 44;
const SPACING = 0.42;
const MAX_DPR = 1.25;
const SCROLL_UNITS_PER_PX = 1 / 260;
const TEAL = [0.12, 0.71, 0.76];
const VIOLET = [0.65, 0.55, 0.98];
const CORAL = [1.0, 0.54, 0.4];

export interface SceneHandle {
  stop: () => void;
}

function mixInto(out: Float32Array, i: number, a: number[], b: number[], c: number[], t: number): void {
  // t in [0, 2]: teal -> violet -> coral.
  const k = i * 3;
  const u = Math.min(Math.max(t, 0), 2);
  const from = u < 1 ? a : b;
  const to = u < 1 ? b : c;
  const f = u < 1 ? u : u - 1;
  out[k] = from[0] + (to[0] - from[0]) * f;
  out[k + 1] = from[1] + (to[1] - from[1]) * f;
  out[k + 2] = from[2] + (to[2] - from[2]) * f;
}

function buildLattice(): { points: Points; attr: Float32BufferAttribute; color: Float32BufferAttribute; base: Float32Array } {
  const count = GRID * GRID;
  const base = new Float32Array(count * 3);
  const half = ((GRID - 1) * SPACING) / 2;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const k = (i * GRID + j) * 3;
      base[k] = i * SPACING - half;
      base[k + 2] = j * SPACING - half;
    }
  }
  const attr = new Float32BufferAttribute(base, 3);
  const color = new Float32BufferAttribute(new Float32Array(count * 3), 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', attr);
  geometry.setAttribute('color', color);
  const points = new Points(
    geometry,
    new PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  return { points, attr, color, base };
}

function shape(geometry: BufferGeometry, hex: number, opacity: number): LineSegments {
  return new LineSegments(
    new WireframeGeometry(geometry),
    new LineBasicMaterial({ color: hex, transparent: true, opacity }),
  );
}

export function mountBackground(canvas: HTMLCanvasElement): SceneHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 1.4, 9);

  const lattice = buildLattice();
  lattice.points.position.set(0, -2.6, -2);
  lattice.points.rotation.x = -0.45;
  scene.add(lattice.points);

  // Three shapes at different depths; each moves at its own parallax rate.
  const layers = [
    { mesh: shape(new IcosahedronGeometry(1.2, 1), 0x1fb5c2, 0.75), x: -3.6, y: 1.6, z: -1, rate: 0.5 },
    { mesh: shape(new OctahedronGeometry(0.9), 0xff8a65, 0.8), x: 3.9, y: -0.4, z: 0.5, rate: 0.9 },
    { mesh: shape(new DodecahedronGeometry(0.85), 0xa78bfa, 0.75), x: 0.4, y: -2.2, z: 1.8, rate: 1.4 },
  ];
  const group = new Group();
  for (const l of layers) {
    l.mesh.position.set(l.x, l.y, l.z);
    group.add(l.mesh);
  }
  scene.add(group);

  let pointerX = 0;
  let pointerY = 0;
  let scrollY = window.scrollY;
  let running = false;
  let frame = 0;
  let last = performance.now();

  const onPointer = (e: PointerEvent): void => {
    pointerX = (e.clientX / window.innerWidth) * 2 - 1;
    pointerY = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onScroll = (): void => {
    scrollY = window.scrollY;
  };
  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  resize();

  const { points, attr, color, base } = lattice;
  const positions = attr.array as Float32Array;
  const colors = color.array as Float32Array;
  const count = GRID * GRID;
  let smoothScroll = scrollY;

  const tick = (now: number): void => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;
    smoothScroll += (scrollY - smoothScroll) * 0.08;
    const travel = smoothScroll * SCROLL_UNITS_PER_PX;

    // Ripples travel across the lattice; colour follows height and scroll.
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      const r = Math.hypot(base[k], base[k + 2]);
      const wave = Math.sin(r * 1.2 - t * 1.3);
      positions[k + 1] = wave * 0.2 * Math.exp(-r * 0.09);
      mixInto(colors, i, TEAL, VIOLET, CORAL, 1 + wave * 0.6 + Math.sin(travel * 0.5) * 0.4);
    }
    attr.needsUpdate = true;
    color.needsUpdate = true;
    points.position.y = -2.6 + travel * 0.4;

    for (const l of layers) {
      l.mesh.position.y = l.y - travel * l.rate;
      l.mesh.rotation.x += dt * 0.2 * l.rate;
      l.mesh.rotation.y += dt * 0.3;
    }

    camera.position.x += (pointerX * 1.2 - camera.position.x) * 0.04;
    camera.position.y += (1.4 - pointerY * 0.5 - camera.position.y) * 0.04;
    camera.lookAt(0, -travel * 0.3, 0);

    renderer.render(scene, camera);
  };

  const pause = (): void => {
    running = false;
    cancelAnimationFrame(frame);
  };
  const start = (): void => {
    if (running) return;
    running = true;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };
  const onVisibility = (): void => (document.hidden ? pause() : start());
  const onLost = (e: Event): void => {
    e.preventDefault();
    pause();
    document.documentElement.classList.remove('bg-webgl');
  };

  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onLost);

  start();
  requestAnimationFrame(() => document.documentElement.classList.add('bg-webgl'));

  return {
    stop: () => {
      pause();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      lattice.points.geometry.dispose();
      renderer.dispose();
    },
  };
}
