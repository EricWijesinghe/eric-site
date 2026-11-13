// Renders public/favicon.svg to the two raster icons browsers and iOS still request:
// public/apple-touch-icon.png (180 px) and public/favicon.ico (a 32 px PNG inside an ICO).
// Run after changing favicon.svg: `node scripts/make-icons.mjs` (needs Playwright's Chromium).
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg', 'utf8');
const browser = await chromium.launch();
async function render(size) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}">`);
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  return png;
}

// ICO = 6-byte header + one 16-byte directory entry + the PNG payload.
function ico(png, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(1, 4);
  head.writeUInt8(size, 6);
  head.writeUInt8(size, 7);
  head.writeUInt16LE(1, 10);
  head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

writeFileSync('public/apple-touch-icon.png', await render(180));
writeFileSync('public/favicon.ico', ico(await render(32), 32));
await browser.close();
console.log('wrote public/apple-touch-icon.png and public/favicon.ico');
