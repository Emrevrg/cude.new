#!/usr/bin/env node
/**
 * Cude.new - branding + side panel verification.
 *
 * Captures evidence for the four things that were reported broken: the tab
 * icon, the header lockup in both themes, and the side panel covering the page
 * instead of letting content show through. Every screenshot is paired with an
 * assertion, so a green run means the behaviour was measured, not just that a
 * PNG was produced.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.qa', 'branding');
const BASE = process.env.CUDE_BASE_URL || 'http://localhost:5173';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);

    try {
      localStorage.setItem('cude.theme', t);
    } catch {}
  }, theme);
  await page.waitForTimeout(250);
}

/** Geometry + visibility of whichever brand image the theme selected. */
async function brandState(page) {
  return page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);

      if (!el) {
        return null;
      }

      return { display: getComputedStyle(el).display, w: el.clientWidth, h: el.clientHeight, complete: el.complete };
    };

    return { dark: pick('.cude-brand-dark'), light: pick('.cude-brand-light') };
  });
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // The dev server keeps an HMR socket open, so networkidle never settles.
  await page.waitForSelector('.cude-brand-dark', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(800);

  // --- tab icon -----------------------------------------------------------
  const icons = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel*="icon"]')].map((l) => ({ rel: l.rel, href: l.getAttribute('href') })),
  );
  check('favicon link tags present', icons.length >= 3, icons.map((i) => i.href).join(', '));

  for (const asset of ['/favicon.ico', '/favicon-32.png', '/apple-touch-icon.png']) {
    const res = await page.request.get(BASE + asset);
    check(`asset ${asset} served`, res.status() === 200, `HTTP ${res.status()}`);
  }

  // --- lockup, per theme --------------------------------------------------
  for (const theme of ['dark', 'light']) {
    await setTheme(page, theme);

    const state = await brandState(page);
    const shown = theme === 'dark' ? state.dark : state.light;
    const hidden = theme === 'dark' ? state.light : state.dark;

    check(
      `${theme}: correct lockup variant visible`,
      shown?.display !== 'none' && hidden?.display === 'none',
      `shown=${shown?.display} hidden=${hidden?.display}`,
    );

    // The collapse bug rendered it 17px wide against a ~102px intrinsic ratio.
    check(`${theme}: lockup not collapsed`, (shown?.w ?? 0) >= 80 && (shown?.h ?? 0) >= 20, `${shown?.w}x${shown?.h}`);
    check(`${theme}: lockup image loaded`, shown?.complete === true);

    await page.screenshot({ path: path.join(OUT, `01-header-${theme}.png`) });
  }

  // --- side panel covers the page ----------------------------------------
  await setTheme(page, 'dark');
  await page.getByRole('button', { name: /show your work/i }).click();

  /*
   * Wait for the slide-in to actually settle rather than guessing a duration —
   * asserting mid-animation made this check flaky, because the panel had not
   * yet reached the logo.
   */
  await page.waitForFunction(
    () => {
      const panel = document.querySelector('[data-cude-sidebar]');

      return !!panel && panel.getBoundingClientRect().left >= -1;
    },
    undefined,
    { timeout: 10000 },
  );
  await page.waitForTimeout(250);

  const panelState = await page.evaluate(() => {
    const panel = document.querySelector('[data-cude-sidebar]');
    const scrim = document.querySelector('.z-sidebar-backdrop');
    const logo = [...document.querySelectorAll('.cude-brand-dark, .cude-brand-light')].find(
      (el) => getComputedStyle(el).display !== 'none',
    );
    const r = logo?.getBoundingClientRect();
    const atLogo = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
    const atContent = document.elementFromPoint(900, 400);

    return {
      panelZ: panel ? getComputedStyle(panel).zIndex : null,
      scrimZ: scrim ? getComputedStyle(scrim).zIndex : null,
      panelOpaque: panel ? getComputedStyle(panel).backgroundColor : null,
      logoCovered: !!(panel && atLogo && panel.contains(atLogo)),
      contentCoveredByScrim: !!(scrim && atContent && (scrim === atContent || scrim.contains(atContent))),
      modal: panel?.getAttribute('aria-modal'),
    };
  });

  check(
    'panel is above the scrim',
    Number(panelState.panelZ) > Number(panelState.scrimZ),
    `${panelState.panelZ} > ${panelState.scrimZ}`,
  );
  check('header logo is covered by the open panel', panelState.logoCovered === true);
  check('page content is covered by the scrim', panelState.contentCoveredByScrim === true);
  check('panel is announced as a modal', panelState.modal === 'true');
  await page.screenshot({ path: path.join(OUT, '02-sidebar-open.png') });

  // --- and restores on close ---------------------------------------------
  await page.getByRole('button', { name: /close the panel/i }).click();
  await page.waitForTimeout(900);

  const closed = await page.evaluate(() => ({
    scrim: !!document.querySelector('.z-sidebar-backdrop'),
    heroVisible: !!document.querySelector('h1, [class*="text-6xl"], [class*="text-5xl"]'),
  }));
  check('scrim removed on close', closed.scrim === false);
  check('page content restored on close', closed.heroVisible === true);
  await page.screenshot({ path: path.join(OUT, '03-sidebar-closed.png') });

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`screenshots: ${path.relative(ROOT, OUT)}`);

  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
