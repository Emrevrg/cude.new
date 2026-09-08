/**
 * Cude.new — cloning a program the person already uses.
 *
 * Someone points at a thing that exists — the Claude app on their desktop, an
 * extension in their browser, a page on the web — and gets back a project that
 * works like it. Three targets, because these are the three a person can
 * actually hand us a real reference for: a web page has a URL, an installed
 * app has a name and a publisher, an extension has a manifest.
 *
 * What we build is a working implementation of the same idea, written from
 * scratch. Not a copy: no borrowed markup, assets or text. The reference tells
 * us what the thing *does* and how it is laid out, and that is the part worth
 * recreating.
 */

export type CloneTarget = 'web' | 'extension' | 'desktop';

/** What the person picked, however they picked it. */
export interface CloneReference {
  /** What to call it: "Claude", "uBlock Origin", "Linear". */
  name: string;

  /** Where it came from, when there is a where: a URL or a store link. */
  url?: string;

  /** Publisher, version, description — whatever the source gave us. */
  facts?: Record<string, string>;

  /** How the person chose it, so the prompt can say so plainly. */
  origin?: 'installed' | 'store' | 'url' | 'typed';
}

export interface CloneRequest {
  target: CloneTarget;
  reference: CloneReference;

  /** Anything they want changed in the clone: "make it dark", "no login". */
  detail?: string;
}

export interface ClonePrompt {
  system: string;
  user: string;
  starter: string | null;
}

interface TargetMeta {
  label: string;
  starter: string | null;
  stack: string;

  /** The things that make this kind of program feel like itself. */
  essentials: string[];
}

const TARGETS: Record<CloneTarget, TargetMeta> = {
  /*
   * Starter ids are STARTER_TEMPLATES names, which the picker resolves to a
   * download. All three clone kinds start from the React + Vite template.
   */
  web: {
    label: 'web page',
    starter: 'Vite React',
    stack: 'React + Vite + TypeScript + Tailwind',
    essentials: [
      'the page structure and navigation the reference uses',
      'real routing, not a single scrolling mock',
      'the responsive behaviour — it has to hold up narrow as well as wide',
    ],
  },
  extension: {
    label: 'browser extension',
    starter: 'Vite React',
    stack: 'Manifest V3 + TypeScript, with a popup, a content script and a service worker as the function requires',
    essentials: [
      'a manifest.json that a browser will actually load, requesting only the permissions the function needs',
      'the surfaces the reference uses — popup, options page, context menu, content script — and no others',
      'state that survives the popup closing, via chrome.storage',
      'a browser-served popup/options preview with explicit unavailable-API states; keep native extension APIs behind an adapter and document loading the built extension unpacked in Chrome/Edge',
    ],
  },
  desktop: {
    label: 'desktop app',
    starter: 'Vite React',
    stack: 'Tauri (Rust shell + web UI), or Electron where a Node API is genuinely needed',
    essentials: [
      'a window that opens with the real layout: sidebar, main pane, whatever the reference has',
      'the titlebar as layout row zero — full width, the measured height, same zones and window controls in the same order — never a separate floating box',
      'the parts that are not a web page — menus, tray, shortcuts, local files — where the reference has them',
      'data kept on disk, so closing the app does not lose it',
      'a Vite browser preview of the same renderer; isolate native filesystem/window APIs behind adapters and clearly label browser-only fallbacks',
    ],
  },
};

export function describeTarget(target: CloneTarget): string {
  return TARGETS[target].label;
}

export function starterFor(target: CloneTarget): string | null {
  return TARGETS[target].starter;
}

/** True when a string is a URL we could actually fetch. */
export function isUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

/**
 * Reads the extension id out of a store link.
 *
 * Chrome, Edge and Firefox all put something stable in the URL; the id is what
 * lets us say which extension is meant when two share a name.
 */
export function extensionIdFromUrl(url: string): string | null {
  const chrome = url.match(/chromewebstore\.google\.com\/detail\/[^/]+\/([a-p]{32})/i);

  if (chrome) {
    return chrome[1];
  }

  const chromeLegacy = url.match(/chrome\.google\.com\/webstore\/detail\/[^/]+\/([a-p]{32})/i);

  if (chromeLegacy) {
    return chromeLegacy[1];
  }

  const edge = url.match(/microsoftedge\.microsoft\.com\/addons\/detail\/[^/]+\/([a-z]{32})/i);

  if (edge) {
    return edge[1];
  }

  const firefox = url.match(/addons\.mozilla\.org\/[^/]*\/?firefox\/addon\/([^/?#]+)/i);

  if (firefox) {
    return firefox[1];
  }

  return null;
}

/**
 * Guesses the target from what someone typed.
 *
 * Only used to preselect a tab — the person can always override it, so a wrong
 * guess costs a click, and guessing at all saves the common case.
 */
export function inferCloneTarget(input: string): CloneTarget {
  const text = input.toLowerCase();

  if (extensionIdFromUrl(input) || /\bextension\b|\baddon\b|\badd-on\b|manifest v3|chrome web store/.test(text)) {
    return 'extension';
  }

  if (/\bdesktop\b|\.exe\b|\.dmg\b|\.app\b|tauri|electron|native app/.test(text)) {
    return 'desktop';
  }

  return 'web';
}

/**
 * Turns the reference into the lines of a prompt that describe it.
 *
 * Kept separate because the facts are the part that varies: an installed app
 * gives us a publisher and a version, a store link gives us an id, a typed
 * name gives us nothing but the name.
 */
function describeReference(reference: CloneReference, target: CloneTarget): string[] {
  const lines = [`Reference ${TARGETS[target].label}: ${reference.name}`];

  if (reference.url) {
    lines.push(`Source: ${reference.url}`);
  }

  for (const [key, value] of Object.entries(reference.facts ?? {})) {
    if (value) {
      lines.push(`${key}: ${value}`);
    }
  }

  if (reference.origin === 'installed') {
    lines.push('This is installed on the machine, so treat the name and version above as exact.');
  }

  if (reference.origin === 'typed') {
    lines.push(
      'Only the name was given. Work from what this product is generally known to do, and say in your first message which parts you are assuming.',
    );
  }

  return lines;
}

/**
 * Builds the prompt for a clone request.
 *
 * The instruction that matters most is the one about originality: the model is
 * being pointed at somebody elses product, and the useful, lawful thing to
 * produce is an independent implementation of the same function.
 */
export function buildClonePrompt(request: CloneRequest, excerpt?: string): ClonePrompt {
  const meta = TARGETS[request.target];
  const detail = request.detail?.trim();

  const system = [
    'You are Cude.new, an AI engineering team. Someone has pointed at a program they use and asked for one that works like it.',
    `Build: a ${meta.label} — ${meta.stack}.`,
    '',
    'What is being asked of you:',
    '1. Build a project that installs, builds and runs. A clone that does not start is not a clone.',
    `2. Recreate the function and the shape of the reference: ${meta.essentials.join('; ')}.`,
    '3. Write every line yourself. Do not reproduce the reference code, markup, copy, icons or artwork, and do not take its name or logo as your own — build the same kind of program, not a forgery of that one.',
    '4. Take the design through the token pipeline (tokens.css → primitives → screens) so the whole thing looks like one product rather than a pile of screens.',
    '5. Clone the core. The reference has years of edge cases in it; ship the smallest version that is genuinely useful, and say what you left out.',
  ].join('\n');

  const parts = [
    `Build a ${meta.label} that works like this one.`,
    '',
    ...describeReference(request.reference, request.target),
  ];

  if (excerpt) {
    parts.push(
      '',
      'What the source says about it — for structure and function, not to copy from:',
      '```',
      truncate(excerpt, 8000),
      '```',
    );
  }

  if (detail) {
    parts.push('', `Also: ${detail}`);
  }

  parts.push(
    '',
    'Start by naming the handful of things this program has to do to be worth using, then build those. Use the Cude conventions (cudeArtifact / cudeAction, tokens.css, design-system.ts).',
  );

  return { system, user: parts.join('\n'), starter: meta.starter };
}

/** The single message the chat is sent when someone confirms a clone. */
export function buildCloneMessage(request: CloneRequest, excerpt?: string): string {
  const prompt = buildClonePrompt(request, excerpt);

  return `${prompt.system}\n\n${prompt.user}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max)}\n…(truncated)`;
}
