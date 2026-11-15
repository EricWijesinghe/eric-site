// Skills constellation: six skill groups ride hairline rings around a cyan wireframe crystal, in a
// drifting nebula, with binary and code glyphs flowing along the orbits. The DOM buttons (real,
// focusable, in the HTML) are pinned to the projected node positions each frame, so the scene is
// decoration and the buttons stay the interface. Drag turns the whole constellation; a hovered or
// focused button lights its node. Colours come from the spectrum tokens (data/spectrum.ts), read
// once per theme change, so the scene reads the same in both themes.
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  OctahedronGeometry,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WireframeGeometry,
} from './three';
import { onThemeChange, startLoop } from './loop';
import { paintCloud, readPalette, type HueSet, type Palette } from './orbit-palette';
import { cloud, HALO_FS, HALO_VS, nebula, starField } from './orbit-clouds';
import { GLYPH_OPACITY, glyphTrails, type Trails } from './orbit-glyphs';
import { spreadLabels, type LabelBox } from './orbit-spread';
import { SKILL_HUES } from '../../data/spectrum';

// Ring 0 carries the six nodes, evenly spaced and turning together so labels never pile up;
// the inner two are decoration that precesses around the crystal.
const RINGS = [
  { radius: 4.2, tiltX: -1.08, tiltZ: -0.1, precess: 0, hue: '--sig-cyan' },
  { radius: 2.2, tiltX: 1.35, tiltZ: 0.45, precess: 0.12, hue: '--sig-violet' },
  { radius: 3.0, tiltX: 0.75, tiltZ: -0.6, precess: -0.08, hue: '--sig-azure' },
];
const NODE_SPEED = 0.09;
const PROJECT_MIN_WIDTH = 480;
// Must match the sections-signal-skills.css query that turns the button grid into the projected stage.
const ORBIT_MEDIA = window.matchMedia('(min-width: 1000px)');
// Keeps every projected button this far inside the stage edge.
const EDGE_PAD = 16;
// Projected labels sit this far below their marker (the margin-top in sections-signal-skills.css).
const LABEL_DROP = 30;
const STAR_HUES = ['--sig-ice', '--sig-cyan', '--sig-violet', '--sig-emerald'] as const;
const NEBULA_HUES = ['--sig-violet', '--sig-magenta', '--sig-azure'] as const;
const WHITE = new Color('#ffffff');
const LIGHT_BLOOM_LIFT = 0.6;
const LIGHT_RING_OPACITY = 0.8;
const LIGHT_GLYPH_OPACITY = 0.9;
const DARK_RING_OPACITY = 0.2;
const SLOW = 0.15;
const CRYSTAL_RADIUS = 0.8;
const SHELL_RADIUS = 1.35;
// Small HUD markers: the labels carry the meaning, the points only anchor them.
const NODE_SIZE = 10;
const CORE_SIZE = 8;
const PIXEL_SCALE = 30;
const SHELL_SPIN = 0.1;
const CRYSTAL_SPIN = 0.2;
// Hover: the marker swells and the button lifts a little, both eased.
const HOVER_GROW = 0.9;
const HOVER_LIFT = 0.06;
const HOVER_EASE = 8;
// Drag: a press becomes a drag only after DRAG_PX, so taps still select a group.
const DRAG_PX = 5;
const DRAG_TURN = 0.006;
// Nominal frame rate used to turn the last pointer step into a fling speed.
const FLICK_RATE = 60;
const FLICK_DECAY = 3;
const PITCH_LIMIT = 0.6;
const PITCH_RETURN = 2;

interface Dot {
  pos: readonly [number, number, number];
  size: number;
  alpha: number;
  color: Color;
}

/** Token names per element group, one per scene layer; the colours themselves come from the stage. */
function hueSet(groupCount: number): HueSet {
  return {
    rings: RINGS.map((r) => r.hue),
    groups: Array.from({ length: groupCount }, (_, i) => SKILL_HUES[i % SKILL_HUES.length] ?? '--sig-cyan'),
    stars: STAR_HUES,
    blooms: NEBULA_HUES,
  };
}

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

// Colours are painted later (see readPalette), so the materials start neutral.
function crystal(): { group: Group; faces: MeshBasicMaterial; lines: LineBasicMaterial } {
  const g = new Group();
  // A faint faceted volume so the crystal reads as solid, with a cyan wireframe on top.
  const faces = new MeshBasicMaterial({ transparent: true, opacity: 0.07, depthWrite: false });
  const lines = new LineBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false });
  g.add(
    new Mesh(new IcosahedronGeometry(CRYSTAL_RADIUS, 0), faces),
    new LineSegments(new WireframeGeometry(new IcosahedronGeometry(CRYSTAL_RADIUS, 0)), lines),
  );
  return { group: g, faces, lines };
}

export function mountOrbit(canvas: HTMLCanvasElement, host: HTMLElement): void {
  const buttons = Array.from(host.querySelectorAll<HTMLElement>('[data-node]'));
  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0, 1.2, 11);
  camera.lookAt(0, 0, 0);

  const hues = hueSet(buttons.length);
  const pal = readPalette(host, hues);
  const haloMat = new ShaderMaterial({
    uniforms: { uScale: { value: PIXEL_SCALE }, uLight: { value: 0 } },
    vertexShader: HALO_VS,
    fragmentShader: HALO_FS,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const ringMats = RINGS.map(() => new LineBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false }));
  const linkMat = new LineBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false });
  const shellMat = new LineBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false });

  const world = new Group();
  scene.add(world);
  const core = crystal();
  const shell = new LineSegments(new WireframeGeometry(new OctahedronGeometry(SHELL_RADIUS)), shellMat);
  world.add(core.group, shell);

  // Each ring carries its own glyph trail, so the binary moves with the orbit it lies on.
  const trails: Trails[] = [];
  const ringGroups = RINGS.map((r, i) => {
    const g = new Group();
    g.rotation.set(r.tiltX, 0, r.tiltZ);
    g.add(ringLoop(r.radius, ringMats[i] ?? ringMats[0]!));
    trails.push(glyphTrails(g, r.radius, i % 2 ? -1 : 1));
    world.add(g);
    return g;
  });

  // Node i rides ring 0; the last point is the crystal's own marker at the centre.
  // Colours are placeholders: paint() below sets every point from the palette.
  const nodeDots: Dot[] = [
    ...buttons.map(() => ({ pos: [0, 0, 0] as const, size: NODE_SIZE, alpha: 1, color: pal.cyan })),
    { pos: [0, 0, 0], size: CORE_SIZE, alpha: 1, color: pal.cyan },
  ];
  const nodes = cloud(nodeDots);
  const starCloud = starField(pal.stars);
  const nebulaCloud = nebula(pal.blooms);
  const halos = new Points(nodes.geo, haloMat);
  const stars = new Points(starCloud.geo, haloMat);
  const blooms = new Points(nebulaCloud.geo, haloMat);
  scene.add(blooms, stars, halos);

  // Runs at mount and on every theme change: deep tokens on light, bright on dark.
  const paint = (p: Palette): void => {
    // Additive light vanishes on a pale page, so light theme composites the halos and glyphs normally.
    const light = document.documentElement.dataset.theme === 'light';
    const blend = light ? NormalBlending : AdditiveBlending;
    // Light: rings take the deep ink at higher alpha; dark keeps the spectrum rings untouched.
    ringMats.forEach((m, i) => {
      m.color.copy(light ? p.ink : (p.rings[i] ?? p.cyan));
      m.opacity = light ? LIGHT_RING_OPACITY : DARK_RING_OPACITY;
    });
    linkMat.color.copy(p.ice);
    shellMat.color.copy(p.ice);
    core.faces.color.copy(p.cyan);
    core.lines.color.copy(p.cyan);
    haloMat.blending = blend;
    haloMat.uniforms.uLight!.value = light ? 1 : 0;
    haloMat.needsUpdate = true;
    trails.forEach((t, i) =>
      t.mats.forEach((m) => {
        m.color.copy(light ? p.ink : (p.rings[i] ?? p.cyan));
        m.opacity = light ? LIGHT_GLYPH_OPACITY : GLYPH_OPACITY;
        m.blending = blend;
        // Mipmapped glyphs blur into soft strokes at this size; light theme reads them unfiltered and sharp.
        if (m.map) {
          m.map.minFilter = light ? LinearFilter : LinearMipmapLinearFilter;
          m.map.generateMipmaps = !light;
          m.map.needsUpdate = true;
        }
        m.needsUpdate = true;
      }),
    );
    paintCloud(nodes.color, [...p.groups, p.cyan]);
    paintCloud(starCloud.color, p.stars);
    // Deep blooms on pale paper read as grey smudges, so light theme lifts them toward white.
    paintCloud(nebulaCloud.color, light ? p.blooms.map((c) => c.clone().lerp(WHITE, LIGHT_BLOOM_LIFT)) : p.blooms);
  };
  paint(pal);
  onThemeChange(() => paint(readPalette(host, hues)));

  const linkGeo = new BufferGeometry();
  const linkPos = new Float32BufferAttribute(new Float32Array(6), 3);
  linkGeo.setAttribute('position', linkPos);
  const link = new LineSegments(linkGeo, linkMat);
  scene.add(link);

  // Orbits slow while pointed at, and stop while a node has keyboard focus so it holds still.
  let pointed = false;
  let focused = false;
  host.addEventListener('pointerenter', () => (pointed = true));
  host.addEventListener('pointerleave', () => (pointed = false));
  host.addEventListener('focusin', () => (focused = true));
  host.addEventListener('focusout', () => (focused = false));

  // Drag turns the constellation; a press that moved is not a click, so the group stays put.
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let yaw = 0;
  let yawVel = 0;
  let pitch = 0;
  host.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    yawVel = 0;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (!moved) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_PX) return;
      moved = true;
    }
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const step = dx * DRAG_TURN;
    yaw += step;
    yawVel = step * FLICK_RATE;
    pitch = Math.min(Math.max(pitch + dy * DRAG_TURN, -PITCH_LIMIT), PITCH_LIMIT);
  });
  const release = (): void => {
    dragging = false;
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  // A drag ends in a click on the button under the pointer; swallow that one.
  host.addEventListener(
    'click',
    (e) => {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  let width = 1;
  let height = 1;
  let project = false;
  let speed = 1;
  let spin = -Math.PI / 2;
  const hover = buttons.map(() => 0);
  const v = new Vector3();

  startLoop({
    canvas,
    scene,
    camera,
    onResize: (w, h, dpr) => {
      width = w;
      height = h;
      project = w >= PROJECT_MIN_WIDTH && ORBIT_MEDIA.matches;
      host.classList.toggle('is-projected', project);
      haloMat.uniforms.uScale!.value = PIXEL_SCALE * dpr * Math.min(h / 600, 1.3);
      camera.position.z = project ? 11 : 9.5;
      if (!project) buttons.forEach((b) => b.style.removeProperty('transform'));
    },
    onFrame: ({ t, dt }) => {
      speed += ((focused ? 0 : pointed ? SLOW : 1) - speed) * (1 - Math.exp(-dt * 3));
      if (!dragging) {
        yaw += yawVel * dt;
        yawVel *= Math.exp(-dt * FLICK_DECAY);
        pitch *= Math.exp(-dt * PITCH_RETURN);
      }
      const active = Number(host.dataset.active ?? -1);
      const hovered = Number(host.dataset.hover ?? -1);
      world.rotation.set(pitch, yaw + Math.sin(t * 0.1) * 0.15, 0);
      core.group.rotation.set(t * CRYSTAL_SPIN, t * 0.3, 0);
      shell.rotation.set(-t * SHELL_SPIN, t * 0.15, 0);
      stars.rotation.y = t * 0.01;
      blooms.rotation.y = -t * 0.006;
      trails.forEach((tr) => tr.spin(t));

      spin += dt * NODE_SPEED * speed;
      ringGroups.forEach((g, i) => (g.rotation.y = t * (RINGS[i]?.precess ?? 0)));
      scene.updateMatrixWorld();
      const r = RINGS[0]!.radius;
      const easeHover = 1 - Math.exp(-dt * HOVER_EASE);
      const placed: { i: number; box: LabelBox; s: number; depth: number; h: number }[] = [];
      buttons.forEach((_, i) => {
        hover[i] = (hover[i] ?? 0) + ((i === hovered ? 1 : 0) - (hover[i] ?? 0)) * easeHover;
        const h = hover[i] ?? 0;
        nodes.size.setX(i, NODE_SIZE * (1 + HOVER_GROW * h));
        const a = spin + (i / buttons.length) * Math.PI * 2;
        v.set(Math.cos(a) * r, Math.sin(a) * r, 0).applyMatrix4(ringGroups[0]!.matrixWorld);
        nodes.pos.setXYZ(i, v.x, v.y, v.z);
        if (i === active) linkPos.setXYZ(1, v.x, v.y, v.z);
        if (project) {
          const depth = v.z;
          v.project(camera);
          // Never below 1: a scaled-down button would fall under the 44 px tap target.
          const s = Math.max(1, 0.82 + (depth + 4.3) * 0.045) * (1 + HOVER_LIFT * h);
          const box: LabelBox = {
            x: ((v.x + 1) / 2) * width,
            y: ((1 - v.y) / 2) * height + LABEL_DROP,
            hw: (buttons[i]!.offsetWidth * s) / 2,
            hh: (buttons[i]!.offsetHeight * s) / 2,
          };
          placed.push({ i, box, s, depth, h });
        }
      });
      // Labels are placed together, so neighbours on the front arc never collide (orbit-spread.ts).
      if (project) {
        spreadLabels(
          placed.map((p) => p.box),
          { width, height, pad: EDGE_PAD },
        );
        for (const p of placed) {
          const btn = buttons[p.i]!;
          // The label's CSS margin-top (LABEL_DROP) moves its box down, so the transform takes it back out.
          btn.style.transform = `translate3d(${p.box.x.toFixed(1)}px, ${(p.box.y - LABEL_DROP).toFixed(1)}px, 0) translate(-50%, -50%) scale(${p.s.toFixed(3)})`;
          btn.style.zIndex = String(Math.round(p.depth * 10) + 100 + (p.h > 0.5 ? 50 : 0));
        }
      }
      nodes.pos.setXYZ(buttons.length, 0, 0, 0);
      nodes.pos.needsUpdate = true;
      nodes.size.needsUpdate = true;
      // The link to the selected node is drawn only on the projected stage: off it, the node sits below the crystal and the line reads as a stray beam.
      link.visible = active >= 0 && project;
      linkPos.needsUpdate = true;
    },
  });
}
