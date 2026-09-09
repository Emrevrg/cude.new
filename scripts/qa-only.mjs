import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch();
const cases = [
  { url: 'http://localhost:5173/', w: 1920, h: 1080, out: '.qa/cude/cude-desktop.png' },
  { url: 'http://localhost:5173/', w: 1280, h: 800, out: '.qa/cude/cude-laptop.png' },
  { url: 'http://localhost:5173/', w: 390, h: 844, out: '.qa/cude/cude-mobile.png' },
  { url: 'http://localhost:4174/', w: 1920, h: 1080, out: '.qa/showcase/showcase-dashboard-desktop.png' },
  { url: 'http://localhost:4174/', w: 1280, h: 800, out: '.qa/showcase/showcase-laptop.png' },
  { url: 'http://localhost:4174/', w: 390, h: 844, out: '.qa/showcase/showcase-mobile.png' },
];

for (const c of cases) {
  const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h } });
  const page = await ctx.newPage();
  await page.goto(c.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: c.out, fullPage: true });
  console.log(`saved ${c.out} ${c.w}x${c.h}`);
  await ctx.close();
}
await browser.close();
console.log('done');
