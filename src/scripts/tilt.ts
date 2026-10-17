// 3D tilt for cards on pointer devices. Values go through CSS custom properties (CSSOM,
// not style attributes), so the strict style-src policy still holds.

const canTilt =
  window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (canTilt) {
  const MAX_TILT_DEG = 9;
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((card) => {
    const setVars = (vars: Record<string, string>): void => {
      for (const [key, value] of Object.entries(vars)) card.style.setProperty(key, value);
    };
    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      setVars({
        '--rx': `${((0.5 - py) * MAX_TILT_DEG).toFixed(2)}deg`,
        '--ry': `${((px - 0.5) * MAX_TILT_DEG).toFixed(2)}deg`,
        '--gx': `${(px * 100).toFixed(1)}%`,
        '--gy': `${(py * 100).toFixed(1)}%`,
      });
    });
    card.addEventListener('pointerleave', () => {
      setVars({ '--rx': '0deg', '--ry': '0deg' });
    });
  });
}
