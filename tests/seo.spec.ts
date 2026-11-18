import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Search and share metadata for the built site (`npm run build` first). Head tags, structured data,
// crawlable text and the sitemap/robots files are checked against the real server output.

const NAME = 'Eric Wijesinghe';
const BIO = 'Building systems at the intersection of Rust, cryptography, cybersecurity, and AI.';

// Same WebGL stand-in as layout.spec.ts: the hero's 3D runs on SwiftShader in CI and starves page timers.
async function heroStill(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === 'webgl2' && this.closest('.m2c-sing') ? null : (get as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof get;
  });
}

// The chain RPC is live in production; tests never depend on it.
async function offlineRpc(page: Page): Promise<void> {
  await page.route('https://rpc.maya2c.dev/**', (route) => route.abort());
}

type LdNode = { '@type'?: string | string[]; '@id'?: string; name?: string; [key: string]: unknown };

async function jsonLdNodes(page: Page): Promise<LdNode[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((text) => {
    const doc = JSON.parse(text) as { '@graph'?: LdNode[] };
    return doc['@graph'] ?? [];
  });
}

test.describe('home page head', () => {
  test.beforeEach(async ({ page }) => {
    await heroStill(page);
    await offlineRpc(page);
  });

  test('title, description, canonical and Open Graph / Twitter tags are present and unique', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Eric Wijesinghe — Rust Developer, Security Research, Maya2C/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /pre-mainnet/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://eric.maya2c.dev/');
    for (const prop of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'og:site_name', 'profile:first_name']) {
      await expect(page.locator(`meta[property="${prop}"]`), prop).toHaveCount(1);
    }
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://eric.maya2c.dev/og.png');
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', 'https://eric.maya2c.dev/og.png');
  });

  test('JSON-LD parses and the Person carries the name, with every @id reference resolving', async ({ page }) => {
    await page.goto('/');
    const nodes = await jsonLdNodes(page);
    const person = nodes.find((n) => n['@type'] === 'Person');
    expect(person?.name).toBe(NAME);
    const ids = new Set(nodes.map((n) => n['@id']).filter(Boolean));
    const refs = JSON.stringify(nodes).matchAll(/"@id":"([^"]+)"/g);
    for (const [, ref] of refs) expect(ids.has(ref), `unresolved @id ${ref}`).toBe(true);
    // sameAs lists profiles of the person only; the Maya2C project sits on its own node.
    expect(person?.sameAs).not.toContain('https://maya2c.dev');
  });

  test('no CSP violation is reported by the page (JSON-LD is a data block)', async ({ page }) => {
    // Chromium reports violations as DOM events (not Playwright events), so record them in the page.
    await page.addInitScript(() => {
      const w = window as unknown as { __cspViolations: string[] };
      w.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => w.__cspViolations.push(e.violatedDirective));
    });
    const consoleCsp: string[] = [];
    page.on('console', (m) => {
      if (/content security policy|Refused to/i.test(m.text())) consoleCsp.push(m.text());
    });
    await page.goto('/');
    await page.waitForLoadState('load');
    const domCsp = await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
    expect(domCsp).toEqual([]);
    expect(consoleCsp).toEqual([]);
  });

  test('exactly one h1', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(NAME);
  });

  test('raw server HTML (no JavaScript) carries the name and the bio sentence', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(NAME);
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '');
    expect(text).toContain(BIO);
  });
});

test.describe('secondary pages', () => {
  test('/about carries a ProfilePage whose mainEntity is the Person', async ({ page }) => {
    await heroStill(page);
    await offlineRpc(page);
    await page.goto('/about');
    await expect(page).toHaveTitle(/About Eric Wijesinghe/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/about\/$/);
    const nodes = await jsonLdNodes(page);
    const profile = nodes.find((n) => n['@type'] === 'ProfilePage');
    expect(profile?.mainEntity).toEqual({ '@id': 'https://eric.maya2c.dev/#person' });
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('/maya2c states pre-mainnet and names the creator in its own title', async ({ page }) => {
    await heroStill(page);
    await offlineRpc(page);
    await page.goto('/maya2c');
    await expect(page).toHaveTitle('Maya2C — Post-Quantum Layer-1 Blockchain');
    await expect(page.getByText('Status: pre-mainnet.')).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('the new pages pass WCAG 2.2 AA axe checks', async ({ page }) => {
    await heroStill(page);
    await offlineRpc(page);
    for (const path of ['/about', '/maya2c']) {
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(violations.map((v) => v.id), path).toEqual([]);
    }
  });

  test('the 404 page is noindex and publishes no entity data', async ({ page }) => {
    await heroStill(page);
    await offlineRpc(page);
    await page.goto('/this-page-does-not-exist-xyz');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  });
});

test.describe('crawl files', () => {
  test('sitemap index and the URL sitemap are served and list every indexable page', async ({ request }) => {
    const index = await request.get('/sitemap-index.xml');
    expect(index.status()).toBe(200);
    const sitemap = await request.get('/sitemap-0.xml');
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    for (const loc of ['https://eric.maya2c.dev/', 'https://eric.maya2c.dev/about/', 'https://eric.maya2c.dev/maya2c/']) {
      expect(xml).toContain(`<loc>${loc}</loc>`);
    }
  });

  test('robots.txt is served and points at the sitemap index', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('Sitemap: https://eric.maya2c.dev/sitemap-index.xml');
    expect(body).toMatch(/User-agent: \*/);
  });
});
