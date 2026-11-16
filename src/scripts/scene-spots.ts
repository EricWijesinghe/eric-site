// Keyboard and screen-reader access to the things drawn inside a stage. A canvas has no focusable parts, so
// each painter lists its hotspots (a block, a tree node, a host...) and this pool keeps one real <button>
// over each. The pool is one tab stop (roving tabindex, like a toolbar): Tab lands on it, the arrow keys move
// between hotspots, Enter presses one. The buttons ignore the pointer (CSS), so mouse and touch keep working
// the canvas directly; they exist for focus, and their focus ring shows where the keyboard is.

/** A hotspot in the painter's inner frame (CSS px), and the name a screen reader announces for it. */
export interface Spot {
  x: number;
  y: number;
  label: string;
}

export interface SpotHandlers {
  focus(s: Spot): void;
  blur(): void;
  press(s: Spot): void;
}

export interface SpotPool {
  /** Places the buttons; `inset` is the painter frame's offset from the host's corner. Cheap when nothing moved. */
  sync(list: readonly Spot[], inset: number): void;
}

const PREV = new Set(['ArrowLeft', 'ArrowUp']);
const NEXT = new Set(['ArrowRight', 'ArrowDown']);

export function makeSpots(host: HTMLElement, name: string, on: SpotHandlers): SpotPool {
  const box = document.createElement('div');
  box.className = 'scene-spots';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', name);
  host.append(box);
  let spots: readonly Spot[] = [];
  let buttons: HTMLButtonElement[] = [];
  let current = 0;
  let key = '';

  const rove = (i: number): void => {
    current = Math.max(0, Math.min(buttons.length - 1, i));
    buttons.forEach((b, k) => b.setAttribute('tabindex', k === current ? '0' : '-1'));
  };
  const add = (k: number): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'scene-spot';
    b.addEventListener('focus', () => {
      rove(k);
      if (spots[k]) on.focus(spots[k]);
    });
    b.addEventListener('blur', () => on.blur());
    b.addEventListener('click', () => {
      if (spots[k]) on.press(spots[k]);
    });
    b.addEventListener('keydown', (e) => {
      const step = PREV.has(e.key) ? -1 : NEXT.has(e.key) ? 1 : 0;
      const to = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : step ? k + step : -1;
      if (to < 0 || to >= buttons.length) return;
      e.preventDefault();
      buttons[to].focus();
    });
    box.append(b);
    return b;
  };

  return {
    sync(list, inset) {
      const next = list.map((s) => `${Math.round(s.x)},${Math.round(s.y)},${s.label}`).join('|');
      if (next === key) return;
      key = next;
      spots = list;
      while (buttons.length < list.length) buttons.push(add(buttons.length));
      while (buttons.length > list.length) buttons.pop()?.remove();
      list.forEach((s, k) => {
        const b = buttons[k];
        b.setAttribute('aria-label', s.label);
        b.style.setProperty('--sx', `${Math.round(s.x + inset)}px`);
        b.style.setProperty('--sy', `${Math.round(s.y + inset)}px`);
      });
      rove(current);
    },
  };
}
