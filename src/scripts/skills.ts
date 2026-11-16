// Skills loop: selection and DOM. The rail picks a phase or pauses the loop, the index opens one group at
// a time and its rows select a skill, the readout shows what is selected (or hovered, or the phase the
// tour is on). The canvas scene (gl/loop-scene.ts) mounts later and talks through CustomEvents on the
// stage; this file works without it. Without JS every group stays open and the poster shows.
import { SKILL_GROUPS } from '../data/content';
import { ALL_STARS, PHASES, ordinal } from '../data/spectrum';

const stage = document.querySelector<HTMLElement>('[data-sk-stage]');
const section = stage?.closest<HTMLElement>('#skills');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Detail = { source?: string; index?: number; phase?: number; pick?: boolean };

if (stage && section) {
  const q = <T extends Element>(sel: string): T | null => section.querySelector<T>(sel);
  const kicker = q<HTMLElement>('[data-sk-kicker]');
  const name = q<HTMLElement>('[data-sk-name]');
  const how = q<HTMLElement>('[data-sk-how]');
  const readout = q<HTMLElement>('[data-sk-readout]');
  const live = q<HTMLElement>('[data-sk-live]');
  const play = q<HTMLButtonElement>('[data-sk-play]');
  const phases = Array.from(section.querySelectorAll<HTMLButtonElement>('[data-sk-phase]'));
  const groups = Array.from(section.querySelectorAll<HTMLElement>('[data-sk-group]'));
  const rows = Array.from(section.querySelectorAll<HTMLButtonElement>('[data-sk]'));

  let sel = -1;
  let hover = -1;
  let phase = 0;
  let playing = !reduced;

  const send = (type: string, detail: Detail & { turn?: boolean; playing?: boolean }): void => {
    stage.dispatchEvent(new CustomEvent(type, { detail: { ...detail, source: 'dom' } }));
  };

  /** Writes the readout; the underline re-draws only when the subject changes. */
  const show = (k: string, n: string, h: string): void => {
    if (!kicker || !name || !how || !readout) return;
    const changed = name.textContent !== n;
    kicker.textContent = k;
    name.textContent = n;
    how.textContent = h;
    if (changed) {
      readout.classList.remove('is-new');
      void readout.offsetWidth; // restart the underline draw-in
      readout.classList.add('is-new');
    }
  };

  const describe = (i: number): [string, string, string] => {
    const s = ALL_STARS[i]!;
    const where = s.phase >= 0 ? PHASES[s.phase]!.name : 'CORE';
    return [`${where} · ${SKILL_GROUPS[s.group]!.name.toUpperCase()}`, s.name, s.how];
  };

  const paint = (): void => {
    const focus = hover >= 0 ? hover : sel;
    if (focus >= 0) show(...describe(focus));
    else show(`PHASE ${ordinal(phase)}`, PHASES[phase]!.name, PHASES[phase]!.line);
    const s = ALL_STARS[focus]?.group ?? -1;
    for (let i = 0; i < SKILL_GROUPS.length; i++) readout?.classList.toggle(`sk-h${i}`, i === (s >= 0 ? s : -1));
    readout?.classList.toggle('is-phase', focus < 0);
    phases.forEach((b, i) => {
      if (i === phase) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    rows.forEach((r) => r.setAttribute('aria-pressed', String(Number(r.dataset.sk) === sel)));
  };

  const openGroup = (g: number): void => {
    groups.forEach((el, i) => {
      const btn = el.querySelector<HTMLButtonElement>('.sk-gbtn');
      const list = el.querySelector<HTMLElement>('.sk-rows');
      btn?.setAttribute('aria-expanded', String(i === g));
      if (list) list.hidden = i !== g;
      el.classList.toggle('is-open', i === g);
    });
  };

  const announce = (text: string): void => {
    if (live) live.textContent = text;
  };

  const select = (i: number, fromScene: boolean): void => {
    sel = i;
    if (i >= 0) {
      const s = ALL_STARS[i]!;
      openGroup(s.group);
      announce(`${s.name}: ${s.how}`);
    } else announce(`Tour: phase ${PHASES[phase]!.name}`);
    if (!fromScene) send('sk:select', { index: i });
    paint();
  };

  const pickPhase = (p: number): void => {
    sel = -1;
    hover = -1;
    phase = p;
    announce(`Phase ${PHASES[p]!.name}: ${PHASES[p]!.line}`);
    send('sk:phase', { phase: p });
    paint();
  };

  const setPlaying = (on: boolean): void => {
    playing = on;
    play?.classList.toggle('is-paused', !on);
    play?.setAttribute('aria-label', on ? 'Pause the loop' : 'Play the loop');
    send('sk:play', { playing: on });
  };

  /* ---------- from the scene ---------- */
  const fromScene = (fn: (d: Detail) => void) => (e: Event): void => {
    const d = (e as CustomEvent<Detail>).detail;
    if (d?.source === 'scene') fn(d);
  };
  stage.addEventListener('sk:select', fromScene((d) => select(d.index ?? -1, true)));
  stage.addEventListener('sk:hover', fromScene((d) => {
    hover = d.index ?? -1;
    paint();
  }));
  stage.addEventListener('sk:phase', fromScene((d) => {
    if (d.pick) pickPhase(d.phase ?? 0);
    else {
      phase = d.phase ?? 0;
      paint();
    }
  }));

  /* ---------- the DOM controls ---------- */
  phases.forEach((b, i) => b.addEventListener('click', () => pickPhase(i)));
  if (play && !reduced) {
    play.hidden = false;
    play.addEventListener('click', () => {
      // Play also returns a pinned view to the tour; pause holds everything still (WCAG 2.2.2).
      if (!playing && sel >= 0) select(-1, false);
      setPlaying(!playing);
    });
  }
  groups.forEach((el, i) =>
    el.querySelector('.sk-gbtn')?.addEventListener('click', (e) => {
      const open = (e.currentTarget as HTMLElement).getAttribute('aria-expanded') === 'true';
      openGroup(open ? -1 : i);
    }),
  );
  rows.forEach((r) => {
    const i = Number(r.dataset.sk);
    r.addEventListener('click', () => select(sel === i ? -1 : i, false));
    r.addEventListener('focus', () => {
      hover = i;
      send('sk:hover', { index: i, turn: true });
      paint();
    });
    r.addEventListener('blur', () => {
      hover = -1;
      send('sk:hover', { index: -1 });
      paint();
    });
  });
  section.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || sel < 0) return;
    select(-1, false);
  });

  section.classList.add('sk-js');
  openGroup(0);
  paint();
}

export {};
