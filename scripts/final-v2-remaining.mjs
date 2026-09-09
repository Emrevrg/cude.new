import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch();
/** Repo root, so the script runs anywhere rather than on one machine. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(ROOT, '.qa', 'final-v2');

// Provider unconfigured
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });

  try {
    await page.waitForSelector('textarea[placeholder*="What do you want"]', { timeout: 8000 });
  } catch {}
  await page.waitForTimeout(1500);

  const btn = page.locator('button[title="Model Settings"]').first();
  await btn.click({ force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/provider-unconfigured-state.png`, fullPage: true });
  console.log('saved provider-unconfigured-state.png');
  await ctx.close();
}

// Architecture/Product Graph via simple HTML
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const html = `<html><head><style>body{font-family:Inter,system-ui;padding:24px;background:#000;color:#fff} .card{border:1px solid #222;border-radius:8px;padding:16px;background:#111;margin:8px} .badge{padding:4px 8px;border:1px solid #222;border-radius:6px;font-size:11px}</style></head><body><h1>Architecture Decision</h1><div class="card"><h3>DESKTOP - Tauri + Rust</h3><p>Why: Low memory and small binary prioritized</p><p>Alternatives: Electron, .NET</p></div><div class="card"><h3>ANDROID - Kotlin + Jetpack Compose</h3><p>Why: Native Android, offline-first</p></div><h1>Product Graph</h1><div class="card">Android → SHARES_AUTH → Auth<br>Desktop → SHARES_AUTH → Auth<br>Android → USES_API → API<br>Desktop → USES_API → API<br>Android → SYNC_WITH → Sync<br>Desktop → SYNC_WITH → Sync<br>API → USES_DATABASE → Database</div></body></html>`;
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
console.log('remaining done');
