#!/usr/bin/env node
/**
 * Cude.new - model picker verification.
 *
 * Checks the combobox the way it is hard to check by eye: with the keyboard.
 * The two hand-written pickers it replaces had drifted on exactly this — one
 * wrapped at the ends of the list and the other did not — so wrapping, search
 * and selection are all measured here rather than assumed.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.qa', 'model-picker');
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

const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cude-brand-dark', { state: 'attached', timeout: 30000 });
await page.waitForTimeout(1200);

// The picker is collapsed until the composer's model control is opened.
await page
  .getByRole('button', { name: /model settings/i })
  .first()
  .click();
await page.waitForTimeout(700);

const providerButton = page.getByRole('button', { name: 'Provider', exact: true });
check('provider picker renders', await providerButton.isVisible().catch(() => false));

await providerButton.click();
await page.waitForTimeout(500);

const listbox = page.getByRole('listbox', { name: 'Provider' });
check('opening it shows a listbox', await listbox.isVisible().catch(() => false));

check(
  'the search field takes focus on open',
  await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Search providers'),
);

const optionCount = await page.getByRole('option').count();
check('providers are listed', optionCount > 0, `${optionCount} providers`);

await page.screenshot({ path: path.join(OUT, 'provider-open.png') });

// Keyboard: walking down from nothing focused enters at the first option.
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(150);

const firstFocused = await page.evaluate(() => {
  const input = document.querySelector('input[aria-label="Search providers"]');
  return input?.getAttribute('aria-activedescendant');
});
check('arrow down enters the list', Boolean(firstFocused), firstFocused ?? '(none)');

// Walking up from the first option wraps to the last.
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(150);

const wrapped = await page.evaluate(() => {
  const input = document.querySelector('input[aria-label="Search providers"]');
  const id = input?.getAttribute('aria-activedescendant') ?? '';
  const options = document.querySelectorAll('[role="option"]');
  const last = options[options.length - 1]?.id;

  return { id, last, wrapped: Boolean(id) && id === last };
});
check('the list wraps at the top', wrapped.wrapped, `${wrapped.id} vs last ${wrapped.last}`);

/*
 * Search filters. How many providers are enabled depends on which keys this
 * deployment holds, so the check is that filtering *acts*, not that it removes
 * a particular number.
 */
const firstName = await page.getByRole('option').first().textContent();
await page.keyboard.type((firstName ?? '').trim().slice(0, 4));
await page.waitForTimeout(400);

const kept = await page.getByRole('option').count();
check('search keeps what matches', kept >= 1, `${optionCount} -> ${kept} for "${firstName?.trim()}"`);

// A search that matches nothing says so rather than showing an empty box.
await page.keyboard.press('Control+A');
await page.keyboard.type('zzzznotaprovider');
await page.waitForTimeout(400);
check(
  'an empty result explains itself',
  await page
    .getByText(/no provider matches that/i)
    .isVisible()
    .catch(() => false),
);

// Enter selects the focused option.
await page.keyboard.press('Control+A');
await page.keyboard.press('Backspace');
await page.waitForTimeout(400);

const restored = await page.getByRole('option').count();
check('clearing the search restores the list', restored === optionCount, `${restored} of ${optionCount}`);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);

const closed = (await page.getByRole('listbox', { name: 'Provider' }).count()) === 0;
check('enter selects and closes', closed);

const chosen = await providerButton.textContent();
check('the choice is shown on the trigger', Boolean(chosen?.trim()), chosen?.trim() ?? '(empty)');

// Escape closes without choosing.
await providerButton.click();
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('escape closes it', (await page.getByRole('listbox', { name: 'Provider' }).count()) === 0);

const afterEscape = await providerButton.textContent();
check('escape leaves the choice alone', afterEscape === chosen);

await page.screenshot({ path: path.join(OUT, 'picker-selected.png') });

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
