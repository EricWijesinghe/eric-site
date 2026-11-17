// Mounts the skills loop (Canvas2D, no WebGL) once its stage comes within NEAR_PX of the viewport and the
// browser is idle, so it never competes with first paint. Until then, and without JS, the build-time
// SVG poster in the stage is the still version of the same loop.
import { whenIdle } from '../idle';

const NEAR_PX = 300;
const stage = document.querySelector<HTMLElement>('[data-sk-stage]');

async function mount(host: HTMLElement): Promise<void> {
  try {
    (await import('./loop-scene')).mountLoop(host);
  } catch (err) {
    // The poster stays as the fallback; say why in the console, not on the page.
    console.warn('skills loop unavailable, showing the still version:', err);
  }
}

if (stage) {
  whenIdle(() => {
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        near.disconnect();
        void mount(stage);
      },
      { rootMargin: `${NEAR_PX}px 0px` },
    );
    near.observe(stage);
  });
}
