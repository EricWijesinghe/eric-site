// Decides which WebGL scenes run. Reduced motion or no WebGL: none, and the CSS posters stay.
// Nothing 3D loads until the visitor first moves, scrolls, touches or types: three.js plus
// shader compiles cost ~3.6 s of blocking time on a throttled phone when it boots during load
// (Lighthouse, before this gate), and the CSS poster already covers that moment. After that,
// each scene loads only as it nears the viewport, all sharing one three.js chunk.

type Mount = (canvas: HTMLCanvasElement, host: HTMLElement) => void;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglAvailable(): boolean {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
}

const loaders: Record<string, () => Promise<Mount>> = {
  hero: async () => (await import('./hero-scene')).mountHero,
  emblem: async () => (await import('./emblem-scene')).mountEmblem,
  orbit: async () => (await import('./orbit-scene')).mountOrbit,
};

async function mount(host: HTMLElement): Promise<void> {
  const canvas = host.querySelector<HTMLCanvasElement>('canvas');
  const load = loaders[host.dataset.gl ?? ''];
  if (!canvas || !load) return;
  try {
    (await load())(canvas, host);
  } catch (err) {
    // The poster underneath is the fallback; say why in the console, not on the page.
    console.warn('3D scene unavailable, showing the static version:', err);
    host.classList.remove('gl-on');
  }
}

const whenIdle = (fn: () => void): void => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 2000 });
  else setTimeout(fn, 400);
};

if (!reduceMotion) {
  const hosts = Array.from(document.querySelectorAll<HTMLElement>('[data-gl]'));
  const near = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        near.unobserve(e.target);
        void mount(e.target as HTMLElement);
      }
    },
    { rootMargin: '300px 0px' },
  );
  const WAKE = ['pointermove', 'pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;
  const wake = (): void => {
    WAKE.forEach((type) => window.removeEventListener(type, wake));
    whenIdle(() => {
      // Probing creates a GL context, which is not free on a slow phone: only after waking.
      if (!webglAvailable()) return;
      document.documentElement.classList.add('has-gl');
      hosts.forEach((h) => near.observe(h));
    });
  };
  WAKE.forEach((type) => window.addEventListener(type, wake, { passive: true, once: true }));
}
