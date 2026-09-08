import { _electron as electron } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const out = path.resolve('.qa/desktop-runtime-' + Date.now());
mkdirSync(out, { recursive: true });
const env = { ...process.env, APP_PATH_ROOT: out, NODE_ENV: 'production' };
delete env.ELECTRON_RUN_AS_NODE;
let application;
const errors = [];
try {
  application = await electron.launch({
    executablePath: path.resolve('dist/win-unpacked/Cude.new.exe'),
    env,
    timeout: 60000,
  });
  const page = await application.firstWindow({ timeout: 60000 });
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForLoadState('domcontentloaded');
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 60000 });
  const checks = await page.evaluate(async () => {
    const response = await fetch('/');
    const html = await response.text();
    const health = await fetch('/api/health');
    const asset = document.querySelector('script[src], link[rel="stylesheet"][href]')?.getAttribute('src') ??
      document.querySelector('link[rel="stylesheet"][href]')?.getAttribute('href');
    const assetStatus = asset ? (await fetch(asset)).status : null;
    return { status: response.status, healthStatus: health.status, assetStatus,
      hasServerError: /Cannot read properties of undefined|Error handling request/.test(html),
      title: document.title, composer: !!document.querySelector('textarea') };
  });
  await page.screenshot({ path: path.join(out, 'desktop-home.png') });
  if (checks.status !== 200 || checks.healthStatus !== 200 || (checks.assetStatus !== null && checks.assetStatus !== 200) || checks.hasServerError || !checks.composer || errors.length) {
    throw new Error(JSON.stringify({ checks, errors }));
  }
  writeFileSync(path.join(out, 'result.json'), JSON.stringify({ passed: true, checks, errors }, null, 2));
  console.log(JSON.stringify({ out, passed: true, checks, errors }));
} catch (error) {
  writeFileSync(path.join(out, 'result.json'), JSON.stringify({ passed: false, error: String(error), errors }, null, 2));
  console.error(JSON.stringify({ out, passed: false, error: String(error) }));
  process.exitCode = 1;
} finally {
  await application?.close();
}
