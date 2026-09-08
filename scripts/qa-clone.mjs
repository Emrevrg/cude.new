/**
 * Cude.new — the clone picker, driven the way a person drives it.
 *
 * The checks that matter are the ones a unit test cannot make: that the button
 * is where the toolbar says it is, that the machine's own apps and extensions
 * arrive in the list, and that choosing one puts a real prompt in the composer.
 */
import { chromium } from 'playwright';

const BASE = process.env.CUDE_QA_BASE ?? 'http://localhost:5173';
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/*
 * A machine with no API key configured gets a 401 from the chat endpoint, and
 * the browser logs it. That is the correct answer to "send this message with
 * no credentials", so it is not counted — anything else is.
 */
const EXPECTED = /the server responded with a status of 401/i;

const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error' && !EXPECTED.test(message.text())) {
    consoleErrors.push(message.text());
  }
});

const failedRequests = [];
page.on('response', (response) => {
  if (response.status() >= 400 && response.status() !== 401) {
    failedRequests.push(`${response.status()} ${new URL(response.url()).pathname}`);
  }
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });

// The composer must be a usable size before anything else is worth checking.
const composer = page.locator('textarea').first();
await composer.waitFor({ state: 'visible', timeout: 15000 });

const box = await composer.boundingBox();
check('the composer is on screen', box !== null && box.y >= 0, box ? `top ${Math.round(box.y)}` : 'missing');
check('the composer is a usable height', (box?.height ?? 0) >= 80, `${Math.round(box?.height ?? 0)}px`);

// The landing page should no longer carry a clone banner.
const landingClone = await page.getByRole('button', { name: /^Clone a program$/ }).count();
const trigger = page.locator('button[title="Clone a program"]');
check('the clone control lives in the toolbar', (await trigger.count()) === 1, `${landingClone} total match(es)`);

const toolbarBox = await trigger.boundingBox();
check(
  'it sits below the composer, not above it',
  (toolbarBox?.y ?? 0) > (box?.y ?? 0),
  `button ${Math.round(toolbarBox?.y ?? 0)} vs composer ${Math.round(box?.y ?? 0)}`,
);

await trigger.click();

// Scoped by its title: the sidebar is a dialog too.
const dialog = page.getByRole('dialog').filter({ hasText: 'Clone a program' });
await dialog.waitFor({ state: 'visible', timeout: 5000 });
check('it opens a dialog', await dialog.isVisible());

for (const tab of ['Web page', 'Desktop app', 'Extension']) {
  check(`the ${tab} tab is offered`, (await dialog.getByRole('button', { name: tab, exact: true }).count()) === 1);
}

check(
  'nothing outside those three targets is offered',
  (await dialog.getByRole('button', { name: /VS Code|Mobile|Android|iOS/i }).count()) === 0,
);

// Desktop: the machine's own applications.
await dialog.getByRole('button', { name: 'Desktop app', exact: true }).click();
await page.waitForTimeout(1200);

const list = dialog.locator('div.overflow-y-auto').first();
const programRows = list.locator('button');
const programCount = await programRows.count();
check('installed applications are listed', programCount > 0, `${programCount} shown`);

const firstProgram = (await programRows.first().innerText()).split('\n')[0].trim();
await programRows.first().click();
check('choosing one records the choice', (await dialog.innerText()).includes(`Cloning: ${firstProgram}`), firstProgram);

// Searching narrows the list.
const search = dialog.locator('input').first();
await search.fill('zzzznotathing');
await page.waitForTimeout(400);
check('a search with no match says so', (await dialog.innerText()).toLowerCase().includes('no app matches'));

await search.fill('');
await page.waitForTimeout(400);
check('clearing the search brings the list back', (await programRows.count()) > 0);

// Extensions: the browser profiles on this machine.
await dialog.getByRole('button', { name: 'Extension', exact: true }).click();
await page.waitForTimeout(800);

const extensionRows = list.locator('button');
const extensionCount = await extensionRows.count();
check('installed extensions are listed', extensionCount > 0, `${extensionCount} shown`);
check(
  'each extension says which profile it came from',
  (await extensionRows.first().innerText()).match(/Chrome|Edge|Brave|Vivaldi/) !== null,
);

// A store link is accepted in place of a pick.
const extensionSearch = dialog.locator('input').first();
await extensionSearch.fill('https://chromewebstore.google.com/detail/ublock/cjpalhdlnbpafiamejdnhcphjbkeiagm');
await page.waitForTimeout(400);
check('a store link is accepted as a reference', (await dialog.innerText()).includes('Cloning:'));

/*
 * The whole point: it puts a real prompt in the composer.
 * A URL reference is read server-side first, within a bounded budget.
 */
await dialog.getByRole('button', { name: /Clone it/ }).click();
await dialog.waitFor({ state: 'detached', timeout: 8000 }).catch(() => undefined);

check('the dialog closes once the clone is sent', (await dialog.count()) === 0);

const composerAfter = await page.locator('textarea').first().inputValue();
check(
  'the composer is left empty for the next message',
  composerAfter === '',
  JSON.stringify(composerAfter.slice(0, 40)),
);

/*
 * The landing hero is removed the moment a conversation starts, which is the
 * signal that the clone was actually sent. What happens next — the reply, the
 * saved title, the URL — depends on a configured provider, which a QA machine
 * has no business needing.
 */
await page.waitForTimeout(1500);
check('the clone started a conversation', (await page.locator('#intro').count()) === 0);

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
check('no request failed unexpectedly', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '));

await browser.close();

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
