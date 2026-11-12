// The Maya2C mark in 3D: the hexagon from the favicon as a forged ring, its three diagonals
// as bars, and a bronze core. It floats over the live network plate and leans to the pointer.
import {
  AmbientLight,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  TorusGeometry,
} from './three';
import { cssColor, onThemeChange, startLoop } from './loop';

const RING_RADIUS = 1;

export function mountEmblem(canvas: HTMLCanvasElement, host: HTMLElement): void {
  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 20);
  camera.position.set(0, 0, 4.6);

  const ringMat = new MeshStandardMaterial({ metalness: 0.75, roughness: 0.3 });
  const barMat = new MeshStandardMaterial({ metalness: 0.4, roughness: 0.4, emissiveIntensity: 0.6 });
  const coreMat = new MeshStandardMaterial({ metalness: 0.9, roughness: 0.25, emissiveIntensity: 0.5 });

  const mark = new Group();
  // Six tubular segments turn a torus into a hexagon; rotated so a vertex points up, as in the mark.
  const ring = new Mesh(new TorusGeometry(RING_RADIUS, 0.09, 12, 6), ringMat);
  ring.rotation.z = Math.PI / 2;
  mark.add(ring);
  const barGeo = new CylinderGeometry(0.035, 0.035, RING_RADIUS * 2, 10);
  for (let i = 0; i < 3; i++) {
    const bar = new Mesh(barGeo, barMat);
    bar.rotation.z = (i * Math.PI) / 3;
    mark.add(bar);
  }
  mark.add(new Mesh(new IcosahedronGeometry(0.24, 1), coreMat));
  scene.add(mark);

  const key = new PointLight(0xffffff, 30, 12);
  key.position.set(2.5, 2, 3);
  const rim = new PointLight(0xffffff, 26, 12);
  rim.position.set(-2.5, -1.5, 2);
  scene.add(new AmbientLight(0xffffff, 0.5), key, rim);

  const applyTheme = (): void => {
    ringMat.color.set(cssColor('--gl-a'));
    barMat.color.set(cssColor('--gl-b'));
    barMat.emissive.set(cssColor('--gl-a'));
    coreMat.color.set(cssColor('--gl-c'));
    coreMat.emissive.set(cssColor('--gl-c'));
    key.color.set(cssColor('--gl-b'));
    rim.color.set(cssColor('--gl-c'));
  };
  applyTheme();
  onThemeChange(applyTheme);

  let tx = 0;
  let ty = 0;
  host.addEventListener(
    'pointermove',
    (e) => {
      const r = host.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 1.2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 0.8;
    },
    { passive: true },
  );
  host.addEventListener('pointerleave', () => {
    tx = 0;
    ty = 0;
  });

  startLoop({
    canvas,
    scene,
    camera,
    onFrame: ({ t, dt }) => {
      const k = 1 - Math.exp(-dt * 4);
      mark.rotation.y += (tx + Math.sin(t * 0.6) * 0.5 - mark.rotation.y) * k;
      mark.rotation.x += (ty + Math.sin(t * 0.4) * 0.15 - mark.rotation.x) * k;
      mark.position.y = Math.sin(t * 1.1) * 0.06;
    },
  });
}
