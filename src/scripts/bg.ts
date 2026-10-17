// Entry for the fixed page background. Only wide pointer devices with motion allowed and
// WebGL get the three.js scene; everything else keeps the CSS layer, which animates too.

const canvas = document.querySelector<HTMLCanvasElement>('[data-bg]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const desktopPointer = window.matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)');

function hasWebGL(): boolean {
  const probe = document.createElement('canvas');
  return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
}

async function boot(target: HTMLCanvasElement): Promise<void> {
  try {
    const { mountBackground } = await import('./background-scene');
    mountBackground(target);
  } catch {
    // The CSS background stays in place when the scene cannot start.
    document.documentElement.classList.remove('bg-webgl');
  }
}

if (canvas && desktopPointer.matches && !reduceMotion.matches && hasWebGL()) {
  const target = canvas;
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => void boot(target), { timeout: 1500 });
  } else {
    setTimeout(() => void boot(target), 300);
  }
}
