import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Phones first; 1024/1440 cover the projected 3D orbit, which is where 768 px used to break.
const WIDTHS = [
  { width: 360, height: 740, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 768, height: 1024, mobile: true },
  { width: 1024, height: 768, mobile: false },
  { width: 1440, height: 900, mobile: false },
];
const TAP = 44;
const MIN_FONT_PX = 12;

// The testnet is paused; tests never depend on the live gateway.
async function offlineRpc(page: Page): Promise<void> {
  await page.route('https://rpc.maya2c.dev/**', (route) => route.abort());
}

// Wakes the lazy 3D, walks every section into view so reveal-on-scroll content shows,
// and ends on the skills orbit so its projected buttons are where they really render.
async function walk(page: Page): Promise<void> {
  await page.mouse.wheel(0, 10);
  for (const id of ['about', 'projects', 'skills', 'contact', 'skills']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(1200);
}

type Report = { vw: number; scrollW: number; bodyScrollW: number; over: string[]; small: string[]; tiny: string[] };

// Runs in the page, so its limits come in as an argument rather than from module scope.
function measure({ tap, minFont }: { tap: number; minFont: number }): Report {
  const vw = document.documentElement.clientWidth;
  const name = (e: Element): string =>
    e.tagName.toLowerCase() + (e.id ? `#${e.id}` : '') + (typeof e.className === 'string' && e.className ? `.${e.className.trim().split(/\s+/).join('.')}` : '');
  // Content inside its own horizontal scroller (nav links, the project row) is not page overflow.
  const inScroller = (e: Element): boolean => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
    return false;
  };
  const over: string[] = [];
  const small: string[] = [];
  const tiny: string[] = [];
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('[aria-hidden="true"], .visually-hidden')) continue;
    const b = e.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    if (!inScroller(e) && (b.left < -1 || b.right > vw + 1)) over.push(`${name(e)} [${Math.round(b.left)}, ${Math.round(b.right)}]`);
    if (e.matches('a, button, summary, [role="button"]') && (b.width < tap - 0.5 || b.height < tap - 0.5))
      small.push(`${name(e)} ${Math.round(b.width)}x${Math.round(b.height)}`);
    const own = [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
    if (own && parseFloat(cs.fontSize) < minFont) tiny.push(`${name(e)} ${cs.fontSize}`);
  }
  return { vw, scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, over, small, tiny };
}

for (const vp of WIDTHS) {
  test(`layout holds at ${vp.width}px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
    const page = await ctx.newPage();
    await offlineRpc(page);
    await page.goto('/');
    await walk(page);
    const r = await page.evaluate(measure, { tap: TAP, minFont: MIN_FONT_PX });
    expect(r.scrollW, 'page scrolls sideways').toBeLessThanOrEqual(r.vw);
    expect(r.bodyScrollW, 'body content wider than the viewport').toBeLessThanOrEqual(r.vw);
    expect(r.over, 'elements past the viewport edge').toEqual([]);
    expect(r.small, `tap targets under ${TAP}px`).toEqual([]);
    expect(r.tiny, `text under ${MIN_FONT_PX}px`).toEqual([]);
    await ctx.close();
  });
}

for (const theme of ['dark', 'light'] as const) {
  for (const width of [360, 1440]) {
    test(`WCAG 2.2 AA (axe), ${theme} theme, ${width}px`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await offlineRpc(page);
      await page.goto('/');
      await walk(page);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      await ctx.close();
    });
  }
}

test('reduced motion: no WebGL scene starts, the static posters stay', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await offlineRpc(page);
  await page.goto('/');
  await walk(page);
  await expect(page.locator('html')).not.toHaveClass(/has-gl/);
  await expect(page.locator('.gl-on')).toHaveCount(0);
  await ctx.close();
});

test('RPC down: the Maya2C card says paused, stops polling, claims no finality figure', async ({ page }) => {
  let calls = 0;
  await page.route('https://rpc.maya2c.dev/**', (route) => {
    calls += 1;
    return route.abort();
  });
  await page.goto('/');
  await expect(page.locator('#nv-state')).toHaveText(/Testnet paused/, { timeout: 15_000 });
  await expect(page.locator('#netview .nv-num').first()).toBeHidden();
  const settled = calls;
  await page.waitForTimeout(4500);
  expect(calls, 'kept polling after giving up').toBe(settled);
  await expect(page.locator('body')).not.toContainText('3 of 4');
  await expect(page.locator('body')).toContainText('no external audit yet');
});

test('404 page exists, links home and is not indexed', async ({ page }) => {
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.locator('a[href="/"]')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});
