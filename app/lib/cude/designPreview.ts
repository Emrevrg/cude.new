/**
 * Cude.new - Design proposal renderer
 *
 * Turns a {@link DesignContract} surface into a real, inspectable HTML document
 * using the project's actual design tokens. Nothing here is a picture or a
 * mock-up asset: it is the same kind of markup the Builder will produce, which
 * is why it is safe to approve against.
 *
 * The renderer is deterministic — the same contract always produces the same
 * document — and it draws a genuinely different composition per platform. A
 * browser-extension popup is not a shrunken dashboard, and a VS Code side bar
 * view is a tree, not a card grid.
 */

import type { DesignSystem } from './designSystem';
import type { DensityLevel, DesignSurface, PlatformDesign } from './designContract';

/** Spacing multipliers per density level. */
const DENSITY_SCALE: Record<DensityLevel, { pad: number; gap: number; row: number; font: number }> = {
  comfortable: { pad: 20, gap: 16, row: 44, font: 14 },
  balanced: { pad: 16, gap: 12, row: 38, font: 13.5 },
  compact: { pad: 12, gap: 8, row: 30, font: 12.5 },
  dense: { pad: 8, gap: 6, row: 24, font: 12 },
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Deterministic pseudo-random so previews are stable across renders. */
function seeded(seed: string): () => number {
  let h = 2166136261;

  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return () => {
    h += 0x6d2b79f5;

    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tokens(ds: DesignSystem, density: DensityLevel): string {
  const scale = DENSITY_SCALE[density];

  return `
    --bg: ${ds.colors.background};
    --surface: ${ds.colors.surface};
    --surface-2: ${ds.colors.surfaceElevated ?? ds.colors.surface};
    --hover: ${ds.colors.surfaceHover ?? ds.colors.surface};
    --text: ${ds.colors.textPrimary};
    --text-2: ${ds.colors.textSecondary};
    --text-3: ${ds.colors.textTertiary};
    --border: ${ds.colors.border};
    --accent: ${ds.colors.accent ?? ds.colors.textPrimary};
    --radius: ${ds.radius.md};
    --radius-lg: ${ds.radius.lg};
    --pad: ${scale.pad}px;
    --gap: ${scale.gap}px;
    --row: ${scale.row}px;
    --font: ${scale.font}px;
    --font-family: ${ds.typography.fontFamily};
  `;
}

const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    font-family: var(--font-family);
    font-size: var(--font);
    background: var(--bg);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
  }
  .muted { color: var(--text-2); }
  .dim { color: var(--text-3); }
  .row { display: flex; align-items: center; gap: var(--gap); }
  .col { display: flex; flex-direction: column; }
  .grow { flex: 1; min-width: 0; min-height: 0; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sep { border-bottom: 1px solid var(--border); }
  .label { font-size: 0.72em; letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-3); }
  .btn {
    height: ${'var(--row)'}; padding: 0 12px; display: inline-flex; align-items: center; justify-content: center;
    border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface);
    color: var(--text); font-size: 0.95em; white-space: nowrap;
  }
  .btn-primary { background: var(--text); color: var(--bg); border-color: var(--text); font-weight: 600; }
  .chip {
    padding: 2px 7px; border-radius: 999px; border: 1px solid var(--border);
    font-size: 0.72em; color: var(--text-2); white-space: nowrap;
  }
  .bar { height: 4px; border-radius: 2px; background: var(--border); }
  .bar > i { display: block; height: 100%; border-radius: 2px; background: var(--text); }
  .skel { height: 0.62em; border-radius: 3px; background: var(--border); opacity: 0.85; }
`;

function htmlDocument(title: string, ds: DesignSystem, density: DensityLevel, body: string, extraCss = ''): string {
  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>:root{${tokens(ds, density)}}${BASE_CSS}${extraCss}</style>
</head><body>${body}</body></html>`;
}

/*
 * ------------------------------------------------------------------ *
 * Shared fragments
 * ------------------------------------------------------------------
 */

function skeletonLine(width: string): string {
  return `<div class="skel" style="width:${width}"></div>`;
}

function listRows(count: number, rnd: () => number, opts: { amount?: boolean; meta?: boolean } = {}): string {
  const rows: string[] = [];

  for (let i = 0; i < count; i++) {
    const w = 40 + Math.round(rnd() * 40);
    rows.push(`
      <div class="row sep" style="height:var(--row);padding:0 var(--pad);gap:var(--gap)">
        <div style="width:0.9em;height:0.9em;border-radius:3px;background:var(--border);flex:none"></div>
        <div class="grow">${skeletonLine(`${w}%`)}</div>
        ${opts.meta ? `<div class="dim" style="font-size:0.78em;flex:none">${['Today', 'Yesterday', '2d'][i % 3]}</div>` : ''}
        ${opts.amount ? `<div style="flex:none;font-variant-numeric:tabular-nums;font-size:0.86em">${(rnd() * 200).toFixed(2)}</div>` : ''}
      </div>`);
  }

  return rows.join('');
}

function metricTiles(count: number, rnd: () => number): string {
  const tiles: string[] = [];

  for (let i = 0; i < count; i++) {
    tiles.push(`
      <div style="flex:1;min-width:0;border:1px solid var(--border);border-radius:var(--radius);padding:var(--pad)">
        <div class="label">Metric ${i + 1}</div>
        <div style="font-size:1.6em;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums">${Math.round(rnd() * 900) + 100}</div>
        <div class="bar" style="margin-top:8px"><i style="width:${30 + Math.round(rnd() * 60)}%"></i></div>
      </div>`);
  }

  return `<div class="row" style="gap:var(--gap);padding:var(--pad);align-items:stretch">${tiles}</div>`;
}

function navItems(labels: string[], activeIndex = 0): string {
  return labels
    .map(
      (label, i) => `
      <div class="row truncate" style="height:var(--row);padding:0 10px;border-radius:var(--radius);gap:8px;${
        i === activeIndex ? 'background:var(--hover);font-weight:600' : 'color:var(--text-2)'
      }">
        <span style="width:0.8em;height:0.8em;border-radius:3px;background:var(--border);flex:none"></span>
        <span class="truncate">${escapeHtml(label)}</span>
      </div>`,
    )
    .join('');
}

function formFields(count: number): string {
  const fields: string[] = [];

  for (let i = 0; i < count; i++) {
    fields.push(`
      <div class="col" style="gap:5px">
        <div class="label">Field ${i + 1}</div>
        <div style="height:var(--row);border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)"></div>
      </div>`);
  }

  return `<div class="col" style="gap:var(--gap);padding:var(--pad)">${fields}</div>`;
}

/*
 * ------------------------------------------------------------------ *
 * Platform compositions
 * ------------------------------------------------------------------
 */

function renderExtensionPopup(surface: DesignSurface, ds: DesignSystem, d: PlatformDesign, rnd: () => number): string {
  if (surface.id === 'options') {
    return `
      <div class="col" style="height:100%;background:var(--bg)">
        <div class="row sep" style="height:44px;padding:0 var(--pad)">
          <strong class="grow">Settings</strong>
        </div>
        <div class="grow" style="overflow:auto">${formFields(5)}</div>
      </div>`;
  }

  return `
    <div class="col" style="height:100%;background:var(--bg)">
      <div class="row sep" style="height:38px;padding:0 var(--pad);flex:none">
        <span style="width:14px;height:14px;border-radius:4px;background:var(--text);flex:none"></span>
        <strong class="grow truncate" style="font-size:0.95em">Page Summary</strong>
        <span class="chip">Ready</span>
      </div>

      <div class="col sep" style="padding:var(--pad);gap:4px;flex:none">
        <div class="label">Current page</div>
        <div class="truncate" style="font-weight:600">Quarterly engineering report</div>
        <div class="dim truncate" style="font-size:0.8em">example.com/reports/q3</div>
      </div>

      <div style="padding:var(--pad);flex:none">
        <button class="btn btn-primary" style="width:100%">Summarize this page</button>
      </div>

      <div class="col sep" style="padding:0 var(--pad) var(--pad);gap:6px;flex:none">
        <div class="row"><span class="label grow">Summary</span><span class="chip">Copy</span></div>
        ${skeletonLine('100%')}${skeletonLine('96%')}${skeletonLine('88%')}${skeletonLine('60%')}
      </div>

      <div class="col" style="flex:1 1 auto;min-height:0;overflow:auto">
        <div class="label" style="padding:var(--pad) var(--pad) 6px">Recent</div>
        ${listRows(9, rnd, { meta: true })}
      </div>

      <div class="row sep" style="height:34px;padding:0 var(--pad);flex:none;border-bottom:0;border-top:1px solid var(--border)">
        <span class="dim grow" style="font-size:0.78em">${d.density} · ${d.viewport.width}px</span>
        <span class="chip">Settings</span>
      </div>
    </div>`;
}

function renderVsCodeView(surface: DesignSurface, ds: DesignSystem, d: PlatformDesign, rnd: () => number): string {
  if (surface.id === 'settings') {
    return `
      <div class="col" style="height:100%">
        <div class="row sep" style="height:32px;padding:0 10px"><strong class="grow" style="font-size:0.9em">Extension Settings</strong></div>
        <div class="grow" style="overflow:auto">${formFields(4)}</div>
      </div>`;
  }

  if (surface.id === 'panel') {
    return `
      <div class="col" style="height:100%">
        <div class="row sep" style="height:30px;padding:0 10px;gap:14px">
          <span style="font-weight:600;border-bottom:1px solid var(--text);height:30px;display:flex;align-items:center">REVIEW</span>
          <span class="dim">PROBLEMS</span><span class="dim">TERMINAL</span>
        </div>
        <div class="col grow" style="padding:10px;gap:8px;overflow:auto;font-family:ui-monospace,monospace;font-size:0.9em">
          <div class="row" style="gap:8px"><span class="chip">error</span><span class="truncate">Unhandled promise rejection</span></div>
          <div style="border-left:2px solid var(--border);padding-left:10px" class="col">
            ${skeletonLine('80%')}${skeletonLine('64%')}${skeletonLine('72%')}
          </div>
          <div class="row" style="gap:8px"><button class="btn btn-primary">Apply fix</button><button class="btn">Ignore</button></div>
        </div>
      </div>`;
  }

  // Side Bar tree view — the primary surface.
  const groups = [
    { name: 'Errors', count: 3, sev: 'error' },
    { name: 'Warnings', count: 5, sev: 'warn' },
    { name: 'Suggestions', count: 4, sev: 'info' },
  ];

  const tree = groups
    .map(
      (g) => `
      <div class="col">
        <div class="row" style="height:22px;padding:0 8px;gap:6px;font-weight:600">
          <span class="dim">▾</span><span class="truncate grow">${g.name}</span><span class="dim">${g.count}</span>
        </div>
        ${Array.from({ length: g.count })
          .map(
            () => `
          <div class="row" style="height:22px;padding:0 8px 0 24px;gap:6px">
            <span style="width:6px;height:6px;border-radius:50%;background:var(--text-3);flex:none"></span>
            <span class="truncate grow" style="font-size:0.92em">${skeletonLine(`${45 + Math.round(rnd() * 40)}%`)}</span>
            <span class="dim" style="font-size:0.8em;flex:none">:${Math.round(rnd() * 200) + 10}</span>
          </div>`,
          )
          .join('')}
      </div>`,
    )
    .join('');

  return `
    <div class="col" style="height:100%">
      <div class="row sep" style="height:26px;padding:0 8px;gap:8px;flex:none">
        <span class="label grow">Code Review</span>
        <span class="dim">⟳</span><span class="dim">⚟</span><span class="dim">⋯</span>
      </div>
      <div class="grow" style="overflow:auto;min-height:0">${tree}</div>
      <div class="row" style="height:24px;padding:0 8px;border-top:1px solid var(--border);flex:none">
        <span class="dim grow" style="font-size:0.8em">12 issues · analysed 2m ago</span>
      </div>
      <div class="row" style="gap:6px;padding:8px;border-top:1px solid var(--border);flex:none">
        <button class="btn btn-primary grow">Apply all safe fixes</button>
      </div>
    </div>`;
}

function renderMobile(surface: DesignSurface, ds: DesignSystem, d: PlatformDesign, rnd: () => number): string {
  const nav = `
    <div class="row" style="height:56px;border-top:1px solid var(--border);flex:none">
      ${['Home', 'Add', 'Account']
        .map(
          (
            l,
            i,
          ) => `<div class="col grow" style="align-items:center;justify-content:center;gap:3px;${i === 0 ? '' : 'color:var(--text-3)'}">
            <span style="width:18px;height:18px;border-radius:5px;background:${i === 0 ? 'var(--text)' : 'var(--border)'}"></span>
            <span style="font-size:0.72em">${l}</span></div>`,
        )
        .join('')}
    </div>`;

  if (surface.id === 'profile') {
    return `
      <div class="col" style="height:100%">
        <div class="row sep" style="height:52px;padding:0 var(--pad);flex:none"><strong class="grow">Account</strong></div>
        <div class="grow" style="overflow:auto">
          <div class="row sep" style="padding:var(--pad);gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--border);flex:none"></div>
            <div class="col grow" style="gap:4px">${skeletonLine('55%')}${skeletonLine('40%')}</div>
          </div>
          <div class="row sep" style="height:var(--row);padding:0 var(--pad)"><span class="grow">Sync</span><span class="chip">On</span></div>
          ${formFields(3)}
        </div>
        ${nav}
      </div>`;
  }

  if (surface.id === 'detail') {
    return `
      <div class="col" style="height:100%">
        <div class="row sep" style="height:52px;padding:0 var(--pad);gap:10px;flex:none">
          <span class="dim">←</span><strong class="grow truncate">Detail</strong>
        </div>
        <div class="grow" style="overflow:auto">${formFields(5)}</div>
        <div class="row" style="padding:var(--pad);gap:8px;flex:none"><button class="btn btn-primary grow">Save</button><button class="btn">Delete</button></div>
        ${nav}
      </div>`;
  }

  return `
    <div class="col" style="height:100%;position:relative">
      <div class="row sep" style="height:52px;padding:0 var(--pad);flex:none">
        <strong class="grow" style="font-size:1.05em">Expenses</strong><span class="chip">Synced</span>
      </div>
      <div class="row sep" style="padding:var(--pad);gap:var(--gap);flex:none">
        ${['This month', 'Pending']
          .map(
            (l) => `<div class="col grow" style="gap:2px"><span class="label">${l}</span>
              <span style="font-size:1.35em;font-weight:600;font-variant-numeric:tabular-nums">${(rnd() * 900).toFixed(2)}</span></div>`,
          )
          .join('')}
      </div>
      <div class="grow" style="overflow:auto;min-height:0">
        <div class="label" style="padding:var(--pad) var(--pad) 6px">Recent</div>
        ${listRows(7, rnd, { amount: true, meta: true })}
      </div>
      <div style="position:absolute;right:16px;bottom:74px;width:52px;height:52px;border-radius:50%;background:var(--text);color:var(--bg);display:flex;align-items:center;justify-content:center;font-size:1.5em">+</div>
      ${nav}
    </div>`;
}

function renderDesktop(surface: DesignSurface, ds: DesignSystem, d: PlatformDesign, rnd: () => number): string {
  if (surface.id === 'dialog') {
    return `
      <div class="col" style="height:100%;align-items:center;justify-content:center;background:var(--bg)">
        <div class="col" style="width:460px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--surface);box-shadow:0 12px 40px rgba(0,0,0,.18)">
          <div class="row sep" style="height:44px;padding:0 var(--pad)"><strong class="grow">New entry</strong><span class="dim">✕</span></div>
          ${formFields(4)}
          <div class="row" style="padding:var(--pad);gap:8px;justify-content:flex-end;border-top:1px solid var(--border)">
            <button class="btn">Cancel</button><button class="btn btn-primary">Create</button>
          </div>
        </div>
      </div>`;
  }

  if (surface.id === 'settings') {
    return `
      <div class="row" style="height:100%">
        <div class="col" style="width:200px;border-right:1px solid var(--border);padding:var(--pad);gap:2px">
          ${navItems(['General', 'Account', 'Sync', 'Data', 'Advanced'])}
        </div>
        <div class="col grow">${formFields(6)}</div>
      </div>`;
  }

  // Multi-pane workspace.
  return `
    <div class="row" style="height:100%;align-items:stretch">
      <div class="col" style="width:190px;border-right:1px solid var(--border);flex:none">
        <div class="row" style="height:42px;padding:0 var(--pad);border-bottom:1px solid var(--border)">
          <strong class="truncate">Expenses</strong>
        </div>
        <div class="col" style="padding:8px;gap:2px">${navItems(['All', 'This month', 'Pending', 'Categories', 'Reports', 'Archive'])}</div>
      </div>

      <div class="col grow" style="min-width:0">
        <div class="row" style="height:42px;padding:0 var(--pad);gap:8px;border-bottom:1px solid var(--border);flex:none">
          <div style="flex:1;height:26px;border:1px solid var(--border);border-radius:var(--radius);max-width:280px"></div>
          <span class="chip">Filter</span><span class="chip">Sort</span>
          <div class="grow"></div>
          <button class="btn btn-primary" style="height:26px">New</button>
        </div>
        <div class="row" style="height:26px;padding:0 var(--pad);gap:var(--gap);border-bottom:1px solid var(--border);flex:none">
          ${['Date', 'Description', 'Category', 'Amount'].map((h) => `<span class="label grow">${h}</span>`).join('')}
        </div>
        <div class="grow" style="overflow:auto;min-height:0">${listRows(14, rnd, { amount: true, meta: true })}</div>
        <div class="row" style="height:24px;padding:0 var(--pad);border-top:1px solid var(--border);flex:none">
          <span class="dim" style="font-size:0.8em">142 records · synced 1m ago</span>
        </div>
      </div>

      <div class="col" style="width:280px;border-left:1px solid var(--border);flex:none">
        <div class="row" style="height:42px;padding:0 var(--pad);border-bottom:1px solid var(--border)"><strong class="grow">Inspector</strong></div>
        <div class="col" style="padding:var(--pad);gap:var(--gap)">
          ${['Date', 'Amount', 'Category', 'Note']
            .map(
              (l) => `<div class="col" style="gap:4px"><span class="label">${l}</span>
                <div style="height:26px;border:1px solid var(--border);border-radius:var(--radius)"></div></div>`,
            )
            .join('')}
        </div>
      </div>
    </div>`;
}

function renderWeb(surface: DesignSurface, ds: DesignSystem, d: PlatformDesign, rnd: () => number): string {
  const sidebar = `
    <div class="col" style="width:210px;border-right:1px solid var(--border);flex:none">
      <div class="row" style="height:52px;padding:0 var(--pad);border-bottom:1px solid var(--border)">
        <strong class="truncate">Expenses</strong>
      </div>
      <div class="col" style="padding:10px;gap:2px">${navItems(['Dashboard', 'Expenses', 'Categories', 'Reports', 'Team', 'Settings'])}</div>
    </div>`;

  if (surface.id === 'settings') {
    return `<div class="row" style="height:100%">${sidebar}
      <div class="col grow">
        <div class="row" style="height:52px;padding:0 var(--pad);border-bottom:1px solid var(--border)"><strong class="grow">Settings</strong></div>
        <div class="row grow" style="min-height:0">
          <div class="col" style="width:180px;border-right:1px solid var(--border);padding:10px;gap:2px">${navItems(['Account', 'Billing', 'Sync', 'Members'])}</div>
          <div class="grow" style="overflow:auto">${formFields(6)}</div>
        </div>
      </div></div>`;
  }

  if (surface.id === 'detail') {
    return `<div class="row" style="height:100%">${sidebar}
      <div class="col grow" style="min-width:0">
        <div class="row" style="height:52px;padding:0 var(--pad);gap:8px;border-bottom:1px solid var(--border)">
          <span class="dim">Expenses /</span><strong class="truncate grow">Entry 4821</strong>
          <button class="btn" style="height:28px">Edit</button><button class="btn btn-primary" style="height:28px">Approve</button>
        </div>
        <div class="row grow" style="min-height:0">
          <div class="grow" style="overflow:auto">${formFields(6)}</div>
          <div class="col" style="width:280px;border-left:1px solid var(--border);padding:var(--pad);gap:var(--gap)">
            <span class="label">Activity</span>
            ${listRows(5, rnd, { meta: true })}
          </div>
        </div>
      </div></div>`;
  }

  return `<div class="row" style="height:100%">${sidebar}
    <div class="col grow" style="min-width:0">
      <div class="row" style="height:52px;padding:0 var(--pad);gap:8px;border-bottom:1px solid var(--border);flex:none">
        <strong class="grow" style="font-size:1.05em">Dashboard</strong>
        <span class="chip">This month</span>
        <button class="btn btn-primary" style="height:28px">New expense</button>
      </div>
      ${metricTiles(4, rnd)}
      <div class="col grow" style="min-height:0;border-top:1px solid var(--border)">
        <div class="row" style="padding:var(--pad) var(--pad) 6px"><span class="label grow">Recent expenses</span><span class="chip">View all</span></div>
        <div class="grow" style="overflow:auto">${listRows(9, rnd, { amount: true, meta: true })}</div>
      </div>
    </div></div>`;
}

/*
 * ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------
 */

/**
 * Renders one surface of one platform as a standalone HTML document, suitable
 * for an iframe `srcdoc`. Uses the product's real tokens, so approving the
 * preview means approving the tokens too.
 */
export function renderSurfacePreview(design: PlatformDesign, surface: DesignSurface, ds: DesignSystem): string {
  const rnd = seeded(`${design.platform}:${surface.id}:${ds.meta.version}`);

  let body: string;

  switch (design.platform) {
    case 'browser-extension':
      body = renderExtensionPopup(surface, ds, design, rnd);
      break;
    case 'vscode-extension':
    case 'ide-extension':
      body = renderVsCodeView(surface, ds, design, rnd);
      break;
    case 'android':
    case 'ios':
    case 'mobile':
      body = renderMobile(surface, ds, design, rnd);
      break;
    case 'desktop':
      body = renderDesktop(surface, ds, design, rnd);
      break;
    default:
      body = renderWeb(surface, ds, design, rnd);
      break;
  }

  return htmlDocument(`${design.platform} · ${surface.name}`, ds, design.density, body);
}

/** Every surface of a platform, keyed by surface id. */
export function renderPlatformPreviews(design: PlatformDesign, ds: DesignSystem): Record<string, string> {
  const out: Record<string, string> = {};

  for (const surface of design.surfaces) {
    out[surface.id] = renderSurfacePreview(design, surface, ds);
  }

  return out;
}
