import { chromium } from 'playwright';
import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root, so the script runs anywhere rather than on one machine. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const base = 'http://localhost:5173';
const outDir = path.resolve(ROOT, '.qa/final-ui');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, 'before'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'after'), { recursive: true });

const viewports = [
  { w: 1920, h: 1080, name: 'desktop', label: 'DESKTOP 1920x1080' },
  { w: 1366, h: 768, name: 'laptop', label: 'LAPTOP 1366x768' },
  { w: 768, h: 1024, name: 'tablet', label: 'TABLET 768x1024' },
  { w: 390, h: 844, name: 'mobile', label: 'MOBILE 390x844' },
];

const browser = await chromium.launch();
console.log('Browser launched');

for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });

  try {
    await page.waitForSelector('textarea[placeholder*="What do you want"]', { timeout: 10000 });
  } catch {}
  await page.waitForTimeout(1500);

  const hasLogo = await page
    .locator('header img[alt="Cude.new"]')
    .first()
    .isVisible()
    .catch(() => false);
  const hasComposer = await page
    .locator('textarea[placeholder*="What do you want"]')
    .first()
    .isVisible()
    .catch(() => false);
  console.log(`${vp.label}: logo=${hasLogo} composer=${hasComposer}`);
  await page.screenshot({ path: `${outDir}/01-${vp.name}-landing.png`, fullPage: true });
  console.log(`saved 01-${vp.name}-landing.png`);
  await ctx.close();
}

// Workbench and agents/theme
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  await page.goto(`${base}/?prompt=Build%20a%20test%20project%20with%20dashboard`, { waitUntil: 'domcontentloaded' });

  try {
    await page.waitForSelector('textarea[placeholder*="What do you want"]', { timeout: 10000 });
  } catch {}
  await page.waitForTimeout(2000);

  // Force workbench open via store (for visual QA)
  try {
    await page.evaluate(async () => {
      const m = await import('/app/lib/stores/workbench');
      m.workbenchStore.showWorkbench.set(true);
    });
    await page.waitForTimeout(800);
  } catch (e) {
    console.log('force workbench failed', e.message);
  }
  await page.screenshot({ path: `${outDir}/03-${vp.name}-workbench.png`, fullPage: true });
  console.log(`saved 03-${vp.name}-workbench.png`);

  try {
    const agentsBtn = page.locator('button:has-text("AGENTS")').first();
    await agentsBtn.click({ force: true });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/04-${vp.name}-agents.png`, fullPage: true });
    console.log(`saved 04-${vp.name}-agents.png`);
  } catch (e) {
    console.log(`agents ${vp.name} failed`, e.message);
  }

  try {
    const themeBtn = page.locator('button:has-text("THEME")').first();
    await themeBtn.click({ force: true });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/05-${vp.name}-theme.png`, fullPage: true });
    console.log(`saved 05-${vp.name}-theme.png`);
  } catch (e) {
    console.log(`theme ${vp.name} failed`, e.message);
  }
  await ctx.close();
}

// Capture composer closeup at desktop
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });

  try {
    await page.waitForSelector('textarea[placeholder*="What do you want"]', { timeout: 10000 });
  } catch {}
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/02-desktop-composer.png`, fullPage: true });
  console.log('saved 02-desktop-composer.png');
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/?prompt=Build%20a%20test`, { waitUntil: 'domcontentloaded' });

  try {
    await page.waitForSelector('textarea[placeholder*="What do you want"]', { timeout: 10000 });
  } catch {}
  await page.waitForTimeout(2000);

  try {
    await page.evaluate(async () => {
      const m = await import('/app/lib/stores/workbench');
      m.workbenchStore.showWorkbench.set(true);
      m.workbenchStore.currentView.set('preview');
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${outDir}/06-desktop-editor-preview.png`, fullPage: true });
    console.log('saved 06-desktop-editor-preview.png');
  } catch (e) {
    console.log('editor-preview failed', e.message);
  }

  try {
    await page.evaluate(async () => {
      const m = await import('/app/lib/stores/workbench');
      m.workbenchStore.showTerminal.set(true);
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${outDir}/07-desktop-terminal.png`, fullPage: true });
    console.log('saved 07-desktop-terminal.png');
  } catch (e) {
    console.log('terminal failed', e.message);
  }

  try {
    const settingsBtn = page.locator('button[title*="Settings"], a:has-text("Settings")').first();

    if (await settingsBtn.isVisible()) {
      await settingsBtn.click({ force: true });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${outDir}/08-desktop-settings.png`, fullPage: true });
      console.log('saved 08-desktop-settings.png');
    } else {
      await page.screenshot({ path: `${outDir}/08-desktop-settings.png`, fullPage: true });
      console.log('saved 08-desktop-settings (fallback)');
    }
  } catch (e) {
    console.log('settings failed', e.message);
  }
  await ctx.close();
}

await browser.close();
console.log('Final visual audit done');
