// Scroll reveals (the data-reveal API every section uses) and the top progress bar. Content stays
// visible unless JS adds js-reveal to <html>, and reduced motion never hides anything.
// A section reveals as one staggered group: the walk through the page, or the conduit's draw front
// arriving at its heading (revealGroup), triggers it.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const STAGGER_MS = 90;
const MAX_STAGGER_MS = 720;

/** Reveals the root (if it is itself data-reveal) and its pending data-reveal descendants, in order. */
export function revealGroup(root: Element): void {
  const pending: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches('[data-reveal]')) pending.push(root);
  root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => pending.push(el));
  pending
    .filter((el) => !el.classList.contains('is-in'))
    .forEach((el, i) => {
      el.style.setProperty('--d', String(Math.min(i * STAGGER_MS, MAX_STAGGER_MS)));
      el.classList.add('is-in');
    });
}

const bar = document.querySelector<HTMLElement>('[data-progress]');
if (bar && !reduceMotion) {
  let queued = false;
  const paint = (): void => {
    queued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? window.scrollY / max : 0;
    bar.style.transform = `scaleX(${ratio.toFixed(4)})`;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(paint);
      }
    },
    { passive: true },
  );
}

if (!reduceMotion && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('js-reveal');
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        revealGroup(entry.target.closest('main > section') ?? entry.target);
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    // Anything in or above the viewport is shown at load; the rest waits for the walk or the conduit.
    if (el.getBoundingClientRect().top < window.innerHeight) revealGroup(el);
    else io.observe(el);
  });
}
