// Hero entry point. The 3D scene is imported only after idle time and only when the
// hero can use it: a wide viewport, motion allowed, WebGL present. Otherwise the CSS lattice stays.

const canvas = document.querySelector<HTMLCanvasElement>('[data-hero]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
// Phones keep the CSS lattice: the 3D field costs battery and GPU time there.
const wideEnough = window.matchMedia('(min-width: 768px)');

function hasWebGL(): boolean {
  const probe = document.createElement('canvas');
  return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
}

async function boot(target: HTMLCanvasElement): Promise<void> {
  try {
    const { mountLattice } = await import('./lattice-scene');
    mountLattice(target);
  } catch {
    // The CSS lattice stays visible when the 3D field cannot start.
    target.classList.remove('is-live');
  }
}

if (canvas && wideEnough.matches && !reduceMotion.matches && hasWebGL()) {
  const target = canvas;
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => void boot(target), { timeout: 1500 });
  } else {
    setTimeout(() => void boot(target), 300);
  }
}
