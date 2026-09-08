import { _electron as electron } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';

const out = path.resolve('.qa/release-audit-' + Date.now());
mkdirSync(out, { recursive: true });
const local = parse(readFileSync('.env.local'));
const env = { ...process.env, NODE_ENV: 'production', APP_PATH_ROOT: out };
delete env.ELECTRON_RUN_AS_NODE;
if (local.OPENROUTER_API_KEY) env.OPENROUTER_API_KEY = local.OPENROUTER_API_KEY;
const results = [];
const errors = [];
let application;
let page;
const record = (name, passed, detail) => {
  results.push({ name, passed, detail });
  console.log(JSON.stringify({ name, passed, detail }));
};
try {
  application = await electron.launch({ executablePath: path.resolve('dist/win-unpacked/Cude.new.exe'), env, timeout: 60000 });
  page = await application.firstWindow({ timeout: 60000 });
  page.on('pageerror', e => errors.push(e.message));
  await page.locator('textarea').first().waitFor({ timeout: 60000 });
  for (const width of [390, 768, 1012, 1440]) {
    await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size, 720), width);
    await page.waitForTimeout(350);
    const geometry = await page.evaluate(() => {
      const scroller = [...document.querySelectorAll('div')].find(e => e.clientHeight > 100 && e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY));
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1, scrollTop: scroller?.scrollTop ?? 0 };
    });
    record('landing-' + width, !geometry.overflow && geometry.scrollTop > 0, geometry);
    await page.screenshot({ path: path.join(out, 'landing-' + width + '.png') });
  }
  await page.getByRole('button', { name: 'Show your work', exact: true }).click();
  await page.getByRole('button', { name: 'Close the panel', exact: true }).click();
  record('sidebar-close', await page.getByRole('button', { name: 'Show your work', exact: true }).isVisible());
  await page.getByRole('button', { name: /model settings/i }).click();
  await page.getByRole('button', { name: 'Provider', exact: true }).click();
  await page.getByRole('option', { name: 'OpenRouter', exact: true }).click();
  await page.getByRole('button', { name: 'Model', exact: true }).click();
  const available = await page.getByRole('option').allTextContents();
  const selected = available.find(s => /MiniMax M3.*free/i.test(s)) ?? available.find(s => /Nemotron.*free/i.test(s));
  if (!selected) throw new Error('No supported free model available in the UI');
  await page.getByRole('option', { name: selected, exact: true }).click();
  record('free-model', true, selected);
  const prompt = 'Build a working light-theme e-commerce WEB app in React and Vite. Create 8 sample products, product search, category filtering, add/remove cart items, quantity controls and a demo checkout that confirms an order without taking payment. Keep it responsive. Skip design review and build it now. Actually create the files and run the build; fix failures. Use browser-safe APIs only. Start the preview when ready.';
  await page.locator('textarea').first().fill(prompt);
  await page.locator('textarea').first().press('Enter');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'submitted.png') });
  const frames = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(20000);
    const state = await page.evaluate(() => ({
      activity: document.querySelectorAll('[data-testid="inline-activity"]').length,
      text: document.body.innerText.slice(-18000),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      iframes: [...document.querySelectorAll('iframe')].map(e => e.src),
    }));
    frames.push(state);
    writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ results, errors, frames }, null, 2));
    await page.screenshot({ path: path.join(out, `progress-${i}.png`) });
    console.log(JSON.stringify({ tick: i, activity: state.activity, overflow: state.overflow, errors: errors.length }));
  }
  record('inline-file-activity', frames.some(f => f.activity > 0));
  record('runtime-errors', errors.length === 0, errors);
  const preview = page.getByText('Preview', { exact: true }).first();
  if (await preview.isVisible()) await preview.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(out, 'preview.png') });
  const frameTexts = [];
  for (const frame of page.frames().slice(1)) {
    frameTexts.push({ url: frame.url(), text: await frame.locator('body').innerText({ timeout: 5000 }).catch(() => '') });
  }
  record('preview-content', frameTexts.some(f => /cart|product|checkout/i.test(f.text)), frameTexts);
} catch (error) {
  record('audit-interrupted', false, String(error));
  await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
  writeFileSync(path.join(out, 'result.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ out, results }));
  await application?.close();
}
