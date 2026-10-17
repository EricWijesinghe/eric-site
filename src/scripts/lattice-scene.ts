// three.js scene for the hero. Loaded only through a dynamic import from hero.ts, so
// named imports here keep the bundle to what the scene actually uses.
import {
  BufferGeometry,
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

const LATTICE_SIZE = 44;
const SPACING = 0.42;
const MAX_DPR = 1.75;
const RIPPLE_HEIGHT = 0.22;
const RIPPLE_DECAY = 0.12;
const CAMERA_BASE_Y = 2.4;

export interface LatticeHandle {
  stop: () => void;
}

function buildFloor(): { geometry: BufferGeometry; positions: Float32Array; base: Float32Array; attr: Float32BufferAttribute } {
  const count = LATTICE_SIZE * LATTICE_SIZE;
  const base = new Float32Array(count * 3);
  const half = ((LATTICE_SIZE - 1) * SPACING) / 2;
  for (let i = 0; i < LATTICE_SIZE; i++) {
    for (let j = 0; j < LATTICE_SIZE; j++) {
      const k = (i * LATTICE_SIZE + j) * 3;
      base[k] = i * SPACING - half;
      base[k + 2] = j * SPACING - half;
    }
  }
  // The attribute copies its input, so ripples are written into its own array.
  const attr = new Float32BufferAttribute(base, 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', attr);
  return { geometry, positions: attr.array as Float32Array, base, attr };
}

export function mountLattice(target: HTMLCanvasElement): LatticeHandle {
  const renderer = new WebGLRenderer({ canvas: target, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));

  const scene = new Scene();
  const camera = new PerspectiveCamera(44, 1, 0.1, 100);
  camera.position.set(0, CAMERA_BASE_Y, 8);
  camera.lookAt(0, 0, 0);

  const floorData = buildFloor();
  const floor = new Points(
    floorData.geometry,
    new PointsMaterial({ color: 0x7eeaf0, size: 0.045, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  floor.position.y = -1.6;
  scene.add(floor);

  const core = new Group();
  const outer = new LineSegments(
    new WireframeGeometry(new IcosahedronGeometry(1.25, 1)),
    new LineBasicMaterial({ color: 0x1fb5c2, transparent: true, opacity: 0.7 }),
  );
  const inner = new LineSegments(
    new WireframeGeometry(new OctahedronGeometry(0.6)),
    new LineBasicMaterial({ color: 0xc9a86a, transparent: true, opacity: 0.85 }),
  );
  core.add(outer, inner);
  core.position.y = 0.4;
  scene.add(core);

  let pointerX = 0;
  let pointerY = 0;
  let scrollRatio = 0;
  let running = false;
  let frame = 0;
  let last = performance.now();

  const onPointer = (e: PointerEvent): void => {
    pointerX = (e.clientX / window.innerWidth) * 2 - 1;
    pointerY = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onScroll = (): void => {
    scrollRatio = Math.min(window.scrollY / window.innerHeight, 1);
  };

  const resize = (): void => {
    const width = target.clientWidth;
    const height = target.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(target);
  resize();

  const { base, positions, attr } = floorData;
  const count = LATTICE_SIZE * LATTICE_SIZE;

  const tick = (now: number): void => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    for (let i = 0; i < count; i++) {
      const k = i * 3;
      const r = Math.hypot(base[k], base[k + 2]);
      positions[k + 1] = Math.sin(r * 1.4 - t * 1.6) * RIPPLE_HEIGHT * Math.exp(-r * RIPPLE_DECAY);
    }
    attr.needsUpdate = true;

    camera.position.x += (pointerX * 1.6 - camera.position.x) * 0.04;
    camera.position.y +=
      (CAMERA_BASE_Y - pointerY * 0.8 - scrollRatio * 1.2 - camera.position.y) * 0.04;
    camera.lookAt(0, 0.2, 0);

    core.rotation.y += dt * 0.35;
    core.rotation.x = pointerY * 0.2;
    inner.rotation.z += dt * 0.6;
    core.position.y = 0.4 + Math.sin(t * 0.9) * 0.08;

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
  const inView = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) start();
      else pause();
    }
  });
  inView.observe(target);

  const onLost = (e: Event): void => {
    e.preventDefault();
    pause();
    target.classList.remove('is-live');
  };

  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  target.addEventListener('webglcontextlost', onLost);

  start();
  requestAnimationFrame(() => target.classList.add('is-live'));

  return {
    stop: () => {
      pause();
      resizeObserver.disconnect();
      inView.disconnect();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      target.removeEventListener('webglcontextlost', onLost);
      floor.geometry.dispose();
      renderer.dispose();
    },
  };
}
