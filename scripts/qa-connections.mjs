#!/usr/bin/env node
/**
 * Cude.new - connection surface verification.
 *
 * The five settings tabs and the composer control were replaced by one surface
 * each. This opens the running app in a clean browser profile and measures that
 * the replacements actually render, that the form is a password field rather
 * than a plain one, and that nothing throws on the way.
 *
 * A clean profile matters: a stale service worker or hot-reload cache from a
 * deleted module produces errors that look like product defects and are not.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.qa', 'connections');
const BASE = process.env.CUDE_BASE_URL || 'http://localhost:5173';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

fs.mkdirSync(OUT, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cude-qa-'));
const context = await chromium.launchPersistentContext(profile, { viewport: { width: 1440, height: 900 } });
const page = context.pages()[0] ?? (await context.newPage());

/*
 * Probing a local model server that is not running is the feature working, and
 * the browser logs the refused connection either way. Those are not defects.
 */
const isExpectedProbeFailure = (text) =>
  /ERR_CONNECTION_REFUSED|Failed to fetch/.test(text) && /127\.0\.0\.1|localhost/.test(text);

const consoleErrors = [];
page.on('console', (message) => {
  // The URL is on the location, not in the text, for a failed resource load.
  const where = message.location()?.url ?? '';

  if (message.type() === 'error' && !isExpectedProbeFailure(`${message.text()} ${where}`)) {
    consoleErrors.push(message.text());
  }
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cude-brand-dark', { state: 'attached', timeout: 30000 });
await page.waitForTimeout(900);

/*
 * The settings button lives in the side panel, which stays closed until the
 * pointer reaches the left edge. Open it the way a person does.
 */
await page.mouse.move(4, 400);
await page.waitForTimeout(700);
await page.locator('[data-testid="settings-button"]').click({ timeout: 8000 });

await page.waitForTimeout(1200);

// The side panel is also a dialog; the settings panel is the one on top.
const panel = page.getByRole('dialog').last();
check('settings panel opens', await panel.isVisible().catch(() => false));

await page.screenshot({ path: path.join(OUT, 'settings-open.png') });

for (const service of ['GitHub', 'GitLab', 'Netlify', 'Vercel', 'Supabase']) {
  // Each surface tile is labelled "<name>: <description>".
  const entry = page.getByRole('button', { name: new RegExp(`^${service}:`, 'i') }).first();
  const clicked = await entry
    .click({ timeout: 4000 })
    .then(() => true)
    .catch(() => false);

  if (!clicked) {
    check(`${service} surface reachable`, false, 'no navigation entry found');
    continue;
  }

  // Wait for the surface itself rather than a guess at how long it takes.
  await page
    .locator('input[type="password"]')
    .first()
    .waitFor({ state: 'visible', timeout: 8000 })
    .catch(() => undefined);

  // The panel header names the service; the surface shows its connection state.
  const heading = await panel
    .getByText(new RegExp(`^${service}$`, 'i'))
    .first()
    .isVisible()
    .catch(() => false);
  const statusShown = await panel
    .getByText(/disconnected|connected|connecting|error/i)
    .first()
    .isVisible()
    .catch(() => false);
  const tokenField = page.locator('input[type="password"]').first();
  const hasField = await tokenField.isVisible().catch(() => false);

  check(
    `${service} surface renders`,
    heading && hasField && statusShown,
    heading ? 'name, status and token field' : 'name missing',
  );

  if (service === 'GitLab') {
    const instance = await page
      .getByLabel(/instance url/i)
      .isVisible()
      .catch(() => false);
    check('GitLab offers a self-hosted instance field', instance);
  }

  await page.screenshot({ path: path.join(OUT, `surface-${service.toLowerCase()}.png`) });

  // Back to the surface list for the next one.
  await page
    .getByRole('button', { name: /back/i })
    .first()
    .click({ timeout: 4000 })
    .catch(() => undefined);
  await page.waitForTimeout(400);
}

/*
 * Local providers. Nothing is running in this environment, so what is checked
 * is that the surface says so and offers the setup steps rather than an empty
 * panel.
 */
await page
  .getByRole('button', { name: /^Local Providers:/i })
  .first()
  .click({ timeout: 8000 })
  .catch(() => undefined);
await page.waitForTimeout(700);

for (const label of ['Ollama', 'LM Studio', 'OpenAI-compatible']) {
  const shown = await panel
    .getByRole('heading', { name: label, exact: true })
    .first()
    .isVisible()
    .catch(() => false);
  check(`${label} is listed`, shown);
}

const ollamaToggle = panel.getByRole('checkbox', { name: /use ollama/i });
check('each provider can be switched on', await ollamaToggle.isVisible().catch(() => false));

await ollamaToggle.check().catch(() => undefined);
await page.waitForTimeout(4000);

check(
  'an address can be edited',
  await panel
    .getByLabel(/ollama address/i)
    .isVisible()
    .catch(() => false),
);

check(
  'a server that is not running explains how to start it',
  await panel
    .getByText(/nothing answered at that address/i)
    .first()
    .isVisible()
    .catch(() => false),
);

await page.screenshot({ path: path.join(OUT, 'local-providers.png') });

// A token must never be rendered in a readable field.
const plainTokenInputs = await page.evaluate(
  () =>
    [...document.querySelectorAll('input')].filter(
      (input) =>
        /token/i.test(input.getAttribute('aria-label') ?? input.placeholder ?? '') && input.type !== 'password',
    ).length,
);
check('token fields are masked', plainTokenInputs === 0, `${plainTokenInputs} plain token inputs`);

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await context.close();

try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {
  // Windows keeps a handle on the profile briefly; not worth failing over.
}

const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots: ${path.relative(ROOT, OUT)}`);

process.exit(failed.length === 0 ? 0 : 1);
