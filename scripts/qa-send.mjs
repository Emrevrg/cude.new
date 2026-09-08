/**
 * Cude.new — what happens when somebody presses enter.
 *
 * The first message is the moment the product either works or does not, and it
 * used to do neither visibly: the view waited on two animation promises, the
 * send waited on a design-review model call, and the message itself waited on
 * starter-template selection and a repository download. A person typed, hit
 * enter, and watched an unchanged screen for several seconds.
 *
 * None of this needs a provider key — the transition, the bubble and the
 * composer clearing all happen before any model answers.
 */
import { chromium } from 'playwright';

const BASE = process.env.CUDE_QA_BASE ?? 'http://localhost:5173';

/** The message has to be on screen within this, or it reads as broken. */
const APPEAR_BUDGET_MS = 2000;

const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];

page.on('console', (message) => {
  // A machine with no key gets a 401, which is the right answer, not a fault.
  if (message.type() === 'error' && !/401/.test(message.text())) {
    consoleErrors.push(message.text());
  }
});

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 25000 });
  await page.waitForTimeout(3000);

  const prompt = 'build a todo app';
  const startedAt = Date.now();

  await page.locator('textarea').first().fill(prompt);
  await page.locator('textarea').first().press('Enter');

  const messages = () =>
    page.evaluate(() => {
      const region = document.querySelector('[class*="flex-1 max-w-chat"]');

      return region ? region.innerText : '';
    });

  let appearedAfter = null;

  for (let attempt = 0; attempt < 40; attempt++) {
    await page.waitForTimeout(150);

    if (new RegExp(prompt, 'i').test(await messages())) {
      appearedAfter = Date.now() - startedAt;
      break;
    }
  }

  check('the message appears at all', appearedAfter !== null, appearedAfter === null ? 'never' : `${appearedAfter} ms`);
  check(
    'it appears without waiting on the model',
    appearedAfter !== null && appearedAfter < APPEAR_BUDGET_MS,
    `${appearedAfter ?? '∞'} ms, budget ${APPEAR_BUDGET_MS}`,
  );

  const started = await page.evaluate(() => !document.querySelector('#intro'));
  check('the landing screen gives way to the conversation', started);

  const composer = await page.locator('textarea').first().inputValue();
  check('the composer is emptied for the next message', composer === '', JSON.stringify(composer.slice(0, 30)));

  /*
   * The composer belongs under the conversation, not in the middle of an empty
   * screen. Measured against the message rather than a pixel threshold: how
   * far down it sits depends on how much has been said.
   */
  const composerBox = await page.locator('textarea').first().boundingBox();
  const messageBox = await page
    .locator('[class*="flex-1 max-w-chat"]')
    .first()
    .boundingBox()
    .catch(() => null);

  check(
    'the composer sits below the conversation',
    (composerBox?.y ?? 0) > (messageBox?.y ?? 0),
    `composer ${Math.round(composerBox?.y ?? 0)}, messages ${Math.round(messageBox?.y ?? 0)}`,
  );

  // Whatever the provider says, the conversation must not be left blank.
  await page.waitForTimeout(6000);

  const after = await messages();
  check('the message is still there once the reply resolves', new RegExp(prompt, 'i').test(after));

  check('no console errors beyond an unconfigured provider', consoleErrors.length === 0, consoleErrors[0] ?? '');
} finally {
  await browser.close();
}

const passed = results.filter((entry) => entry.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
