/**
 * Cude.new — exploring a reference before cloning it or taking inspiration.
 *
 * A clone built from a name alone is a guess: the model invents a layout,
 * invents the flows, and the result only shares the name. The fix is a second
 * model — the "brain" the person picks — that studies the reference first and
 * writes down what it learned as a UI map: the screens, the controls, the
 * flows, and the places that must never be touched. The builder model then
 * works from that map instead of from memory.
 *
 * Two modes share the exploration. Cloning recreates the function and the
 * shape as an original implementation. Get Inspired keeps the information
 * architecture and the feel, but the expression stays new — the same way a
 * designer studies a product and then draws something of their own.
 */

import type { CloneReference, CloneTarget } from './clone';

export type ExploreMode = 'clone' | 'inspire';

/** The second model: the brain that maps the reference. The builder stays the chat model. */
export interface ExplorerSelection {
  provider: string;
  model: string;
}

/** A reference screenshot, base64 without the data-URL prefix. */
export interface ReferenceScreenshot {
  name: string;
  mediaType: string;
  data: string;
}

export interface ExplorationInput {
  mode: ExploreMode;
  target: CloneTarget;
  reference: CloneReference;
  detail?: string;
  excerpt?: string;

  /** The brain that drew the map. Absent when no map was drawn. */
  explorer?: ExplorerSelection;

  /** Desktop window chrome to reproduce. Defaults to windows. */
  osChrome?: OsChrome;
}

/**
 * Which desktop the clone will live on.
 *
 * A Windows strip with macOS traffic lights (or any other mix) is the
 * fastest way to make a desktop clone feel wrong, so the choice is asked up
 * front and travels with the request instead of being guessed from a word in
 * the prompt.
 */
export type OsChrome = 'windows' | 'macos' | 'linux';

export const OS_CHROME_PRESETS: Record<OsChrome, { label: string; controls: string; placement: string }> = {
  windows: {
    label: 'Windows 11',
    controls: 'Minimize, Maximize/Restore, Close — caption glyphs',
    placement: 'top-right corner, square hit areas, one shared strip height',
  },
  macos: {
    label: 'macOS',
    controls: 'Close, Minimize, Zoom — round traffic lights, red/yellow/green',
    placement: 'top-left corner, fixed order, never mirrored to the right',
  },
  linux: {
    label: 'Linux',
    controls: 'Minimize, Maximize, Close — symbolic monochrome glyphs',
    placement: 'top-right corner (left on some desktops — pick one and keep it)',
  },
};

/** The titlebar lines for a chosen OS chrome, appended to the desktop directive. */
export function osChromeDirective(os: OsChrome): string[] {
  const preset = OS_CHROME_PRESETS[os];

  return [
    `Window chrome to build: ${preset.label}. Trailing controls are ${preset.controls}, placed at the ${preset.placement}. Where the reference measures differently, follow the reference strip and say so.`,
  ];
}

export const MAP_FENCE = 'ui-map';

/** Small enough to ride along in a prompt, large enough to hold a real map. */
export const MAX_SCREENSHOTS = 6;
export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_SCREENSHOT_MEDIA = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * What the explorer — and later the builder wiring the clone — must never do.
 *
 * Exploring means looking and navigating reversibly, not committing. Every
 * control below is recorded as a forbidden zone on the map and is never
 * activated during exploration; a clone wires the safe equivalent (a demo
 * confirmation, a disabled state) instead of the real destructive effect.
 */
export const FORBIDDEN_EXPLORATION_ACTIONS: Array<{ action: string; why: string }> = [
  { action: 'Sign out / Log out / Switch account / Delete account', why: 'ends the session being studied' },
  { action: 'Delete / Remove / Destroy / Move to trash / Uninstall', why: 'destroys data or the app itself' },
  { action: 'Pay / Buy / Confirm purchase / Submit an order / Subscribe', why: 'spends real money' },
  { action: 'Close window / Quit / Exit / Restart the app', why: 'kills the exploration session' },
  { action: 'Send / Post / Publish / Share / Invite / Comment', why: 'acts on other people' },
  { action: 'Grant permissions / Allow access / Install / Trust', why: 'changes machine security state' },
  { action: 'Typing passwords, tokens, or personal data anywhere', why: 'secrets must never enter a study session' },
  {
    action: 'Leaving the app: the address bar, external links, OS settings',
    why: 'the map is of this app, not elsewhere',
  },
];

/**
 * How exploration behaves: observe first, touch only what is reversible.
 *
 * Tabs, back navigation, expanding menus, scrolling and hovering are safe.
 * Anything that writes, sends, pays or closes is not exploration — it is use,
 * and use is out of scope. A control whose effect is unclear is treated as
 * forbidden until proven otherwise.
 */
export const SAFE_EXPLORATION_RULES: string[] = [
  'Look before touching: screenshot and describe each screen before interacting with it.',
  'Only reversible navigation: tabs, back buttons, expanding menus, scrolling, hovering.',
  'Expanding is safe, committing is not: opening a menu maps it, choosing a destructive item does not.',
  'Unclear means forbidden: a control whose effect cannot be proven safe is recorded as a forbidden zone, never activated.',
  'Forms are read, not submitted: note the fields and validation, never press the submit button.',
  'One screen at a time: finish mapping a screen — including its dialogs — before moving on.',
];

/**
 * The desktop titlebar contract.
 *
 * The recurring failure in desktop clones: the top strip — traffic lights or
 * min/max/close, title, tabs — is rebuilt as a separate floating box below or
 * beside where the real chrome sits, with the wrong height and dead controls.
 * The titlebar is layout row zero: full window width, the exact measured
 * height, same zones in the same order, controls that do their named job.
 */
export const TITLEBAR_SPEC: string[] = [
  'Row zero: the titlebar is the first layout row, full window width, no gap above it and no second bar below it.',
  'Exact height: measure the strip from the reference (usually 28–48px) and use that height, not a guess.',
  'Three zones in order: leading (app icon, title, window menu), center (tabs, search, or drag region), trailing (window controls).',
  'Trailing controls keep OS order and corner position: minimize, maximize/restore, close — at the top corner, same sizes as measured.',
  'Controls work: dragging the strip moves the window, double-click toggles maximize, each button does its named job.',
  'No decoration drift: no extra padding, no rounded gap around the strip, no shadow that lifts it off the window.',
];

/** The sections a finished UI map must contain. Titlebar only for desktop. */
export function requiredMapSections(target: CloneTarget): string[] {
  const sections = ['Overview', 'Layout', 'Navigation and flows', 'Interactive inventory', 'Forbidden zones'];

  if (target === 'desktop') {
    sections.splice(2, 0, 'Titlebar');
  }

  return sections;
}

function modeLine(mode: ExploreMode): string {
  return mode === 'clone'
    ? 'MODE: CLONE. Recreate the function and the shape of the reference as an original implementation.'
    : 'MODE: GET INSPIRED. Keep the information architecture, the rhythm and the feel — but the expression is new. Same kind of product, your own design, your own words, your own artwork. Study, then draw something of your own; never trace.';
}

/** The system prompt for the brain model that maps the reference. */
export function buildExplorerSystem(mode: ExploreMode): string {
  return [
    'You are the explorer of an AI engineering team. A person pointed at a program they use. Your job is to study it — from screenshots and a description — and write a precise UI map another model will build from.',
    modeLine(mode),
    '',
    'How you explore:',
    ...SAFE_EXPLORATION_RULES.map((rule) => `- ${rule}`),
    '',
    'Never touch:',
    ...FORBIDDEN_EXPLORATION_ACTIONS.map((entry) => `- ${entry.action} — ${entry.why}.`),
    '',
    'Write the map inside one fenced block marked ui-map, with one section per required heading. Concrete and measured: pixel heights where they matter, exact labels, exact control order. Say what you could not see.',
  ].join('\n');
}

/** The user message for the brain model. */
export function buildExplorerUser(input: ExplorationInput, screenshotCount: number): string {
  const lines = [
    `Reference ${input.target}: ${input.reference.name}`,
    ...(input.reference.url ? [`Source: ${input.reference.url}`] : []),
    ...Object.entries(input.reference.facts ?? {})
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}: ${value}`),
    ...(input.excerpt ? ['', 'What the source says about it:', '```', input.excerpt.slice(0, 8000), '```'] : []),
    ...(input.detail?.trim() ? ['', `The person adds: ${input.detail.trim()}`] : []),
    '',
    screenshotCount > 0
      ? `${screenshotCount} screenshot(s) of the reference are attached. Treat them as the primary source: read every label, measure the strips and rows, map each screen before the next.`
      : 'No screenshots were attached. Map from the description and what this product is generally known to do; mark every uncertain part as assumed.',
    '',
    'Required map sections, in order:',
    ...requiredMapSections(input.target).map((section) => `- ${section}`),
  ];

  if (input.target === 'desktop') {
    lines.push('', 'Titlebar section — measure and record all of this:', ...TITLEBAR_SPEC.map((rule) => `- ${rule}`));
  }

  return lines.join('\n');
}

/** Pulls the ui-map block out of a brain answer; falls back to the whole text when substantial. */
export function parseUiMap(text: string): { map: string; fenced: boolean } {
  const fenced = text.match(/```ui-map\s*([\s\S]*?)```/);

  if (fenced?.[1]?.trim()) {
    return { map: fenced[1].trim(), fenced: true };
  }

  return { map: text.trim(), fenced: false };
}

/** A map too short to build from is not a map. */
export const MIN_MAP_CHARS = 400;

/** What is wrong with a map, if anything. Empty means usable. */
export function validateUiMap(map: string, target: CloneTarget): string[] {
  const problems: string[] = [];
  const trimmed = map.trim();

  if (trimmed.length < MIN_MAP_CHARS) {
    problems.push(`The map is ${trimmed.length} characters; at least ${MIN_MAP_CHARS} are needed to build from.`);
  }

  const lower = trimmed.toLowerCase();

  for (const section of requiredMapSections(target)) {
    if (!lower.includes(section.toLowerCase())) {
      problems.push(`Missing section: ${section}.`);
    }
  }

  const mentionsForbidden = FORBIDDEN_EXPLORATION_ACTIONS.some((entry) =>
    lower.includes(entry.action.split('/')[0].trim().toLowerCase()),
  );

  if (!mentionsForbidden && !lower.includes('forbidden')) {
    problems.push('The map never marks forbidden zones.');
  }

  return problems;
}

function referenceLines(input: ExplorationInput): string[] {
  const lines = [`Reference ${input.target}: ${input.reference.name}`];

  if (input.reference.url) {
    lines.push(`Source: ${input.reference.url}`);
  }

  for (const [key, value] of Object.entries(input.reference.facts ?? {})) {
    if (value) {
      lines.push(`${key}: ${value}`);
    }
  }

  return lines;
}

function desktopTitlebarDirective(osChrome: OsChrome = 'windows'): string[] {
  return [
    '',
    'Titlebar — the part desktop clones keep getting wrong:',
    ...TITLEBAR_SPEC.map((rule) => `- ${rule}`),
    ...osChromeDirective(osChrome).map((rule) => `- ${rule}`),
  ];
}

/**
 * The single message the chat is sent once exploration is done.
 *
 * Carries who mapped it (the brain, as [Explorer: provider / model]), the map
 * itself, and the mode contract — so the builder works from evidence, and a
 * later reader can see which mind drew the map.
 */
export function buildExploreMessage(input: ExplorationInput, map: string | null): string {
  const parts = [
    input.explorer ? `[Explorer: ${input.explorer.provider} / ${input.explorer.model}]` : '[Explorer: none]',
    '',
    modeLine(input.mode),
    '',
    ...referenceLines(input),
  ];

  if (input.target === 'desktop') {
    parts.push(...desktopTitlebarDirective(input.osChrome));
  }

  if (map?.trim()) {
    parts.push('', 'UI map drawn by the explorer — build from this, not from memory:', '```ui-map', map.trim(), '```');
  } else {
    parts.push('', 'No explorer map was drawn (no brain model was available). Work from the description above.');
  }

  if (input.detail?.trim()) {
    parts.push('', `Also: ${input.detail.trim()}`);
  }

  parts.push(
    '',
    input.mode === 'clone'
      ? 'Write every line yourself: same function and shape, original code, copy, icons and artwork. Start by naming the handful of things this program must do to be worth using, then build those. Use the Cude conventions (cudeArtifact / cudeAction, tokens.css, design-system.ts).'
      : 'Design it new: same information architecture and feel, original screens, words and artwork that could sit beside the reference without being mistaken for it. Say in one line what you kept and what you changed. Use the Cude conventions (cudeArtifact / cudeAction, tokens.css, design-system.ts).',
  );

  return parts.join('\n');
}

/** Validates an explore-reference request body without any I/O. Returns the error to answer with, if any. */
export function validateExploreRequest(body: unknown): { error?: string; status?: number } {
  const request = (body ?? {}) as {
    reference?: { name?: unknown; url?: unknown };
    target?: unknown;
    mode?: unknown;
    explorer?: { provider?: unknown; model?: unknown };
    screenshots?: Array<{ name?: unknown; mediaType?: unknown; data?: unknown }>;
  };

  if (typeof request.reference?.name !== 'string' || !request.reference.name.trim()) {
    return { error: 'A reference name is required.', status: 400 };
  }

  if (request.target !== 'web' && request.target !== 'desktop' && request.target !== 'extension') {
    return { error: 'A target of web, desktop or extension is required.', status: 400 };
  }

  if (request.mode !== 'clone' && request.mode !== 'inspire') {
    return { error: 'A mode of clone or inspire is required.', status: 400 };
  }

  if (typeof request.explorer?.provider !== 'string' || !request.explorer.provider.trim()) {
    return { error: 'An explorer (brain) provider is required.', status: 400 };
  }

  if (typeof request.explorer?.model !== 'string' || !request.explorer.model.trim()) {
    return { error: 'An explorer (brain) model is required.', status: 400 };
  }

  const screenshots = request.screenshots ?? [];

  if (!Array.isArray(screenshots)) {
    return { error: 'Screenshots must be a list.', status: 400 };
  }

  if (screenshots.length > MAX_SCREENSHOTS) {
    return { error: `At most ${MAX_SCREENSHOTS} screenshots are accepted.`, status: 400 };
  }

  for (const shot of screenshots) {
    if (!(ACCEPTED_SCREENSHOT_MEDIA as readonly string[]).includes(String(shot.mediaType))) {
      return { error: `Screenshot "${String(shot.name || 'unnamed')}" must be JPEG, PNG or WebP.`, status: 400 };
    }

    if (typeof shot.data !== 'string' || !shot.data) {
      return { error: `Screenshot "${String(shot.name || 'unnamed')}" has no data.`, status: 400 };
    }

    if (shot.data.length > MAX_SCREENSHOT_BYTES) {
      return { error: `Screenshot "${String(shot.name || 'unnamed')}" is larger than 4MB.`, status: 400 };
    }
  }

  return {};
}
