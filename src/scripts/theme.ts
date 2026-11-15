// Light/dark toggle. Every scene repaints from one place: a MutationObserver on data-theme, so the
// switch is live (no reload) whether it came from this button or from any other code.

const THEME_EVENT = 'm2c:theme';
const THEME_COLOR = { light: '#f5f8fd', dark: '#02050b' } as const;

const toggle = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
const root = document.documentElement;

function currentTheme(): 'light' | 'dark' {
  return root.dataset.theme === 'light' ? 'light' : 'dark';
}

function syncChrome(theme: 'light' | 'dark'): void {
  toggle?.setAttribute('aria-pressed', String(theme === 'light'));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

// The colour cross-fade (global.css .theme-anim) is switched on for one switch window only.
const SWITCH_MS = 400;
let switchTimer = 0;
function crossFade(): void {
  root.classList.add('theme-anim');
  window.clearTimeout(switchTimer);
  switchTimer = window.setTimeout(() => root.classList.remove('theme-anim'), SWITCH_MS);
}

// Fires once per real change of data-theme, and only then (the attribute is compared first).
let last = currentTheme();
new MutationObserver(() => {
  const next = currentTheme();
  if (next === last) return;
  last = next;
  crossFade();
  syncChrome(next);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: next } }));
}).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

toggle?.addEventListener('click', () => {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  try {
    localStorage.setItem('theme', next);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page view only.
  }
});

syncChrome(last);

export {};
