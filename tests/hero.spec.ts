import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// The Singularity hero (src/scripts/singularity-hero.ts), checked under the CSP that production serves.
// `astro preview` sends no headers, so the policy from public/_headers is attached to the page here.
// upgrade-insecure-requests is dropped: it would rewrite the http://127.0.0.1 test server's own URLs.
const CSP = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
  .match(/Content-Security-Policy:\s*(.+)/)![1]
  .replace(/;\s*upgrade-insecure-requests/, '')
  .trim();

// WebGL2 in headless Chromium runs on SwiftShader (CPU), which recent Chromium only enables on request.
// Software rendering is slow: one test at a time, a phone-sized disk (under 700 px it simulates 45% of
// the bits), and a longer timeout, so input events are not starved by frames.
test.use({
  viewport: { width: 960, height: 600 },
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
});
test.describe.configure({ mode: 'serial', timeout: 120_000 });

type Dbg = { frames: number; fired: number; anchorHaloMax: number; figArcs: number };
const dbg = (page: Page) => page.evaluate(() => (window as unknown as { __m2c?: Dbg }).__m2c ?? null);
const frames = async (page: Page) => (await dbg(page))?.frames ?? 0;

async function open(page: Page, query = ''): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction('__cspViolation', (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __cspViolation: (v: string) => void }).__cspViolation(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.route('https://rpc.maya2c.dev/**', (route) => route.abort());
  await page.route((url) => url.pathname === '/', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': CSP } });
  });
  await page.goto(`/${query}`);
  return violations;
}

test('the hero has no text, is labelled, and nothing breaks the CSP', async ({ page }) => {
  const violations = await open(page, '?debug');
  const hero = page.locator('.m2c-sing');
  await expect(hero).toHaveAttribute('aria-label', /holographic figure of Eric Wijesinghe/);
  await expect(hero.locator('canvas')).toHaveAttribute('role', 'img');
  await expect(hero.locator('canvas')).toHaveAttribute('aria-label', /binary hologram/);
  // Mounted and drawing, so every script and shader has run under the policy.
  await expect.poll(() => frames(page), { timeout: 15_000 }).toBeGreaterThan(5);
  await expect(hero).not.toHaveClass(/m2c-nogl/);
  // ?debug's frame-time readout is the only text allowed, and only in debug.
  const text = await hero.evaluate((e) => { const c = e.cloneNode(true) as HTMLElement; c.querySelector('[data-ms]')?.remove(); return c.textContent?.trim(); });
  expect(text, 'text inside the hero').toBe('');
  expect(violations).toEqual([]);
});

test('it animates, pulses on Space, and stops drawing offscreen and in a hidden tab', async ({ page }) => {
  const violations = await open(page, '?debug');
  await expect.poll(() => frames(page), { timeout: 15_000 }).toBeGreaterThan(5);

  await page.locator('.m2c-sing').focus();
  const fired = (await dbg(page))!.fired;
  await page.keyboard.press('Space');
  expect((await dbg(page))!.fired).toBe(fired + 1);

  await page.locator('#contact').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const offscreen = await frames(page);
  await page.waitForTimeout(800);
  expect(await frames(page), 'frames drawn while offscreen').toBe(offscreen);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => frames(page)).toBeGreaterThan(offscreen);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  const hidden = await frames(page);
  await page.waitForTimeout(800);
  expect(await frames(page), 'frames drawn in a hidden tab').toBe(hidden);
  expect(violations).toEqual([]);
});

// Eric: no line, strand or lightning around his head; it reads as hair. Every bolt that leaves his
// figure must start outside the head halo, however long the cursor circles his head.
test('lightning never leaves from his head, even with the cursor circling it', async ({ page }) => {
  await open(page, '?debug');
  await expect.poll(() => frames(page), { timeout: 15_000 }).toBeGreaterThan(5);
  await page.waitForTimeout(3000); // past the 2.9 s build, when cursor bolts begin
  const box = (await page.locator('.m2c-sing').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height * 0.32;
  // Keep circling until enough bolts have fired: on software rendering frames (and so bolts) are slow.
  for (let i = 0; i < 400 && ((await dbg(page))?.figArcs ?? 0) < 10; i++) {
    const a = i * 0.4;
    await page.mouse.move(cx + Math.cos(a) * box.height * 0.3, cy + Math.sin(a) * box.height * 0.2);
    await page.waitForTimeout(80);
  }
  const d = (await dbg(page))!;
  expect(d.figArcs, 'bolts toward the cursor fired').toBeGreaterThanOrEqual(10);
  expect(d.anchorHaloMax, 'a bolt started inside the head halo').toBe(0);
});

test('reduced motion and ?still draw one settled frame, then stop', async ({ browser }) => {
  for (const [opts, query] of [[{ reducedMotion: 'reduce' as const }, '?debug'], [{}, '?still&t=9&debug']] as const) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await open(page, query);
    await expect.poll(() => frames(page), { timeout: 15_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1200);
    const settled = await frames(page);
    expect(settled, `${query}: frames after settling`).toBeLessThanOrEqual(3);
    // A resize clears the canvas; the still frame must be drawn again, not left black.
    await page.setViewportSize({ width: 800, height: 560 });
    await expect.poll(() => frames(page), { message: `${query}: redrawn after resize` }).toBeGreaterThan(settled);
    await ctx.close();
  }
});

test('without WebGL2 the cyan still shows instead', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === 'webgl2' ? null : (get as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof get;
  });
  await open(page);
  await expect(page.locator('.m2c-sing')).toHaveClass(/m2c-nogl/, { timeout: 15_000 });
  await expect.poll(() => page.locator('.m2c-sing img').evaluate((e) => Number(getComputedStyle(e).opacity))).toBeGreaterThan(0.5);
});
