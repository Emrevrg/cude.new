import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

// Generate extension
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cude-ext-runtime-'));
console.log(`Generating extension to ${dir}`);

const manifest = {
  manifest_version: 3,
  name: 'Cude Test Ext',
  version: '0.1.0',
  description: 'Test',
  action: { default_popup: 'popup.html' },
  background: { service_worker: 'background.js' },
  permissions: ['activeTab', 'storage', 'scripting'],
  content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'] }],
};
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(
  path.join(dir, 'popup.html'),
  `<!doctype html><html><head><meta charset="utf-8"/><style>body{width:320px;padding:16px;font-family:system-ui}button{padding:8px;border:1px solid #222;background:#000;color:#fff;border-radius:6px}</style></head><body><h3>Cude Extension</h3><p>Test popup</p><button id="summarize">Summarize</button><script src="popup.js"></script></body></html>`,
);
fs.writeFileSync(
  path.join(dir, 'popup.js'),
  `document.getElementById('summarize')?.addEventListener('click', async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true}); if(tab?.id) chrome.tabs.sendMessage(tab.id,{type:'CUDE_SUMMARIZE'});});`,
);
fs.writeFileSync(
  path.join(dir, 'content.js'),
  `chrome.runtime.onMessage.addListener((msg)=>{if(msg.type==='CUDE_SUMMARIZE'){const text=document.body.innerText.slice(0,200); chrome.storage.local.set({lastSummary:text});}}); console.log('[Cude] content script loaded');`,
);
fs.writeFileSync(
  path.join(dir, 'background.js'),
  `chrome.runtime.onInstalled.addListener(()=>{console.log('Cude extension installed'); chrome.storage.local.set({installed:true});}); chrome.runtime.onMessage.addListener((m,s,send)=>{ if(m.type==='PING'){ send({pong:true}); } return true; });`,
);

// Test via Playwright persistent context
console.log('Launching Playwright with extension...');

const { chromium } = await import('playwright');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));

try {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`, '--no-sandbox'],
  });
  console.log('Context launched');

  // Wait for extension background
  await new Promise((r) => setTimeout(r, 3000));

  // List background pages / service workers
  let workers = context.serviceWorkers();
  console.log(`Service workers: ${workers.length}`);

  for (const w of workers) {
    console.log(`  worker url: ${w.url()}`);
  }

  // Try to get extension id via chrome://extensions not accessible, but we can check storage via evaluating in a page that loads extension
  const page = await context.newPage();
  await page.goto('https://example.com');
  await page.waitForTimeout(1500);

  // Check content script injected (look for console)
  const title = await page.title();
  console.log(`Page title: ${title}`);

  /*
   * Evaluate chrome extension presence via checking if content script added something
   * Since content script just logs, we can test via evaluating that chrome is not available in page, but we can test popup html rendering via extension url
   * Get extension id by looking at background worker url
   */
  let extId = null;

  if (workers.length > 0) {
    const url = workers[0].url();
    const m = url.match(/chrome-extension:\/\/([^\/]+)\//);

    if (m) {
      extId = m[1];
    }
  }

  if (!extId) {
    // Try alternative: list pages
    const pages = context.pages();

    for (const p of pages) {
      console.log(`page url: ${p.url()}`);
    }
  }

  if (extId) {
    console.log(`Extension ID: ${extId}`);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForTimeout(1000);

    const popupContent = await popup.content();
    console.log(`Popup contains Cude: ${popupContent.includes('Cude Extension')}`);
    console.log(`Popup button: ${popupContent.includes('Summarize')}`);
    await popup.close();

    // Test message passing via background
    if (workers.length > 0) {
      const result = await workers[0]
        .evaluate(() => {
          return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'PING' }, (res) => resolve(res));
          });
        })
        .catch((e) => ({ error: e.message }));
      console.log(`Background PING: ${JSON.stringify(result)}`);
    }
  } else {
    console.log('No extension ID found — extension may not have loaded as service worker in this Playwright version');
    console.log('Fallback: check manifest still valid and extension files loadable');
  }

  await context.close();
  console.log('Extension runtime test DONE');
} catch (e) {
  console.error('Extension test failed:', e);
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}

  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
}
