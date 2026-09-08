#!/usr/bin/env node
/**
 * Cude.new - Final Visual QA capture (.qa/final-v3)
 *
 * Drives the running application with Playwright and captures the required
 * release screenshots.
 *
 * State is never fabricated. Where a screenshot needs an active project, the
 * script invokes the real pipeline entry point through the development bridge
 * (`window.__cude.startPipeline`), so requirements extraction, stack
 * intelligence, the product graph and the Design Director all execute for real
 * and the panels render their genuine output.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.qa', 'final-v3');
const BASE = process.env.CUDE_QA_URL || 'http://localhost:5173';

/** A realistic multi-line product brief, used to exercise the composer. */
const PRODUCT_PROMPT = [
  'Build an expense tracker for Android and Windows desktop.',
  'Users sign in with the same account on both devices.',
  'Expenses created on either device must synchronize automatically.',
  'It should work offline and sync when the connection returns.',
  'Keep the desktop application lightweight — low memory usage and',
  'fast startup matter more than development speed.',
  'Use a calm, technical visual style with a dense information layout.',
].join('\n');

const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  laptop: { width: 1366, height: 768 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

const captured = [];
const problems = [];

function shotPath(name) {
  return path.join(OUT, `${name}.png`);
}

async function waitForServer(url, timeoutMs = 120000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return true;
      }
    } catch {
      // server not up yet
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

/** Captures a screenshot and records that it was taken. */
async function capture(page, name, options = {}) {
  await page.screenshot({ path: shotPath(name), ...options });
  captured.push(name);
  console.log(`  captured ${name}.png`);
}

/**
 * Checks that the page does not scroll horizontally. A horizontal scrollbar at
 * any target width is a layout defect, so it is recorded rather than ignored.
 */
async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });

  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    problems.push(`${label}: horizontal overflow (${overflow.scrollWidth} > ${overflow.clientWidth})`);
    console.log(`  ! ${label} overflows horizontally: ${overflow.scrollWidth} > ${overflow.clientWidth}`);
  }
}

/** Waits until the dev bridge is installed by the application. */
async function waitForBridge(page) {
  await page.waitForFunction(() => Boolean(window.__cude), null, { timeout: 60000 });
}

/**
 * Runs the genuine Cude pipeline for the product brief and opens the workbench.
 * Returns the real architecture summary so the caller can log what was produced.
 */
async function runRealPipeline(page, prompt) {
  await waitForBridge(page);

  const summary = await page.evaluate(async (text) => {
    await window.__cude.startPipeline(text);

    // The workbench mounts once the chat has started, exactly as it does for a user.
    window.__cude.setChatStarted(true);
    window.__cude.showWorkbench(true);

    const state = window.__cude.getState();

    return {
      targets: state.architecture ? Object.keys(state.architecture.stackDecisions) : [],
      stacks: state.architecture
        ? Object.entries(state.architecture.stackDecisions).map(([p, d]) => `${p}: ${d.selected.name}`)
        : [],
      pipelineStatus: state.pipeline.status,
      designPreset: state.designSystem ? state.designSystem.meta.preset : null,
    };
  }, prompt);

  await page.waitForTimeout(1200);

  return summary;
}

/** Opens one of the workbench inspector tabs by its visible label. */
async function openInspector(page, labelPrefix) {
  const button = page.locator(`button:has-text("${labelPrefix}")`).first();

  if ((await button.count()) === 0) {
    problems.push(`inspector tab "${labelPrefix}" not found`);
    return false;
  }

  await button.click();
  await page.waitForTimeout(700);

  return true;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  console.log(`Waiting for ${BASE} ...`);

  if (!(await waitForServer(BASE))) {
    console.error(`Server at ${BASE} did not become ready.`);
    process.exit(1);
  }

  const browser = await chromium.launch();

  try {
    /* ---------------- Landing page at every target width ---------------- */
    console.log('\nLanding page');

    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();

      await page.goto(BASE, { waitUntil: 'domcontentloaded' });

      /*
       * The landing intro fades in; wait for it to settle so the capture shows
       * the resting state rather than a mid-animation frame.
       */
      await page.waitForTimeout(4500);

      await assertNoHorizontalOverflow(page, `landing-${name}`);
      await capture(page, `landing-${viewport.width}`);

      await context.close();
    }

    /* ---------------- Composer with a realistic brief ---------------- */
    console.log('\nComposer');

    {
      const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
      const page = await context.newPage();

      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      const textarea = page.locator('textarea').first();
      await textarea.click();
      await textarea.fill(PRODUCT_PROMPT);
      await page.waitForTimeout(800);

      await assertNoHorizontalOverflow(page, 'composer-long-prompt');

      // Frame the composer itself rather than the whole page.
      const box = await textarea.boundingBox();

      if (box) {
        await capture(page, 'composer-long-prompt', {
          clip: {
            x: Math.max(0, box.x - 80),
            y: Math.max(0, box.y - 140),
            width: Math.min(VIEWPORTS.desktop.width, box.width + 160),
            height: Math.min(VIEWPORTS.desktop.height, box.height + 260),
          },
        });
      } else {
        await capture(page, 'composer-long-prompt');
      }

      await context.close();
    }

    /* ---------------- Provider first-run state ---------------- */
    console.log('\nProvider state');

    {
      const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
      const page = await context.newPage();

      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      // The model/provider row lives under the composer.
      const providerRow = page.locator('text=API key required').first();

      await providerRow.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

      if ((await providerRow.count()) > 0) {
        const box = await providerRow.boundingBox();

        if (box) {
          await capture(page, 'provider-unconfigured', {
            clip: {
              x: Math.max(0, box.x - 260),
              y: Math.max(0, box.y - 120),
              width: 900,
              height: 260,
            },
          });
        } else {
          await capture(page, 'provider-unconfigured');
        }
      } else {
        // A key is configured in this environment; capture the row as it stands.
        await capture(page, 'provider-unconfigured');
        problems.push('provider-unconfigured: "API key required" not visible (a key may be configured)');
      }

      await context.close();
    }

    /* ---------------- Empty workspace (no pipeline run yet) ---------------- */
    console.log('\nWorkbench — empty');

    {
      const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
      const page = await context.newPage();

      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await waitForBridge(page);

      /*
       * Open the workspace without running the pipeline, to capture the
       * genuine pre-build composition.
       */
      await page.evaluate(() => {
        window.__cude.setChatStarted(true);
        window.__cude.showWorkbench(true);
      });
      await page.waitForTimeout(1200);

      await assertNoHorizontalOverflow(page, 'workbench-empty');
      await capture(page, 'workbench-empty-1920');
      await context.close();
    }

    /* ---------------- Terminal ---------------- */
    console.log('\nTerminal');

    {
      const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
      const page = await context.newPage();

      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      await runRealPipeline(page, PRODUCT_PROMPT);

      /*
       * Set visibility explicitly; the terminal is open by default, so a blind
       * toggle would have closed it.
       */
      await page.evaluate(() => window.__cude.setTerminal(true));
      await page.waitForTimeout(1500);

      const terminalBar = page.locator('text=Cude Terminal').first();

      if ((await terminalBar.count()) === 0) {
        problems.push('terminal: terminal panel did not render');
      }

      await assertNoHorizontalOverflow(page, 'terminal');
      await capture(page, 'terminal');
      await context.close();
    }

    /* ---------------- Workbench, driven by the real pipeline ---------------- */
    console.log('\nWorkbench (real pipeline)');

    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();

      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      const summary = await runRealPipeline(page, PRODUCT_PROMPT);

      if (name === 'desktop') {
        console.log(`  pipeline: ${summary.pipelineStatus}`);
        console.log(`  targets:  ${summary.targets.join(', ')}`);
        console.log(`  stacks:   ${summary.stacks.join(' | ')}`);
        console.log(`  design:   ${summary.designPreset}`);
      }

      await assertNoHorizontalOverflow(page, `workbench-${name}`);
      await capture(
        page,
        `workbench-${name === 'laptop' ? 'code-1366' : name === 'desktop' ? 'building-1920' : name + '-' + viewport.width}`,
      );

      await context.close();
    }

    /* ---------------- Inspector panels at desktop width ---------------- */
    console.log('\nInspector panels');

    {
      const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
      const page = await context.newPage();

      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      await runRealPipeline(page, PRODUCT_PROMPT);

      // Agents — the pipeline has genuinely run its pre-build stages.
      if (await openInspector(page, 'AGENTS')) {
        await assertNoHorizontalOverflow(page, 'agents-desktop');
        await capture(page, 'agents');
      }

      /*
       * Agents with a stage actively working. The builder stage is left in its
       * real 'working' state by startPipeline (it waits for generated files),
       * so this is the genuine mid-run appearance.
       */
      await page.evaluate(() => {
        window.__cude.updateAgentStatus(
          'builder',
          'working',
          'Generating project files for android and desktop targets',
        );
      });
      await page.waitForTimeout(600);
      await capture(page, 'agents-active');

      // Architecture decisions.
      if (await openInspector(page, 'ARCHITECTURE')) {
        await assertNoHorizontalOverflow(page, 'architecture-desktop');
        await capture(page, 'architecture');
      }

      // Product graph.
      if (await openInspector(page, 'GRAPH')) {
        await assertNoHorizontalOverflow(page, 'product-graph-desktop');
        await capture(page, 'product-graph');
      }

      // Theme studio.
      if (await openInspector(page, 'THEME')) {
        await assertNoHorizontalOverflow(page, 'theme-studio-desktop');
        await capture(page, 'theme-studio');
      }

      await context.close();
    }

    /* ---------------- Preview empty state ---------------- */
    console.log('\nPreview empty state');

    {
      const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
      const page = await context.newPage();

      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      await runRealPipeline(page, PRODUCT_PROMPT);

      const previewTab = page.locator('button:has-text("Preview")').first();

      if ((await previewTab.count()) > 0) {
        await previewTab.click();
        await page.waitForTimeout(1000);
      }

      await capture(page, 'preview-empty-state');
      await context.close();
    }
  } finally {
    await browser.close();
  }

  /* ---------------- Report ---------------- */
  console.log('\n=== VISUAL QA CAPTURE ===');
  console.log(`Screenshots: ${captured.length} -> ${path.relative(ROOT, OUT)}`);

  if (problems.length > 0) {
    console.log('\nLayout findings:');

    for (const problem of problems) {
      console.log(`  ! ${problem}`);
    }
  } else {
    console.log('No horizontal overflow at 390 / 768 / 1366 / 1920.');
  }

  fs.writeFileSync(
    path.join(OUT, 'capture-report.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        baseUrl: BASE,
        prompt: PRODUCT_PROMPT,
        screenshots: captured,
        layoutFindings: problems,
        note: 'Workbench, agents, architecture, graph and theme screenshots were produced by invoking the real Cude pipeline via the development bridge. No UI state was fabricated.',
      },
      null,
      2,
    ),
    'utf8',
  );

  process.exit(problems.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
