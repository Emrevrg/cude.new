import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCudeModules, cleanupCudeModules } from './lib/load-cude.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.qa', 'release-final');
const BASE = 'http://localhost:5173';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
console.log('OUT', OUT);

const api = await loadCudeModules(['app/lib/cude/architecture.ts', 'app/lib/cude/designContract.ts']);
const { planProductArchitecture, createDesignContract, reviseDesignContract, approveDesignContract, describeRevision } =
  api;
let webArch = planProductArchitecture(
  'Build a modern expense tracker web dashboard. Users sign in, view transactions, analytics.',
);
let extArch = planProductArchitecture('Build a Chrome extension that summarizes the current webpage.');
let vscodeArch = planProductArchitecture('Build a VS Code extension that explains TypeScript errors.');
let multiArch = planProductArchitecture(
  'Build an expense tracker for Android and Windows desktop. Users sign in with the same account. Expenses must sync. It should work offline.',
);
let systemArch = planProductArchitecture(
  'Build an internet cafe management system for web dashboard and Windows desktop. Users sign in with the same account. Member check-in, computer allocation and billing must synchronize. It should work offline and sync when connection returns.',
);

function contractFor(arch, name) {
  return createDesignContract({
    productId: name.toLowerCase().replace(/\s+/g, '-'),
    productName: name,
    prompt: arch.prompt,
    platforms: arch.requirements.targetPlatforms,
    requirements: arch.requirements,
    designSystem: arch.designSystem,
  });
}

let webContract = contractFor(webArch, 'Expense Web');
let extContract = contractFor(extArch, 'Page Summary');
let vscodeContract = contractFor(vscodeArch, 'TS Explain');
let multiContract = contractFor(multiArch, 'Expense Family');
let revisedMulti = reviseDesignContract(multiContract, 'make it denser and remove decorative elements');
let revisionSummary = describeRevision(multiContract, revisedMulti);
let approvedMulti = approveDesignContract(multiContract);
let approvedExt = approveDesignContract(extContract);
let approvedVs = approveDesignContract(vscodeContract);
cleanupCudeModules();
console.log('fixtures ready');

const browser = await chromium.launch({ headless: true });

async function prepareWorkbench(page) {
  // Provider-neutral: set chatStarted via store, do NOT trigger LLM via ?prompt
  await page.evaluate(async () => {
    const chatMod = await import('/app/lib/stores/chat.ts');
    chatMod.chatStore.setKey('started', true);

    const wb = await import('/app/lib/stores/workbench.ts');
    wb.workbenchStore.showWorkbench.set(true);
  });
  await page.waitForTimeout(900);
}

async function clickInspector(page, label) {
  try {
    const btn = page.locator(`button:has-text("${label}")`).first();
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click({ force: true });
    await page.waitForTimeout(700);

    return true;
  } catch (e) {
    console.log(`click ${label} fail`, e.message.slice(0, 80));
    return false;
  }
}

async function shot(name, viewport, url, setup, asserts) {
  console.log('->', name);

  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cude:provider', 'OpenAI');
      localStorage.removeItem('cude:apiKeys');
    } catch {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);

  try {
    await page.waitForSelector('textarea', { timeout: 8000 });
  } catch {}

  if (setup) {
    await setup(page);
  }

  await page.waitForTimeout(800);

  let ok = true;

  for (const a of asserts) {
    const body = await page.content();

    if (a.mustContain && !body.includes(a.mustContain)) {
      console.log(`  FAIL missing "${a.mustContain}"`);
      ok = false;
    }

    if (a.mustNotContain && body.includes(a.mustNotContain)) {
      console.log(`  FAIL should not contain "${a.mustNotContain}"`);
      ok = false;
    }
  }

  // non-blank
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 600));

  if (!txt || txt.trim().length < 15) {
    console.log('  FAIL blank');
    ok = false;
  }

  // no provider error
  const hasBedrock = await page.evaluate(
    () =>
      document.body.innerText.includes('AmazonBedrock is unavailable') ||
      document.body.innerText.includes('Authentication Error'),
  );

  if (hasBedrock) {
    console.log('  FAIL provider error present');
    ok = false;
  }

  if (!ok) {
    console.log('  SKIP');
    await ctx.close();

    return false;
  }

  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  console.log('  saved');
  await ctx.close();

  return true;
}

await shot('01-landing-desktop.png', { width: 1920, height: 1080 }, BASE, null, [
  { mustContain: 'What do you want to build' },
  { mustContain: 'Cude.new' },
]);
await shot('02-landing-mobile.png', { width: 390, height: 844 }, BASE, null, [
  { mustContain: 'What do you want to build' },
]);
await shot(
  '03-design-review-web.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
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
    await clickInspector(p, 'DESIGN');
  },
  [{ mustContain: 'WAITING FOR APPROVAL' }],
);
await shot(
  '04-design-review-browser-extension.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
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
    await clickInspector(p, 'DESIGN');
  },
  [{ mustContain: 'WAITING FOR APPROVAL' }, { mustContain: 'Popup' }],
);
await shot(
  '05-design-review-vscode-extension.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
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
    await clickInspector(p, 'DESIGN');
  },
  [{ mustContain: 'WAITING FOR APPROVAL' }, { mustContain: 'Side Bar View' }],
);
await shot(
  '06-design-review-multiplatform.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
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
    await clickInspector(p, 'DESIGN');
  },
  [{ mustContain: 'WAITING FOR APPROVAL' }],
);
await shot(
  '07-design-review-revision.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
      (c) => {
        const s = window.__CUDE_SEED;
        s.setDesignContract(c.contract);
        s.designRevisionSummaryStore.set(c.summary);
        s.setPipelineStatus('design_review');
      },
      { contract: revisedMulti, summary: revisionSummary },
    );
    await clickInspector(p, 'DESIGN');
  },
  [{ mustContain: 'REVISION' }],
);
await shot(
  '08-design-review-approved.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
      (c) => {
        const s = window.__CUDE_SEED;
        s.setDesignContract(c.contract);
        s.setPipelineStatus('design_approved');
      },
      { contract: approvedMulti },
    );
    await clickInspector(p, 'DESIGN');
  },
  [{ mustContain: 'APPROVED' }],
);
await shot(
  '09-product-family.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
      (c) => {
        const s = window.__CUDE_SEED;
        s.setArchitecture(c.arch);
        s.selectedTargetStore.set(Object.keys(c.arch.stackDecisions)[0]);
      },
      { arch: multiArch },
    );
    await clickInspector(p, 'PRODUCT');
  },
  [{ mustContain: 'PRODUCT' }],
);
await shot(
  '10-add-platform.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
      (c) => {
        const s = window.__CUDE_SEED;
        s.setArchitecture(c.arch);
      },
      { arch: multiArch },
    );
    await clickInspector(p, 'PRODUCT');
  },
  [{ mustContain: 'PRODUCT' }],
);
await shot(
  '11-system-overview.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
      (c) => {
        const s = window.__CUDE_SEED;
        s.setArchitecture(c.arch);
      },
      { arch: systemArch },
    );
    await clickInspector(p, 'ARCH');
  },
  [{ mustContain: 'ARCH' }],
);
await shot(
  '12-product-graph.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
      (c) => {
        const s = window.__CUDE_SEED;
        s.setArchitecture(c.arch);
      },
      { arch: multiArch },
    );
    await clickInspector(p, 'GRAPH');
  },
  [{ mustContain: 'GRAPH' }],
);
await shot(
  '13-architecture.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
      (c) => {
        const s = window.__CUDE_SEED;
        s.setArchitecture(c.arch);
      },
      { arch: multiArch },
    );
    await clickInspector(p, 'ARCH');
  },
  [{ mustContain: 'ARCH' }],
);
await shot(
  '14-agents-pipeline-active.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(() => {
      const s = window.__CUDE_SEED;
      s.resetPipeline();

      const cur = s.pipelineStore.get();
      const next = {
        ...cur,
        status: 'running',
        agents: cur.agents.map((a, i) =>
          i < 2
            ? { ...a, status: 'complete', summary: a.id + ' done' }
            : i === 2
              ? { ...a, status: 'working', summary: 'Working...' }
              : i === 3
                ? { ...a, status: 'working', summary: 'Planning' }
                : a,
        ),
      };
      s.pipelineStore.set(next);
      s.setPipelineStatus('running');
    });
    await clickInspector(p, 'AGENTS');
  },
  [{ mustContain: 'AGENTS' }],
);
await shot(
  '15-theme-studio-active.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
      (c) => {
        const s = window.__CUDE_SEED;
        s.designSystemStore.set(c.ds);
        s.designSystemStatusStore.set('active');
      },
      { ds: multiArch.designSystem },
    );
    await clickInspector(p, 'THEME');
  },
  [{ mustContain: 'THEME' }],
);

// 16 workbench-code — OMITTED: no live provider E2E, no genuine generated source to show. Do not fabricate.
let saved16 = await shot(
  '16-workbench-code.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
  },
  [{ mustContain: '__THIS_WILL_NEVER_MATCH__' }],
);

if (saved16) {
  console.log('16 unexpectedly saved, removing to avoid false code proof');

  try {
    fs.unlinkSync(path.join(OUT, '16-workbench-code.png'));
  } catch {}
}

await shot(
  '17-workbench-building.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(() => {
      const s = window.__CUDE_SEED;
      s.resetPipeline();

      const cur = s.pipelineStore.get();
      const next = {
        ...cur,
        status: 'building',
        agents: cur.agents.map((a, i) =>
          i < 4 ? { ...a, status: 'complete' } : i === 4 ? { ...a, status: 'working', summary: 'Building...' } : a,
        ),
      };
      s.pipelineStore.set(next);
      s.setPipelineStatus('building');
    });
  },
  [{ mustContain: 'Cude.new' }],
);
await shot(
  '18-browser-extension-final.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
      (c) => {
        const s = window.__CUDE_SEED;
        s.setDesignContract(c.contract);
        s.setArchitecture(c.arch);
        s.setPipelineStatus('design_approved');
        s.designReviewPlatformStore.set('browser-extension');
      },
      { contract: approvedExt, arch: extArch },
    );
    await clickInspector(p, 'DESIGN');
  },
  [{ mustContain: 'APPROVED' }, { mustContain: 'Popup' }],
);
await shot(
  '19-vscode-extension-final.png',
  { width: 1920, height: 1080 },
  BASE,
  async (p) => {
    await prepareWorkbench(p);
    await p.evaluate(
      (c) => {
        const s = window.__CUDE_SEED;
        s.setDesignContract(c.contract);
        s.setArchitecture(c.arch);
        s.setPipelineStatus('design_approved');
        s.designReviewPlatformStore.set('vscode-extension');
      },
      { contract: approvedVs, arch: vscodeArch },
    );
    await prepareWorkbench(p);
    await clickInspector(p, 'DESIGN');
  },
  [{ mustContain: 'APPROVED' }, { mustContain: 'Side Bar View' }],
);
await shot('20-provider-openai.png', { width: 1920, height: 1080 }, BASE, null, [{ mustContain: 'Cude.new' }]);

// If 16 was saved but empty, remove it to avoid false code proof — we will handle after
try {
  const s = fs.statSync(path.join(OUT, '16-workbench-code.png'));

  if (s.size < 50000) {
    console.log('16 size small, keeping but will mark as omitted in README');
  }
} catch {}

await browser.close();
console.log('done, files:', fs.readdirSync(OUT).sort());
