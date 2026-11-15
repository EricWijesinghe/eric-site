import AxeBuilder from '@axe-core/playwright';
import { chromium, expect, test, type Page } from '@playwright/test';

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

// The Singularity hero is tested in hero.spec.ts. Here it shows its no-WebGL2 still: on CI its
// 90k-bit disk renders on SwiftShader (the CPU), in parallel workers, and starves every page timer
// these layout checks wait on. Its DOM, labels and box are the same either way.
async function heroStill(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === 'webgl2' && this.closest('.m2c-sing') ? null : (get as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof get;
  });
}
test.beforeEach(({ page }) => heroStill(page));

// The testnet is paused; tests never depend on the live gateway.
async function offlineRpc(page: Page): Promise<void> {
  await heroStill(page);
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

// The Singularity hero draws one settled still frame under reduced motion (tests/hero.spec.ts).
test('reduced motion: no three.js scene starts, the static posters stay', async ({ browser }) => {
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

// The hero geometry needs the engine to run, so these tests turn WebGL2 on (the file default blocks it)
// and read his figure box from the engine's m2c:layout event (relative to the stage).
type Box = { x: number; y: number; w: number; h: number };
type HeroGeometry = { stage: Box; nav: Box; h1: Box; graphic: Box; fig: Box };
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function heroGeometry(page: Page): Promise<HeroGeometry> {
  await page.addInitScript(() => {
    window.addEventListener('m2c:layout', (e) => {
      (window as unknown as { __fig?: unknown }).__fig = (e as CustomEvent).detail.fig;
    });
  });
  await page.route('https://rpc.maya2c.dev/**', (route) => route.abort());
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __fig?: unknown }).__fig)), { timeout: 60_000 })
    .toBe(true);
  return page.evaluate(() => {
    const box = (sel: string): Box => {
      const b = document.querySelector(sel)!.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    };
    const stage = box('.m2c-stage');
    const fig = (window as unknown as { __fig: Omit<Box, 'x' | 'y'> & { x: number; y: number } }).__fig;
    return {
      stage,
      nav: box('.nav'),
      h1: box('#hero-title'),
      graphic: box('.m2c-sing'),
      fig: { x: stage.x + fig.x, y: stage.y + fig.y, w: fig.w, h: fig.h },
    };
  });
}

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.w <= outer.x + outer.w + 1 && inner.y + inner.h <= outer.y + outer.h + 1;

// Eric: the graphic owns the first screen under the nav, and the name sits clear of him on the left.
// Playwright cannot set launch args per describe, so these tests launch their own WebGL browser.
test.describe('hero geometry (WebGL on)', () => {
  // The engine's first layout waits for its idle slot and the SwiftShader figure build: 30 s is not enough on CI.
  test.describe.configure({ timeout: 120_000 });

  test('desktop 1440x900: the stage fills the first screen, the name is left of him and does not overlap him', async () => {
    const browser = await chromium.launch({ args: WEBGL_ARGS });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const g = await heroGeometry(page);
    expect(g.stage.y, 'stage starts under the nav').toBeLessThanOrEqual(g.nav.y + g.nav.h + 1);
    expect(g.stage.y + g.stage.h, 'stage fills the first screen').toBeGreaterThanOrEqual(900 - 1);
    expect(g.h1.x + g.h1.w / 2, 'name centred in the left half').toBeLessThan(720);
    expect(overlaps(g.h1, g.fig), 'name box overlaps his figure box').toBe(false);
    await ctx.close();
    await browser.close();
  });

  // Phone: the graphic is on top, the name directly below it, both inside the stage.
  test('phone 360x740: the graphic is on top and the name sits below it, both inside the stage', async () => {
    const browser = await chromium.launch({ args: WEBGL_ARGS });
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const g = await heroGeometry(page);
    expect(g.fig.y + g.fig.h, 'figure ends above the name').toBeLessThanOrEqual(g.h1.y + 1);
    // His bounding box may run past the phone edges (the disk is wider than the screen); his body axis must not.
    expect(g.fig.x + g.fig.w / 2, 'body axis on screen').toBeGreaterThanOrEqual(0);
    expect(g.fig.x + g.fig.w / 2, 'body axis on screen').toBeLessThanOrEqual(360);
    expect(inside(g.graphic, g.stage), 'graphic inside the stage').toBe(true);
    expect(inside(g.h1, g.stage), 'name inside the stage').toBe(true);
    await expect(page.locator('.m2c-stage .hero-actions .btn')).toHaveCount(2);
    const eyebrow = await page.locator('.m2c-eyebrow').evaluate((e) => e.getBoundingClientRect().height);
    expect(eyebrow, 'eyebrow wraps to two lines').toBeLessThan(40);
    await ctx.close();
    await browser.close();
  });
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
