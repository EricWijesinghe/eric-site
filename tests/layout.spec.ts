import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Phones first; 1024/1440 cover the projected 3D orbit, which is where 768 px used to break.
const WIDTHS = [
  { width: 320, height: 568, mobile: true },
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
  // No exemption for horizontal scrollers: on a phone, a row that scrolls sideways is exactly
  // the "content running off the display" this test exists to catch.
  const over: string[] = [];
  const small: string[] = [];
  const tiny: string[] = [];
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('[aria-hidden="true"], .visually-hidden')) continue;
    const b = e.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    if (b.left < -1 || b.right > vw + 1) over.push(`${name(e)} [${Math.round(b.left)}, ${Math.round(b.right)}]`);
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

for (const width of [320, 360]) {
  test(`phone nav at ${width}px: every link opens fully on screen, nothing squeezed`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 700 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await offlineRpc(page);
    await page.goto('/');
    const inView = async (sel: string) => {
      for (const b of await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
        expect(b.left, `${sel} left edge`).toBeGreaterThanOrEqual(0);
        expect(b.right, `${sel} right edge`).toBeLessThanOrEqual(width);
        expect(b.height, `${sel} tap height`).toBeGreaterThanOrEqual(TAP);
      }
    };
    await expect(page.locator('.logo')).toContainText('EW');
    await inView('.logo, .nav-menu, .theme-toggle');
    await expect(page.locator('.nav-links a').first()).toBeHidden();
    const menu = page.getByRole('button', { name: 'Menu' });
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['about', 'projects', 'skills', 'contact']) await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    await inView('.nav-links a');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.nav-links a').first()).toBeHidden();
    await ctx.close();
  });
}

test('phone hero: both buttons fully inside the first screen at 360x740', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await offlineRpc(page);
  await page.goto('/');
  const boxes = await page.locator('.hero-actions .btn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  expect(boxes).toHaveLength(2);
  for (const bottom of boxes) expect(bottom).toBeLessThanOrEqual(740);
  const eyebrow = await page.locator('.eyebrow').evaluate((e) => e.getBoundingClientRect().height);
  expect(eyebrow, 'eyebrow wraps to two lines').toBeLessThan(40);
  await ctx.close();
});

test('RPC down: says live data is unavailable (not "paused"), slows polling, claims no finality figure', async ({ page }) => {
  let calls = 0;
  await page.route('https://rpc.maya2c.dev/**', (route) => {
    calls += 1;
    return route.abort();
  });
  await page.goto('/');
  await expect(page.locator('#nv-state')).toHaveText('Live data unavailable right now', { timeout: 15_000 });
  await expect(page.locator('#netview .nv-num').first()).toBeHidden();
  const settled = calls;
  await page.waitForTimeout(4500);
  expect(calls, 'kept polling every 2 s after the gateway went down').toBe(settled);
  await expect(page.locator('body')).not.toContainText('3 of 4');
  await expect(page.locator('body')).toContainText('no external audit yet');
});

function chainInfo(height: number) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { height } }) };
}

test('RPC recovers: the slow retry picks the gateway back up without a reload', async ({ page }) => {
  let down = true;
  await page.clock.install();
  await page.route('https://rpc.maya2c.dev/**', (route) => (down ? route.abort() : route.fulfill(chainInfo(500))));
  await page.goto('/');
  await expect(page.locator('#nv-state')).toHaveText('Live data unavailable right now', { timeout: 15_000 });
  down = false;
  await page.clock.fastForward(31_000);
  await expect(page.locator('#nv-state')).not.toHaveText(/unavailable/, { timeout: 10_000 });
  await expect(page.locator('#nv-height')).toHaveText('500');
});

test('RPC frozen height: never "live", and after a minute says when the last block came', async ({ page }) => {
  await page.clock.install();
  await page.route('https://rpc.maya2c.dev/**', (route) => route.fulfill(chainInfo(1234)));
  await page.goto('/');
  const state = page.locator('#nv-state');
  await expect(state).toHaveText(/waiting for a new block/, { timeout: 10_000 });
  await expect(state).not.toHaveClass(/\bon\b/);
  await page.clock.fastForward(61_000);
  await expect(state).toHaveText(/^no new blocks since /, { timeout: 10_000 });
  await expect(state).not.toHaveClass(/\bon\b/);
});

test('RPC moving height: "live" only once the chain advances', async ({ page }) => {
  let h = 1000;
  await page.route('https://rpc.maya2c.dev/**', (route) => route.fulfill(chainInfo((h += 1))));
  await page.goto('/');
  await expect(page.locator('#nv-state')).toHaveText('live', { timeout: 10_000 });
  await expect(page.locator('#nv-state')).toHaveClass(/\bon\b/);
});

test('404 page exists, links home and is not indexed', async ({ page }) => {
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.locator('a[href="/"]')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});
