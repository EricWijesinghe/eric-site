// Fails the build if any built page carries something the header CSP in public/_headers would
// silently block: an executable inline <script>, a <style> element, or a style="" attribute
// (script-src and style-src are 'self' only, with no hashes). Data blocks such as JSON-LD are
// not scripts and are allowed. Mirrors scripts/check-csp.mjs on maya2c.dev.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
});

const problems = [];
const pages = walk(dist);
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const where = file.slice(dist.length);
  for (const [, attrs] of html.matchAll(/<script\b([^>]*)>/gi)) {
    if (/\bsrc=/.test(attrs) || /type=["']?application\/(ld\+)?json/i.test(attrs)) continue;
    problems.push(`${where}: inline <script${attrs}>`);
  }
  if (/<style\b/i.test(html)) problems.push(`${where}: inline <style> element`);
  for (const [m] of html.matchAll(/<[a-z][^>]*\sstyle=["'][^"']*["']/gi)) problems.push(`${where}: style attribute in ${m.slice(0, 80)}`);
}
if (problems.length) {
  console.error(`check-csp: ${problems.length} thing(s) the CSP would block:`);
  problems.slice(0, 20).forEach((p) => console.error(`  ${p}`));
  process.exit(1);
}
console.log(`check-csp: ${pages.length} pages, no inline scripts or styles`);
