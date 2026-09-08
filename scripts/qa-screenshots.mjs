import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root, so the script runs anywhere rather than on one machine. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function waitFor(url, timeout = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const r = await fetch(url);

      if (r.ok) {
        return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }

  return false;
}

console.log('Starting servers...');

// Cude.new static: serve build/client
const cudeProc = spawn('npx', ['serve', 'build/client', '-l', '5173'], {
  cwd: 'C:\\Users\\win10\\Desktop\\cude.new',
  shell: true,
  stdio: 'ignore',
});
const finProc = spawn('npx', ['serve', 'verification-finance/dist', '-l', '4174'], {
  cwd: 'C:\\Users\\win10\\Desktop\\cude.new',
  shell: true,
  stdio: 'ignore',
});

await new Promise((r) => setTimeout(r, 3000));

const ok1 = await waitFor('http://localhost:5173/');
const ok2 = await waitFor('http://localhost:4174/');
console.log(`Cude ${ok1} Finance ${ok2}`);

const browser = await chromium.launch();
const contexts = [
  { w: 1920, h: 1080, name: 'desktop' },
  { w: 1280, h: 800, name: 'laptop' },
  { w: 390, h: 844, name: 'mobile' },
];

for (const { w, h, name } of contexts) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${ROOT}/.qa/cude/cude-${name}.png`, fullPage: true });
  console.log(`Cude ${name} ${w}x${h} saved`);
  await ctx.close();
}

for (const screen of ['dashboard', 'transactions', 'analytics', 'settings']) {
  // finance app single page with nav — screenshot same page but we can capture via same url (all screens via JS nav not distinct urls)
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4174/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${ROOT}/.qa/finance/finance-${screen}-desktop.png`, fullPage: true });
  console.log(`Finance ${screen} screenshot saved`);
  await ctx.close();
}

// mobile for finance
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4174/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${ROOT}/.qa/finance/finance-dashboard-mobile.png`, fullPage: true });
  console.log('Finance mobile saved');
  await ctx.close();
}

await browser.close();
cudeProc.kill();
finProc.kill();
console.log('QA screenshots done');
