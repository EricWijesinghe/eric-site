// Skill constellation selection. Works with or without the WebGL scene: each node is a real button
// that shows its detail panel. Without JS every panel stays visible, so nothing is lost. Each group
// takes its spectrum hue as a CSS variable, and hover or focus is mirrored onto the stage so the
// 3D node lights up with its button.
import { SKILL_HUES } from '../data/spectrum';

const stage = document.querySelector<HTMLElement>('[data-orbit]');
const MAX_BACKING_DPR = 2;

if (stage) {
  const buttons = Array.from(stage.querySelectorAll<HTMLButtonElement>('[data-node]'));
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-panel]'));
  const hueOf = (i: number): string => `var(${SKILL_HUES[i % SKILL_HUES.length] ?? '--sig-cyan'})`;

  buttons.forEach((b, i) => b.style.setProperty('--hue', hueOf(i)));
  panels.forEach((p, i) => p.style.setProperty('--hue', hueOf(i)));

  const select = (index: number): void => {
    stage.dataset.active = String(index);
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
    panels.forEach((p, i) => (p.hidden = i !== index));
  };

  const light = (index: number | null): void => {
    if (index === null) delete stage.dataset.hover;
    else stage.dataset.hover = String(index);
  };

  buttons.forEach((b, i) => {
    b.addEventListener('click', () => select(i));
    b.addEventListener('pointerenter', () => light(i));
    b.addEventListener('pointerleave', () => light(null));
    b.addEventListener('focus', () => light(i));
    b.addEventListener('blur', () => light(null));
    // Arrow keys step around the orbit, as a reader would expect from a ring of options.
    b.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = (i + step + buttons.length) % buttons.length;
      select(next);
      buttons[next]?.focus();
    });
  });
  document.documentElement.classList.add('js-skills');
  select(0);
  sizeBeforeGl(stage);
}

// Until the 3D scene mounts, the canvas keeps its 300x150 default and the browser stretches it soft.
// Size the backing store to its CSS box now; once three.js owns the canvas it sizes it itself.
function sizeBeforeGl(host: HTMLElement): void {
  const canvas = host.querySelector<HTMLCanvasElement>('canvas.gl-canvas');
  if (!canvas || typeof ResizeObserver === 'undefined') return;
  const fit = (): void => {
    if (host.classList.contains('gl-on')) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_BACKING_DPR);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  new ResizeObserver(fit).observe(canvas);
  fit();
}

export {};
