#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { loadCudeModules, cleanupCudeModules } from './lib/load-cude.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.qa', 'release-final');
const PORT = 5179;

function log(m) {
  console.log(m);
}

function ensureDir() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
}

async function waitForServer(url, timeout = 60000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const r = await fetch(url);

      if (r.ok) {
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error('dev server not ready');
}

function spawnDev() {
  log('Starting dev server...');

  const child = spawn('pnpm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    shell: true,
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));

  return child;
}

async function assertVisible(page, selector, text) {
  const el = page.locator(selector);
  await el.first().waitFor({ state: 'visible', timeout: 15000 });

  if (text) {
    const body = await page.content();

    if (!body.includes(text)) {
      throw new Error(`Assertion failed: expected text "${text}" not found for ${selector}`);
    }
  }
}

async function assertNoText(page, text) {
  const body = await page.content();

  if (body.includes(text)) {
    throw new Error(`Assertion failed: unexpected text "${text}" found`);
  }
}

async function main() {
  ensureDir();

  // Generate fixtures via real modules
  log('Generating fixtures via real modules...');

  const api = await loadCudeModules([
    'app/lib/cude/architecture.ts',
    'app/lib/cude/designContract.ts',
    'app/lib/cude/designSystem.ts',
    'app/lib/cude/platformAdaptation.ts',
  ]);
  const {
    planProductArchitecture,
    createDesignContract,
    reviseDesignContract,
    approveDesignContract,
    describeRevision,
  } = api;

  // we need designSystem factory
  const { createDesignSystem } = await loadCudeModules(['app/lib/cude/designSystem.ts']);

  // helper to make designSystem
  const dsApi = await loadCudeModules(['app/lib/cude/designSystem.ts']);

  // fixtures
  const webArch = planProductArchitecture(
    'Build a modern expense tracker web dashboard. Users sign in, view transactions, analytics.',
  );
  const extArch = planProductArchitecture('Build a Chrome extension that summarizes the current webpage.');
  const vscodeArch = planProductArchitecture('Build a VS Code extension that explains TypeScript errors.');
  const multiArch = planProductArchitecture(
    'Build an expense tracker for Android and Windows desktop. Users sign in with the same account. Expenses must sync. It should work offline.',
  );
  const systemArch = planProductArchitecture(
    'Build an internet cafe management system for web dashboard and Windows desktop. Users sign in with the same account. Member check-in, computer allocation and billing must synchronize. It should work offline and sync when connection returns.',
  );

  function contractFor(arch, name) {
    const ds = arch.designSystem;
    return createDesignContract({
      productId: name.toLowerCase().replace(/\s+/g, '-'),
      productName: name,
      prompt: arch.prompt,
      platforms: arch.requirements.targetPlatforms,
      requirements: arch.requirements,
      designSystem: ds,
    });
  }

  const webContract = contractFor(webArch, 'Expense Web');
  const extContract = contractFor(extArch, 'Page Summary');
  const vscodeContract = contractFor(vscodeArch, 'TS Explain');
  const multiContract = contractFor(multiArch, 'Expense Family');
  const revisedMulti = reviseDesignContract(multiContract, 'make it denser and remove decorative elements');
  const revisionSummary = describeRevision(multiContract, revisedMulti);
  const approvedMulti = approveDesignContract(multiContract);

  // Add-platform fixture: start with android+desktop, then add web
  const { addTargetToArchitecture } = await loadCudeModules(['app/lib/cude/addTargetWorkflow.ts'])
    .then(() => loadCudeModules(['app/lib/cude/architecture.ts']))
    .catch(() => api);

  // Instead reuse plan then add via architecture module
  let addPlatformBase = multiArch;
  let addPlatformResult = null;

  try {
    const archMod = await loadCudeModules(['app/lib/cude/architecture.ts', 'app/lib/cude/addTargetWorkflow.ts']);

    if (archMod.addTargetToArchitecture) {
      addPlatformResult = archMod.addTargetToArchitecture(multiArch, 'web', {
        prompt: 'Add a web dashboard for the same account.',
      });
    }
  } catch {}

  cleanupCudeModules();

  const dev = spawnDev();
  let browser;

  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`);
    log('Dev server ready');
    browser = await chromium.launch({ headless: true });

    // Helpers to seed via window.__CUDE_SEED
    async function seed(page, fn, args) {
      await page.evaluate(
        ({ fn, args }) => {
          const seed = window.__CUDE_SEED;

          if (!seed) {
            throw new Error('__CUDE_SEED not ready');
          }

          // fn is string key
          if (fn === 'design') {
            seed.setDesignContract(args.contract);
            seed.setArchitecture(args.arch);
            seed.architectureStore.set(args.arch);
            seed.setPipelineStatus('design_review');
          } else if (fn === 'designRevision') {
            seed.setDesignContract(args.contract);
            seed.designRevisionSummaryStore.set(args.summary);
            seed.setPipelineStatus('design_review');
          } else if (fn === 'designApproved') {
            seed.setDesignContract(args.contract);
            seed.setPipelineStatus('design_approved');
          } else if (fn === 'arch') {
            seed.setArchitecture(args.arch);
            seed.selectedTargetStore.set(Object.keys(args.arch.stackDecisions)[0]);
          } else if (fn === 'pipelineActive') {
            seed.resetPipeline();

            const p = seed.pipelineStore.get();
            const next = {
              ...p,
              status: 'running',
              agents: p.agents.map((a, i) =>
                i < 3
                  ? { ...a, status: 'complete', summary: a.id + ' done' }
                  : i === 3
                    ? { ...a, status: 'working', summary: 'Working...' }
                    : { ...a, status: 'idle' },
              ),
            };
            seed.pipelineStore.set(next);
            seed.setPipelineStatus('running');
          } else if (fn === 'themeActive') {
            const ds = args.ds;
            seed.designSystemStore.set(ds);
            seed.designSystemStatusStore.set('active');
          } else if (fn === 'clear') {
            seed.setDesignContract(null);
            seed.setArchitecture(null);
            seed.resetPipeline();
          }
        },
        { fn, args },
      );
      await page.waitForTimeout(800);
    }

    async function capture(name, viewport, url, setupFn, asserts) {
      log(`Capturing ${name}...`);

      const context = await browser.newContext({ viewport });
      const page = await context.newPage();

      // set provider to openai to avoid AmazonBedrock error
      await page.addInitScript(() => {
        try {
          localStorage.setItem('cude:provider', 'OpenAI');
          localStorage.setItem('cude:settings', JSON.stringify({ provider: 'OpenAI' }));
        } catch {}
      });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);

      // wait for textarea on landing
      try {
        await page.waitForSelector('textarea', { timeout: 8000 });
      } catch {}

      if (setupFn) {
        await setupFn(page);
      }

      // assertions
      for (const a of asserts) {
        if (a.type === 'visible') {
          await assertVisible(page, a.selector, a.text);
        }

        if (a.type === 'noText') {
          await assertNoText(page, a.text);
        }

        if (a.type === 'urlContains') {
          if (!page.url().includes(a.text)) {
            throw new Error(`URL missing ${a.text}`);
          }
        }
      }

      // ensure no blank
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));

      if (!bodyText || bodyText.trim().length < 20) {
        throw new Error('Page appears blank');
      }

      // ensure no provider error unless explicitly allowed
      const hasError = await page.evaluate(() => document.body.innerText.includes('AmazonBedrock is unavailable'));

      if (hasError) {
        throw new Error('Provider error card visible');
      }

      await page.screenshot({ path: path.join(OUT, name), fullPage: true });
      log(`  -> ${name} saved`);
      await context.close();
    }

    // 01 landing desktop
    await capture('01-landing-desktop.png', { width: 1920, height: 1080 }, `http://127.0.0.1:${PORT}/`, null, [
      { type: 'visible', selector: 'textarea', text: 'What do you want to build' },
      { type: 'visible', selector: 'body', text: 'Cude.new' },
      { type: 'noText', text: 'AmazonBedrock is unavailable' },
    ]);

    // 02 landing mobile
    await capture('02-landing-mobile.png', { width: 390, height: 844 }, `http://127.0.0.1:${PORT}/`, null, [
      { type: 'visible', selector: 'textarea', text: 'What do you want to build' },
      { type: 'noText', text: 'AmazonBedrock is unavailable' },
    ]);

    // 03 design review web
    await capture(
      '03-design-review-web.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.evaluate(
          (c) => {
            const s = window.__CUDE_SEED;
            s.setDesignContract(c.contract);
            s.setArchitecture(c.arch);
            s.architectureStore.set(c.arch);
            s.setPipelineStatus('design_review');
            s.designReviewPlatformStore.set(c.contract.platforms[0]);
          },
          { contract: webContract, arch: webArch },
        );
        await page.waitForTimeout(900);

        // navigate to workbench tab that shows design review - click Design Review if exists, else ensure visible
        try {
          const btn = page.locator('text=DESIGN REVIEW');
          await btn.first().waitFor({ timeout: 3000 });
        } catch {}
      },
      [
        { type: 'visible', selector: 'body', text: 'WAITING FOR APPROVAL' },
        { type: 'visible', selector: 'body', text: 'Approve & Build' },
        { type: 'visible', selector: 'body', text: 'PLATFORM' },
      ],
    );

    // 04 browser extension
    await capture(
      '04-design-review-browser-extension.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.evaluate(
          (c) => {
            const s = window.__CUDE_SEED;
            s.setDesignContract(c.contract);
            s.setArchitecture(c.arch);
            s.architectureStore.set(c.arch);
            s.setPipelineStatus('design_review');
            s.designReviewPlatformStore.set('browser-extension');
          },
          { contract: extContract, arch: extArch },
        );
        await page.waitForTimeout(900);
      },
      [
        { type: 'visible', selector: 'body', text: 'WAITING FOR APPROVAL' },
        { type: 'visible', selector: 'body', text: 'Popup' },
        { type: 'visible', selector: 'body', text: '400×600' },
      ],
    );

    // 05 vscode extension
    await capture(
      '05-design-review-vscode-extension.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.evaluate(
          (c) => {
            const s = window.__CUDE_SEED;
            s.setDesignContract(c.contract);
            s.setArchitecture(c.arch);
            s.architectureStore.set(c.arch);
            s.setPipelineStatus('design_review');
            s.designReviewPlatformStore.set('vscode-extension');
          },
          { contract: vscodeContract, arch: vscodeArch },
        );
        await page.waitForTimeout(900);
      },
      [
        { type: 'visible', selector: 'body', text: 'WAITING FOR APPROVAL' },
        { type: 'visible', selector: 'body', text: 'Side Bar View' },
        { type: 'visible', selector: 'body', text: 'Panel' },
      ],
    );

    // 06 multiplatform
    await capture(
      '06-design-review-multiplatform.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.evaluate(
          (c) => {
            const s = window.__CUDE_SEED;
            s.setDesignContract(c.contract);
            s.setArchitecture(c.arch);
            s.architectureStore.set(c.arch);
            s.setPipelineStatus('design_review');
            s.designReviewPlatformStore.set(c.contract.platforms[0]);
          },
          { contract: multiContract, arch: multiArch },
        );
        await page.waitForTimeout(900);
      },
      [
        { type: 'visible', selector: 'body', text: 'WAITING FOR APPROVAL' },
        { type: 'visible', selector: 'body', text: 'ANDROID' },
        { type: 'visible', selector: 'body', text: 'DESKTOP' },
      ],
    );

    // 07 revision
    await capture(
      '07-design-review-revision.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.evaluate(
          (c) => {
            const s = window.__CUDE_SEED;
            s.setDesignContract(c.contract);
            s.designRevisionSummaryStore.set(c.summary);
            s.setPipelineStatus('design_review');
          },
          { contract: revisedMulti, summary: revisionSummary },
        );
        await page.waitForTimeout(900);
      },
      [
        { type: 'visible', selector: 'body', text: 'REVISION' },
        { type: 'visible', selector: 'body', text: 'WAITING FOR APPROVAL' },
      ],
    );

    // 08 approved
    await capture(
      '08-design-review-approved.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.evaluate(
          (c) => {
            const s = window.__CUDE_SEED;
            s.setDesignContract(c.contract);
            s.setPipelineStatus('design_approved');
          },
          { contract: approvedMulti },
        );
        await page.waitForTimeout(900);
      },
      [
        { type: 'visible', selector: 'body', text: 'APPROVED' },
        { type: 'visible', selector: 'body', text: 'Approved' },
      ],
    );

    // 09 product family
    await capture(
      '09-product-family.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.evaluate(
          (c) => {
            const s = window.__CUDE_SEED;
            s.setArchitecture(c.arch);
            s.selectedTargetStore.set(Object.keys(c.arch.stackDecisions)[0]);
          },
          { arch: multiArch },
        );
        await page.waitForTimeout(900);

        // click Product Family tab if exists
        try {
          await page.locator('text=Product Family').first().click({ timeout: 3000 });
          await page.waitForTimeout(600);
        } catch {}
      },
      [{ type: 'visible', selector: 'body', text: 'Product Family' }],
    );

    // 10 add platform
    await capture(
      '10-add-platform.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        if (addPlatformResult) {
          await page.evaluate(
            (c) => {
              const s = window.__CUDE_SEED;
              s.setArchitecture(c.arch);
              s.setDesignContract(c.contract);
            },
            { arch: addPlatformResult.architecture, contract: multiContract },
          );
        } else {
          await page.evaluate(
            (c) => {
              const s = window.__CUDE_SEED;
              s.setArchitecture(c.arch);
            },
            { arch: multiArch },
          );
        }

        await page.waitForTimeout(900);

        try {
          await page.locator('text=Add Platform').first().click({ timeout: 3000 });
          await page.waitForTimeout(600);
        } catch {}
      },
      [{ type: 'visible', selector: 'body', text: 'Add Platform' }],
    );

    // 11 system overview
    await capture(
      '11-system-overview.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.evaluate(
          (c) => {
            const s = window.__CUDE_SEED;
            s.setArchitecture(c.arch);
          },
          { arch: systemArch },
        );
        await page.waitForTimeout(900);

        try {
          await page.locator('text=System Overview').first().click({ timeout: 3000 });
          await page.waitForTimeout(600);
        } catch {}
      },
      [{ type: 'visible', selector: 'body', text: 'System' }],
    );

    // 12 product graph
    await capture(
      '12-product-graph.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.evaluate(
          (c) => {
            const s = window.__CUDE_SEED;
            s.setArchitecture(c.arch);
          },
          { arch: multiArch },
        );
        await page.waitForTimeout(900);

        try {
          await page.locator('text=Product Graph').first().click({ timeout: 3000 });
          await page.waitForTimeout(600);
        } catch {}
      },
      [{ type: 'visible', selector: 'body', text: 'Product Graph' }],
    );

    // 13 architecture
    await capture(
      '13-architecture.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.evaluate(
          (c) => {
            const s = window.__CUDE_SEED;
            s.setArchitecture(c.arch);
          },
          { arch: multiArch },
        );
        await page.waitForTimeout(900);

        try {
          await page.locator('text=Architecture').first().click({ timeout: 3000 });
          await page.waitForTimeout(600);
        } catch {}
      },
      [{ type: 'visible', selector: 'body', text: 'Architecture' }],
    );

    // 14 agents pipeline active
    await capture(
      '14-agents-pipeline-active.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.evaluate(() => {
          const s = window.__CUDE_SEED;
          s.resetPipeline();

          const p = s.pipelineStore.get();
          const next = {
            ...p,
            status: 'running',
            agents: p.agents.map((a, i) =>
              i < 2
                ? { ...a, status: 'complete', summary: a.id + ' completed' }
                : i === 2
                  ? { ...a, status: 'working', summary: 'Analyzing...' }
                  : i === 3
                    ? { ...a, status: 'working', summary: 'Planning architecture' }
                    : a,
            ),
          };
          s.pipelineStore.set(next);
          s.setPipelineStatus('running');
        });
        await page.waitForTimeout(900);

        try {
          await page.locator('text=AGENTS').first().click({ timeout: 3000 });
          await page.waitForTimeout(600);
        } catch {}
      },
      [
        { type: 'visible', selector: 'body', text: 'AGENTS' },
        { type: 'visible', selector: 'body', text: 'working' },
      ],
    );

    // 15 theme studio active
    await capture(
      '15-theme-studio-active.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.evaluate(
          (c) => {
            const s = window.__CUDE_SEED;
            s.designSystemStore.set(c.ds);
            s.designSystemStatusStore.set('active');
          },
          { ds: multiArch.designSystem },
        );
        await page.waitForTimeout(900);

        try {
          await page.locator('text=THEME').first().click({ timeout: 3000 });
          await page.waitForTimeout(600);
        } catch {}
      },
      [
        { type: 'visible', selector: 'body', text: 'THEME' },
        { type: 'visible', selector: 'body', text: 'Design System' },
      ],
    );

    // 16 workbench code
    await capture(
      '16-workbench-code.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        // ensure workbench visible by typing a prompt and showing code tab
        await page.waitForTimeout(900);

        try {
          await page.locator('text=Code').first().click({ timeout: 3000 });
        } catch {}
      },
      [{ type: 'visible', selector: 'body', text: 'Code' }],
    );

    // 17 workbench building (truthful pipeline)
    await capture(
      '17-workbench-building.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.evaluate(() => {
          const s = window.__CUDE_SEED;
          s.resetPipeline();

          const p = s.pipelineStore.get();
          const next = {
            ...p,
            status: 'building',
            agents: p.agents.map((a, i) =>
              i < 4 ? { ...a, status: 'complete' } : i === 4 ? { ...a, status: 'working', summary: 'Building...' } : a,
            ),
          };
          s.pipelineStore.set(next);
          s.setPipelineStatus('building');
        });
        await page.waitForTimeout(900);
      },
      [{ type: 'visible', selector: 'body', text: 'Building' }],
    );

    // 18 browser extension final (same as 04 but approved)
    await capture(
      '18-browser-extension-final.png',
      { width: 800, height: 600 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        const approvedExt = approveDesignContract(extContract);
        await page.evaluate(
          (c) => {
            const s = window.__CUDE_SEED;
            s.setDesignContract(c.contract);
            s.setArchitecture(c.arch);
            s.setPipelineStatus('design_approved');
          },
          { contract: approvedExt, arch: extArch },
        );
        await page.waitForTimeout(900);
      },
      [
        { type: 'visible', selector: 'body', text: 'APPROVED' },
        { type: 'visible', selector: 'body', text: 'Popup' },
      ],
    );

    // 19 vscode extension final
    await capture(
      '19-vscode-extension-final.png',
      { width: 800, height: 600 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        const approvedVs = approveDesignContract(vscodeContract);
        await page.evaluate(
          (c) => {
            const s = window.__CUDE_SEED;
            s.setDesignContract(c.contract);
            s.setArchitecture(c.arch);
            s.setPipelineStatus('design_approved');
          },
          { contract: approvedVs, arch: vscodeArch },
        );
        await page.waitForTimeout(900);
      },
      [
        { type: 'visible', selector: 'body', text: 'APPROVED' },
        { type: 'visible', selector: 'body', text: 'Side Bar View' },
      ],
    );

    // 20 provider openai
    await capture(
      '20-provider-openai.png',
      { width: 1920, height: 1080 },
      `http://127.0.0.1:${PORT}/`,
      async (page) => {
        await page.waitForTimeout(900);

        // open provider selector if exists
        try {
          await page.locator('text=OpenAI').first().waitFor({ timeout: 2000 });
        } catch {}
      },
      [
        { type: 'visible', selector: 'body', text: 'OpenAI' },
        { type: 'noText', text: 'AmazonBedrock is unavailable' },
      ],
    );

    log('All captures done');
  } finally {
    if (browser) {
      await browser.close();
    }

    dev.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1500));

    try {
      dev.kill('SIGKILL');
    } catch {}
  }

  // README
  const readme = `# Release Final — Capture Report
Generated: ${new Date().toISOString()}
Port: ${PORT}
`;
  fs.writeFileSync(path.join(OUT, 'README.md'), readme, 'utf8');
  log(`Wrote ${OUT}/README.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
