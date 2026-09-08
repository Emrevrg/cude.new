#!/usr/bin/env node
/**
 * Cude.new - workbench surface verification.
 *
 * Opens the workbench through the development bridge, which drives the real
 * stores rather than faking a state the app cannot reach on its own, and checks
 * that the preview surface renders with its controls.
 *
 * There is no project running here, so the preview shows its empty state. That
 * is the point of the check: the surface must be correct before anything is
 * built, not only after.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.qa', 'workbench');
const BASE = process.env.CUDE_BASE_URL || 'http://localhost:5173';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

fs.mkdirSync(OUT, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cude-qa-'));
const context = await chromium.launchPersistentContext(profile, { viewport: { width: 1600, height: 950 } });
const page = context.pages()[0] ?? (await context.newPage());

const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cude-brand-dark', { state: 'attached', timeout: 30000 });
await page.waitForTimeout(1000);

const bridged = await page.evaluate(() => {
  if (!window.__cude) {
    return false;
  }

  window.__cude.setChatStarted(true);
  window.__cude.showWorkbench(true);

  return true;
});

check('development bridge is available', bridged);

await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, 'workbench.png') });

// Move to the preview view. The workbench opens on code by default.
await page
  .getByRole('button', { name: /^preview$/i })
  .first()
  .click({ timeout: 8000 })
  .catch(() => undefined);
await page.waitForTimeout(900);

const reload = page.getByRole('button', { name: /reload the preview/i });
check('preview surface renders', await reload.isVisible().catch(() => false));

for (const label of ['Fill', 'Phone', 'Tablet', 'Laptop']) {
  const visible = await page
    .getByRole('button', { name: new RegExp(`^${label}$`) })
    .first()
    .isVisible()
    .catch(() => false);
  check(`viewport ${label} offered`, visible);
}

check(
  'element selection offered',
  await page
    .getByRole('button', { name: /select an element in the preview/i })
    .isVisible()
    .catch(() => false),
);

check(
  'region capture offered',
  await page
    .getByRole('button', { name: /capture a region of the preview/i })
    .isVisible()
    .catch(() => false),
);

check(
  'empty state explains itself',
  await page
    .getByText(/nothing is running yet/i)
    .isVisible()
    .catch(() => false),
);

// Switching viewport must actually change the frame width.
const frame = page.getByTestId('preview-frame');
const fillWidth = await frame.evaluate((node) => node.clientWidth).catch(() => 0);
await page
  .getByRole('button', { name: /^Phone$/ })
  .first()
  .click();
await page.waitForTimeout(500);

const phoneWidth = await frame.evaluate((node) => node.clientWidth).catch(() => 0);

check(
  'viewport changes the frame width',
  phoneWidth === 390 && fillWidth > phoneWidth,
  `${fillWidth} -> ${phoneWidth}`,
);

await page.screenshot({ path: path.join(OUT, 'preview-phone.png') });

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await context.close();

try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {
  // Windows keeps a handle on the profile briefly.
}

const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots: ${path.relative(ROOT, OUT)}`);

process.exit(failed.length === 0 ? 0 : 1);
