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

type Dbg = { frames: number; fired: number; anchorHaloMax: number; headZoneHits: number; zoneColumn?: number[]; releaseGlyphs: number; burstOffBody: number; shockInZone: number; absorb: number; glyphs: number; tier: string; p90: number; dpr: number; light: boolean };
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
  await expect(hero.locator('canvas')).toHaveAttribute('aria-label', /field of code and quantum hardware/);
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
  // the page scrolls smoothly, so wait until the hero has really left the viewport, then for the observer to fire
  await expect(page.locator('.m2c-sing')).not.toBeInViewport();
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

// Eric (rounds 1-3): no line may start at, rise from or leave his body, ever: no crown beam, no filament, no arc.
// A release is a spherical burst of binary and code glyphs. Through a release and five seconds of idle and hover,
// the head zone and his silhouette stay empty of ribbons and glyphs, and the burst really spawns its particles.
test('a release bursts from his body as data, and no line ever leaves his head', async ({ page }) => {
  await open(page, '?debug');
  await expect.poll(() => frames(page), { timeout: 15_000 }).toBeGreaterThan(5);
  await page.locator('.m2c-sing').focus();
  const fired = (await dbg(page))!.fired;
  await page.keyboard.press('Space');
  expect((await dbg(page))!.fired, 'the release fired').toBe(fired + 1);
  await expect.poll(async () => (await dbg(page))?.releaseGlyphs ?? 0, { message: 'the release spawned glyph particles' }).toBeGreaterThan(0);
  const box = (await page.locator('.m2c-sing').boundingBox())!;
  for (let i = 0; i < 25; i++) {
    await page.mouse.move(box.x + box.width * (0.3 + 0.4 * Math.abs(Math.sin(i / 3))), box.y + box.height * 0.5);
    await page.waitForTimeout(200);
  }
  const d = (await dbg(page))!;
  expect(d.headZoneHits, 'a line was emitted in the head zone or on his silhouette').toBe(0);
  expect(d.anchorHaloMax, 'an anchor sat inside the head halo').toBe(0);
  // Eric round 10: "letters come when clicked are from no where". Every release glyph starts on his body, below his head.
  expect(d.burstOffBody, 'a release glyph started off his body or inside his head halo').toBe(0);
  // round 10 review: the shock's front drew a halo arc over his head. It is cut from his head and the column above it.
  expect(d.shockInZone, 'the release shock drew on his head or above it').toBe(0);
});

// Eric 11-23: sparks belong on his name only; the page's objects never get shocks (energy-shock.ts was removed)
test('no electric shocks anywhere but the name', async ({ page }) => {
  await open(page, '?debug');
  await expect.poll(() => frames(page), { timeout: 40_000 }).toBeGreaterThan(5);
  await expect(page.locator('canvas.energy-shock')).toHaveCount(0);
});

// Eric round 10: he gets brighter with what he absorbed. The energy overlay reports it as m2c:absorb {k: 0..1}; the
// engine clamps it and eases toward it, so his glow never pops.
test('his glow follows m2c:absorb, clamped and eased', async ({ page }) => {
  await open(page, '?debug');
  await expect.poll(() => frames(page), { timeout: 15_000 }).toBeGreaterThan(5);
  const absorb = async () => (await dbg(page))?.absorb ?? -1;
  expect(await absorb(), 'idle').toBe(0);
  const send = (k: number) => page.evaluate((v) => { window.dispatchEvent(new CustomEvent('m2c:absorb', { detail: { k: v } })); }, k);
  await send(5);
  await expect.poll(absorb, { message: 'rises toward the clamped target', timeout: 40_000 }).toBeGreaterThan(0.9);
  expect(await absorb(), 'clamped to 1').toBeLessThanOrEqual(1);
  await send(0);
  await expect.poll(absorb, { message: 'eases back to rest', timeout: 40_000 }).toBeLessThan(0.05);
});

// The theme toggle recolours the hero live (Eric round 3: the scene follows dark and light).
test('the hero follows the theme toggle without a reload', async ({ page }) => {
  await open(page, '?debug');
  await expect.poll(() => frames(page), { timeout: 40_000 }).toBeGreaterThan(5);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await expect.poll(async () => (await dbg(page))?.light ?? false, { timeout: 40_000 }).toBe(true);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await expect.poll(async () => (await dbg(page))?.light ?? true, { timeout: 40_000 }).toBe(false);
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

// Eric: no line from his head, ever, and nothing may stand above it as a strand. The head zone (his halo and a
// column rising from it) is cut from every ribbon and point before it is emitted, so its hit counter stays 0
// through idle, charge and release.
test('nothing is emitted in the head zone, through idle, charge and release', async ({ page }) => {
  await open(page, '?debug');
  await expect.poll(() => frames(page), { timeout: 15_000 }).toBeGreaterThan(5);
  const box = (await page.locator('.m2c-sing').boundingBox())!;
  const cx = box.x + box.width * 0.7, cy = box.y + box.height * 0.6;
  const zoneHits = async () => (await dbg(page))?.headZoneHits ?? -1;
  await page.waitForTimeout(1500);
  expect(await zoneHits(), 'zone hits while idle').toBe(0);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(2500);
  expect(await zoneHits(), 'zone hits while charging').toBe(0);
  await page.mouse.up();
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(250);
    expect(await zoneHits(), `zone hits ${250 * (i + 1)} ms after release`).toBe(0);
  }
  expect((await dbg(page))!.fired, 'the pulses ran').toBeGreaterThan(0);
});

// Round 10 review: pressing on his face (the natural gesture) drew the cursor lens's thin circle round his jaw and
// neck, and the hover lens swapped his face for a dot patch. Both rest while pressed and on his head.
test('pressing on his face draws no lens or ring there', async ({ page }) => {
  await open(page, '?debug');
  await expect.poll(() => frames(page), { timeout: 15_000 }).toBeGreaterThan(5);
  const fig = await page.evaluate(() => {
    const st = document.querySelector<HTMLElement>('.m2c-sing')!.parentElement!;
    const cs = getComputedStyle(st);
    return [parseFloat(cs.getPropertyValue('--m2c-face-x')), parseFloat(cs.getPropertyValue('--m2c-face-y'))];
  });
  const stage = (await page.locator('.m2c-sing').evaluateHandle((el) => el.parentElement!)).asElement()!;
  const sb = (await stage.boundingBox())!;
  await page.mouse.move(sb.x + fig[0], sb.y + fig[1]);
  await page.waitForTimeout(800);
  await page.mouse.down();
  await page.waitForTimeout(2000);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const d = (await dbg(page)) as (Dbg & { lensInZone: number }) | null;
  expect(d!.lensInZone, 'the cursor lens drew while pressed or on his head').toBe(0);
  expect(d!.shockInZone, 'the release shock drew on his head or above it').toBe(0);
});

// Eric, round 2 (the critic's blocker): a diagonal light trail once ran from the top edge down past his head. The
// sky shader now fades every trail, ray and rain column in the head column, so the column above him stays dark
// through idle, charge and release. Sampled on screen: the share of bright pixels in the column must stay tiny.
// The release shock shell is the one bright thing allowed to cross it, and it is brief.
const BRIGHT_SHARE_MAX = 0.01;
test('the column above his head stays dark through idle, charge and release', async ({ page }) => {
  await open(page, '?debug');
  await expect.poll(() => frames(page), { timeout: 15_000 }).toBeGreaterThan(5);
  const canvas = page.locator('.m2c-sing canvas');
  const brightShare = async (label: string) => {
    const d = (await dbg(page))!;
    const [l, r, floor] = d.zoneColumn ?? [0, 0, 0];
    const box = (await canvas.boundingBox())!;
    const k = box.width / (await canvas.evaluate((c) => (c as HTMLCanvasElement).width));
    const clip = { x: Math.max(0, box.x + l * k), y: Math.max(0, box.y), width: Math.max(1, (r - l) * k), height: Math.max(1, floor * k) };
    // Only the engine is under test. The stage's glyph layers (hero-field, energy overlay) are data Eric asked for
    // around him (round 3, "no blank space around his head"), and the nav now floats over the top of the stage, so
    // its link text sat inside the clip. Both are hidden while the column is sampled.
    const others = (on: boolean) =>
      page.evaluate((show) => {
        const engine = document.querySelector('.m2c-sing canvas');
        document.querySelectorAll<HTMLElement>('canvas, body > header, nav').forEach((el) => {
          if (el !== engine) el.style.setProperty('visibility', show ? '' : 'hidden');
        });
      }, on);
    await others(false);
    const png = await page.screenshot({ clip });
    await others(true);
    const share = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const g = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')!;
      g.drawImage(bmp, 0, 0);
      const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
      // A trail, ray or rain column is thin and sharp; the charge glow that rises off his hair is smooth. Count a
      // pixel only when it is bright AND stands above the mean of its 7x7 neighbourhood, so the glow passes and a
      // 1-3 px line (which sits ~0.6 of its contrast above that mean) still fails.
      const w = bmp.width, h = bmp.height, v = new Float32Array(w * h);
      for (let i = 0; i < v.length; i++) v[i] = Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
      let n = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const c = v[y * w + x];
          if (c <= 140) continue;
          let sum = 0, cnt = 0;
          for (let dy = -3; dy <= 3; dy++)
            for (let dx = -3; dx <= 3; dx++) {
              const yy = y + dy, xx = x + dx;
              if (yy >= 0 && yy < h && xx >= 0 && xx < w) { sum += v[yy * w + xx]; cnt++; }
            }
          if (c - sum / cnt > 40) n++;
        }
      return n / (w * h);
    }, png.toString('base64'));
    expect(share, `${label}: bright share of the column above his head`).toBeLessThan(BRIGHT_SHARE_MAX);
  };
  await page.waitForTimeout(1200);
  await brightShare('idle');
  const box = (await page.locator('.m2c-sing').boundingBox())!;
  const cx = box.x + box.width * 0.7, cy = box.y + box.height * 0.6;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await brightShare('charge');
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await brightShare('after release');
});
