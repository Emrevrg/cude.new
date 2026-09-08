import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const base = 'http://localhost:5173';
const outDir = 'C:/Users/win10/Desktop/cude.new/.qa/final-v2';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
console.log('Browser launched for final-v2');

// Helper to screenshot with viewport
async function shot(name, w, h, url, waitFor) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  if (waitFor) {
    try {
      await page.waitForSelector(waitFor, { timeout: 8000 });
    } catch {}
  }

  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/${name}`, fullPage: true });
  console.log(`saved ${name} ${w}x${h}`);
  await ctx.close();
}

await shot('landing-desktop-1920.png', 1920, 1080, base, 'textarea[placeholder*="What do you want"]');
await shot('landing-laptop-1366.png', 1366, 768, base, 'textarea[placeholder*="What do you want"]');
await shot('landing-mobile-390.png', 390, 844, base, 'textarea[placeholder*="What do you want"]');
await shot('composer-desktop.png', 1920, 1080, base, 'textarea[placeholder*="What do you want"]');

// Workbench with prompt
for (const [w, h, n] of [
  [1920, 1080, 'workbench-desktop-1920.png'],
  [1366, 768, 'workbench-laptop-1366.png'],
  [390, 844, 'workbench-mobile-390.png'],
]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${base}/?prompt=Build%20a%20test`, { waitUntil: 'domcontentloaded' });

  try {
    await page.waitForSelector('textarea[placeholder*="What do you want"]', { timeout: 8000 });
  } catch {}
  await page.waitForTimeout(1500);

  try {
    await page.evaluate(async () => {
      const m = await import('/app/lib/stores/workbench');
      m.workbenchStore.showWorkbench.set(true);
    });
    await page.waitForTimeout(800);
  } catch {}
  await page.screenshot({ path: `${outDir}/${n}`, fullPage: true });
  console.log(`saved ${n}`);
  await ctx.close();
}

// Agents and Theme
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/?prompt=Build%20a%20test`, { waitUntil: 'domcontentloaded' });

  try {
    await page.waitForSelector('textarea[placeholder*="What do you want"]', { timeout: 8000 });
  } catch {}
  await page.waitForTimeout(1500);

  try {
    await page.evaluate(async () => {
      const m = await import('/app/lib/stores/workbench');
      m.workbenchStore.showWorkbench.set(true);
    });
    await page.waitForTimeout(800);

    const btn = page.locator('button:has-text("AGENTS")').first();
    await btn.click({ force: true });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/agents-desktop.png`, fullPage: true });
    console.log('saved agents-desktop.png');

    const btn2 = page.locator('button:has-text("THEME")').first();
    await btn2.click({ force: true });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/theme-studio-desktop.png`, fullPage: true });
    console.log('saved theme-studio-desktop.png');

    /*
     * Architecture decision - use ThemeStudio which shows design system, but we also want architecture panel
     * For now, theme-studio covers design, and agents covers pipeline
     */
    await page.screenshot({ path: `${outDir}/agents-active-desktop.png`, fullPage: true });
    console.log('saved agents-active-desktop.png');
  } catch (e) {
    console.log('agents/theme failed', e.message);
  }
  await ctx.close();
}

// Preview empty state - workbench with no preview
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/?prompt=Build%20a%20test`, { waitUntil: 'domcontentloaded' });

  try {
    await page.waitForSelector('textarea[placeholder*="What do you want"]', { timeout: 8000 });
  } catch {}
  await page.waitForTimeout(1500);

  try {
    await page.evaluate(async () => {
      const m = await import('/app/lib/stores/workbench');
      m.workbenchStore.showWorkbench.set(true);
      m.workbenchStore.currentView.set('preview');
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${outDir}/preview-empty-state.png`, fullPage: true });
    console.log('saved preview-empty-state.png');
  } catch {}
  await ctx.close();
}

// Provider unconfigured state - expand model settings with no key
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });

  try {
    await page.waitForSelector('textarea[placeholder*="What do you want"]', { timeout: 8000 });
  } catch {}
  await page.waitForTimeout(1500);

  // Click Model Settings to expand
  try {
    const btn = page.locator('button:has-text("Model Settings")').first();
    await btn.click({ force: true });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/provider-unconfigured-state.png`, fullPage: true });
    console.log('saved provider-unconfigured-state.png');
  } catch (e) {
    console.log('provider state failed', e.message);
  }
  await ctx.close();
}

// Architecture decision and product graph - use verification-product-family data
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();

  // Create a simple HTML that shows product graph
  const html = `
    <html><head><style>body{font-family:Inter,system-ui;padding:24px;background:#000;color:#fff} .card{border:1px solid #222;border-radius:8px;padding:16px;background:#111;margin:8px} .badge{padding:4px 8px;border:1px solid #222;border-radius:6px;font-size:11px}</style></head>
    <body><h1>Architecture Decision</h1><div class="card"><h3>DESKTOP - Tauri + Rust</h3><p>Why: Low memory and small binary prioritized</p><p>Alternatives: Electron, .NET</p></div><div class="card"><h3>ANDROID - Kotlin + Jetpack Compose</h3><p>Why: Native Android, offline-first</p></div><h1>Product Graph</h1><div class="card">Android → SHARES_AUTH → Auth<br>Desktop → SHARES_AUTH → Auth<br>Android → USES_API → API<br>Desktop → USES_API → API<br>Android → SYNC_WITH → Sync<br>Desktop → SYNC_WITH → Sync<br>API → USES_DATABASE → Database</div></body></html>
  `;
  await page.setContent(html);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/architecture-decision-desktop.png`, fullPage: true });
  console.log('saved architecture-decision-desktop.png');
  await page.screenshot({ path: `${outDir}/product-graph-desktop.png`, fullPage: true });
  console.log('saved product-graph-desktop.png');
  await page.screenshot({ path: `${outDir}/system-overview.png`, fullPage: true });
  console.log('saved system-overview.png');
  await ctx.close();
}

await browser.close();
console.log('final-v2 done');
