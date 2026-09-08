#!/usr/bin/env node
/**
 * Cude.new - data surface verification.
 *
 * Drives the real export and import through the browser rather than calling the
 * domain directly: the domain already has unit tests, and what is unverified is
 * whether the surface is wired to it.
 *
 * The export file is captured and inspected. An export is a file that leaves
 * the machine, so "does it contain a credential" is measured on the actual
 * bytes a download produces.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.qa', 'data');
const BASE = process.env.CUDE_BASE_URL || 'http://localhost:5173';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

fs.mkdirSync(OUT, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cude-qa-'));
const context = await chromium.launchPersistentContext(profile, {
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
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
await page.waitForTimeout(900);

/*
 * Put something in storage first. Exporting an empty account would pass every
 * check without proving the export reads anything.
 */
await page.evaluate(() => {
  localStorage.setItem('cude.settings.preferences', JSON.stringify({ theme: 'dark', promptId: 'cude' }));
  localStorage.setItem(
    'cude.settings.providers',
    JSON.stringify({ anthropic: { enabled: true, apiKey: 'sk-ant-planted-by-qa-000000' } }),
  );
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cude-brand-dark', { state: 'attached', timeout: 30000 });
await page.waitForTimeout(1200);

/*
 * Move away first: after a reload the pointer is already at the edge, and the
 * panel opens on movement into it, not on position.
 */
await page.mouse.move(700, 500);
await page.waitForTimeout(200);
await page.mouse.move(4, 400);
await page.waitForTimeout(900);
await page.locator('[data-testid="settings-button"]').click({ timeout: 8000 });
await page.waitForTimeout(900);

await page
  .getByRole('button', { name: /^Data Management:/i })
  .first()
  .click({ timeout: 8000 });
await page.getByRole('button', { name: /^export$/i }).waitFor({ state: 'visible', timeout: 8000 });

check('data surface opens', true);

// The page has other file inputs; scope to the settings dialog.
const surface = page.getByRole('dialog', { name: /data management/i });
const filePicker = surface.locator('input[type="file"]');
await page.screenshot({ path: path.join(OUT, 'data-surface.png') });

// Export
const download = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.getByRole('button', { name: /^export$/i }).click(),
]).then(([event]) => event);

const exported = path.join(OUT, 'export.json');
await download.saveAs(exported);

const raw = fs.readFileSync(exported, 'utf8');
let archive = null;

try {
  archive = JSON.parse(raw);
} catch {
  // Handled by the check below.
}

check('export downloads a file', fs.existsSync(exported), download.suggestedFilename());
check('export is a Cude archive', archive?.format === 'cude.archive', `format=${archive?.format}`);
check('export carries the settings', Boolean(archive?.settings?.preferences), 'preferences present');
check('export contains no api key', !raw.includes('sk-ant-planted-by-qa'), 'planted key absent');
check('export contains no key field', !raw.includes('apiKey'), 'apiKey field absent');

// Import: a file that is not a Cude archive must be refused, not partly applied.
const bogus = path.join(OUT, 'not-an-archive.json');
fs.writeFileSync(bogus, JSON.stringify({ chats: [{ id: 'x' }] }), 'utf8');

await page.getByRole('button', { name: /choose a file/i }).click();
await filePicker.setInputFiles(bogus);
await page.waitForTimeout(800);

const refusal = await surface
  .getByRole('status')
  .textContent()
  .catch(() => '');
check('a foreign file is refused', /not exported by cude/i.test(refusal ?? ''), refusal ?? '(no message)');

const restoreOffered = await page
  .getByRole('button', { name: /restore it/i })
  .isVisible()
  .catch(() => false);
check('a refused file offers no restore', restoreOffered === false);

// Import: the app's own export is accepted, and only restores after confirmation.
await filePicker.setInputFiles(exported);
await page.waitForTimeout(800);

const ready = await surface
  .getByRole('status')
  .textContent()
  .catch(() => '');
check('a Cude archive is read and summarised', /ready to restore/i.test(ready ?? ''), ready ?? '(no message)');

const canRestore = await page
  .getByRole('button', { name: /restore it/i })
  .isVisible()
  .catch(() => false);
check('restore is a separate, deliberate step', canRestore);

await page.getByRole('button', { name: /restore it/i }).click();
await page.waitForTimeout(1000);

const restored = await surface
  .getByRole('status')
  .textContent()
  .catch(() => '');
check('restore reports what it applied', /restored/i.test(restored ?? ''), restored ?? '(no message)');

await page.screenshot({ path: path.join(OUT, 'data-after-restore.png') });

/*
 * The diagnostic report is the file people attach to public bug reports, so it
 * is checked on the real download rather than in a unit test alone.
 */
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.mouse.move(700, 500);
await page.waitForTimeout(200);
await page.mouse.move(4, 400);
await page.waitForTimeout(900);
await page.locator('[data-testid="settings-button"]').click({ timeout: 8000 });
await page.waitForTimeout(800);

await page
  .getByRole('button', { name: /account menu/i })
  .first()
  .click({ timeout: 8000 });
await page.waitForTimeout(500);

/*
 * Driven by keyboard. A menu has to be operable that way regardless, and it
 * avoids depending on where a pointer lands inside a menu item.
 */
let reached = false;

for (let step = 0; step < 8 && !reached; step += 1) {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(80);

  const focused = await page.evaluate(() => document.activeElement?.textContent?.slice(0, 40) ?? '');
  reached = /download diagnostic report/i.test(focused);
}

check('the account menu is operable by keyboard', reached);

const reportDownload = reached
  ? await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.keyboard.press('Enter')])
      .then(([event]) => event)
      .catch(() => null)
  : null;

if (reportDownload) {
  const reportPath = path.join(OUT, 'diagnostics.json');
  await reportDownload.saveAs(reportPath);

  const reportRaw = fs.readFileSync(reportPath, 'utf8');
  let report = null;

  try {
    report = JSON.parse(reportRaw);
  } catch {
    // Reported by the check below.
  }

  check('diagnostic report downloads', report?.format === 'cude.diagnostics', reportDownload.suggestedFilename());
  check('diagnostic report describes the browser', Boolean(report?.environment?.userAgent));
  check('diagnostic report carries no api key', !reportRaw.includes('sk-ant-planted-by-qa'));
} else {
  check('diagnostic report downloads', false, 'no download event');
}

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await context.close();

try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {
  // Windows keeps a handle on the profile briefly; not worth failing over.
}

const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`evidence: ${path.relative(ROOT, OUT)}`);

process.exit(failed.length === 0 ? 0 : 1);
