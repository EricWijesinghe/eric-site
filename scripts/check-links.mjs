// Link check for the built site (dist/). Every href, src, srcset, CSS url(), manifest icon and
// JSON-LD URL is collected. Local targets must exist in dist/ (and #fragments must match an id);
// external ones are fetched. Usage: node scripts/check-links.mjs [--local-only]
// Exit 1 on any broken link. Sites that wall off scripted clients (403/429/999) are reported
// as warnings, not passes and not failures: a person has to look at those.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';

const DIST = 'dist';
const SITE = 'https://eric.maya2c.dev';
const localOnly = process.argv.includes('--local-only');
const TIMEOUT_MS = 20_000;
const BOT_WALLS = new Set([403, 429, 999]);

if (!existsSync(DIST)) {
  console.error('dist/ is missing: run `npm run build` first.');
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(DIST);

const ids = new Map(); // page path -> Set of ids
const refs = []; // { from, url }
const add = (from, url) => {
  if (!url || url.startsWith('data:') || url.startsWith('mailto:') || url.startsWith('javascript:')) return;
  refs.push({ from, url });
};

for (const f of files) {
  const ext = extname(f);
  if (!['.html', '.css', '.webmanifest', '.xml'].includes(ext)) continue;
  const text = readFileSync(f, 'utf8');
  if (ext === '.html') {
    ids.set(f, new Set([...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
    for (const m of text.matchAll(/\s(?:href|src)="([^"]+)"/g)) add(f, m[1]);
    for (const m of text.matchAll(/\ssrcset="([^"]+)"/g)) m[1].split(',').forEach((c) => add(f, c.trim().split(/\s+/)[0]));
    for (const m of text.matchAll(/<meta[^>]+(?:property|name)="(?:og:image|og:url|twitter:image)"[^>]+content="([^"]+)"/g)) add(f, m[1]);
    // JSON-LD: only the values that are real links (url, sameAs), not @id or @context names.
    for (const m of text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))
      for (const node of JSON.parse(m[1])['@graph'] ?? []) [node.url, ...(node.sameAs ?? [])].forEach((u) => add(f, u));
  } else if (ext === '.css') {
    for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) if (!m[1].startsWith('#')) add(f, m[1]);
  } else if (ext === '.webmanifest') {
    for (const m of text.matchAll(/"src"\s*:\s*"([^"]+)"/g)) add(f, m[1]);
  } else {
    for (const m of text.matchAll(/<loc>([^<]+)<\/loc>/g)) add(f, m[1]);
  }
}

// Absolute links to this site are checked against the build, not the live host.
function toLocal(from, url) {
  let u = url.startsWith(SITE) ? url.slice(SITE.length) || '/' : url;
  if (/^[a-z]+:/i.test(u) || u.startsWith('//')) return null;
  const [pathPart, frag] = u.split('#');
  const path = pathPart.split('?')[0];
  let target = path === '' ? from : path.startsWith('/') ? join(DIST, path) : join(dirname(from), path);
  if (path !== '' && (path.endsWith('/') || !extname(target))) target = join(target, 'index.html');
  return { target, frag };
}

const broken = [];
const warned = [];
const external = new Map();
for (const { from, url } of refs) {
  const local = toLocal(from, url);
  if (!local) {
    if (!external.has(url)) external.set(url, from);
    continue;
  }
  if (!existsSync(local.target)) broken.push(`${from}: ${url} -> missing ${local.target}`);
  else if (local.frag && local.target.endsWith('.html') && !ids.get(local.target)?.has(local.frag))
    broken.push(`${from}: ${url} -> no element with id="${local.frag}"`);
}

async function check(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // GET, not HEAD: several hosts answer HEAD with 405 or 404.
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (link-check)' } });
    await res.body?.cancel();
    return res.status;
  } catch (err) {
    return `network error: ${err.cause?.code ?? err.name}`;
  } finally {
    clearTimeout(timer);
  }
}

if (!localOnly) {
  const results = await Promise.all([...external.keys()].map(async (u) => [u, await check(u)]));
  for (const [u, status] of results) {
    if (typeof status === 'number' && status < 400) console.log(`ok   ${status} ${u}`);
    else if (BOT_WALLS.has(status)) warned.push(`${status} ${u} (blocks scripted clients; check by hand)`);
    else broken.push(`${external.get(u)}: ${u} -> ${status}`);
  }
}

console.log(`\n${refs.length} references, ${external.size} external${localOnly ? ' (not fetched)' : ''}.`);
warned.forEach((w) => console.log(`WARN ${w}`));
broken.forEach((b) => console.log(`BROKEN ${b}`));
if (broken.length) process.exit(1);
console.log('No broken links.');
