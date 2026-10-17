// Scroll-driven reveals and the top progress bar. Both are skipped under reduced motion,
// and content is visible by default, so a failed script leaves nothing hidden.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => io.observe(el));
}
