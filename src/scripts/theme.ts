// Light/dark toggle. The scenes watch data-theme and recolour themselves.

const toggle = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
const root = document.documentElement;

function label(): void {
  const light = root.dataset.theme === 'light';
  toggle?.setAttribute('aria-pressed', String(light));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#faf8f4' : '#081c28');
}

toggle?.addEventListener('click', () => {
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  try {
    localStorage.setItem('theme', next);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page view only.
  }
  label();
});
label();

export {};
