// Skill orbit selection. Works with or without the WebGL scene: each node is a real button
// that shows its detail panel. Without JS every panel stays visible, so nothing is lost.

const stage = document.querySelector<HTMLElement>('[data-orbit]');

if (stage) {
  const buttons = Array.from(stage.querySelectorAll<HTMLButtonElement>('[data-node]'));
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-panel]'));

  const select = (index: number): void => {
    stage.dataset.active = String(index);
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
    panels.forEach((p, i) => (p.hidden = i !== index));
  };

  buttons.forEach((b, i) => {
    b.addEventListener('click', () => select(i));
    // Arrow keys step around the orbit, as a reader would expect from a ring of options.
    b.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = (i + step + buttons.length) % buttons.length;
      select(next);
      buttons[next].focus();
    });
  });
  document.documentElement.classList.add('js-skills');
  select(0);
}

export {};
