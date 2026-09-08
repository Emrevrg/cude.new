import { describe, it, expect } from 'vitest';
import {
  FORBIDDEN_EXPLORATION_ACTIONS,
  MIN_MAP_CHARS,
  SAFE_EXPLORATION_RULES,
  TITLEBAR_SPEC,
  buildExploreMessage,
  buildExplorerSystem,
  buildExplorerUser,
  osChromeDirective,
  parseUiMap,
  requiredMapSections,
  validateExploreRequest,
  validateUiMap,
} from './explore';
import type { ExplorationInput } from './explore';

const input = (overrides: Partial<ExplorationInput> = {}): ExplorationInput => ({
  mode: 'clone',
  target: 'desktop',
  reference: { name: 'Claude' },
  explorer: { provider: 'OpenRouter', model: 'x-ai/grok-4' },
  ...overrides,
});

describe('the safe exploration policy', () => {
  it('forbids signing out, deleting, paying, quitting and posting', () => {
    const joined = FORBIDDEN_EXPLORATION_ACTIONS.map((entry) => entry.action).join(' ');

    for (const word of ['Sign out', 'Delete', 'Pay', 'Quit', 'Publish', 'passwords']) {
      expect(joined).toContain(word);
    }
  });

  it('explores reversibly and reads forms without submitting', () => {
    const joined = SAFE_EXPLORATION_RULES.join(' ');
    expect(joined).toContain('reversible');
    expect(joined).toContain('never press the submit button');
  });
});

describe('the desktop titlebar contract', () => {
  it('pins the strip as row zero with measured height and working controls', () => {
    const joined = TITLEBAR_SPEC.join(' ');
    expect(joined).toContain('Row zero');
    expect(joined).toContain('Exact height');
    expect(joined).toContain('minimize, maximize/restore, close');
  });

  it('is required in desktop maps and nowhere else', () => {
    expect(requiredMapSections('desktop')).toContain('Titlebar');
    expect(requiredMapSections('web')).not.toContain('Titlebar');
    expect(requiredMapSections('extension')).not.toContain('Titlebar');
  });

  it('names the OS chrome to build, defaulting to Windows', () => {
    expect(osChromeDirective('macos').join(' ')).toContain('traffic lights');
    expect(osChromeDirective('linux').join(' ')).toContain('Linux');

    const longEnough = ['# Overview', 'x'.repeat(500)].join('\n');
    expect(buildExploreMessage(input(), longEnough)).toContain('Windows 11');
    expect(buildExploreMessage(input({ osChrome: 'macos' }), longEnough)).toContain('macOS');
  });
});

describe('the explorer brief', () => {
  it('tells clone and inspire apart', () => {
    expect(buildExplorerSystem('clone')).toContain('MODE: CLONE');
    expect(buildExplorerSystem('inspire')).toContain('MODE: GET INSPIRED');
  });

  it('names the reference and the required sections', () => {
    const user = buildExplorerUser(input(), 2);
    expect(user).toContain('Claude');
    expect(user).toContain('2 screenshot(s)');
    expect(user).toContain('Titlebar');
  });

  it('says when there are no screenshots', () => {
    expect(buildExplorerUser(input(), 0)).toContain('No screenshots were attached');
  });
});

describe('reading the brain answer', () => {
  it('pulls the ui-map block out', () => {
    const { map, fenced } = parseUiMap('thinking…\n```ui-map\n# Map\nstuff\n```\ntail');
    expect(fenced).toBe(true);
    expect(map).toBe('# Map\nstuff');
  });

  it('rejects a map too short to build from', () => {
    expect(validateUiMap('tiny', 'web').join(' ')).toContain(String(MIN_MAP_CHARS));
  });

  it('demands the sections and the forbidden zones', () => {
    const full = [
      '# Overview',
      'x'.repeat(500),
      '## Layout',
      '## Navigation and flows',
      '## Interactive inventory',
      '## Forbidden zones: sign out is forbidden',
    ].join('\n');
    expect(validateUiMap(full, 'web')).toEqual([]);
    expect(validateUiMap(full, 'desktop').join(' ')).toContain('Titlebar');
  });
});

describe('the message the chat is sent', () => {
  const map = [
    '# Overview',
    'x'.repeat(500),
    '## Layout',
    '## Navigation and flows',
    '## Interactive inventory',
    '## Forbidden zones',
  ].join('\n');

  it('names the brain that drew the map', () => {
    expect(buildExploreMessage(input(), map)).toContain('[Explorer: OpenRouter / x-ai/grok-4]');
  });

  it('clone recreates function and shape, inspire keeps feel with new expression', () => {
    expect(buildExploreMessage(input(), map)).toContain('original code');

    const inspire = buildExploreMessage(input({ mode: 'inspire' }), map);
    expect(inspire).toContain('never trace');
    expect(inspire).toContain('what you kept and what you changed');
  });

  it('desktop carries the titlebar directive, web does not', () => {
    expect(buildExploreMessage(input(), map)).toContain('Row zero');
    expect(buildExploreMessage(input({ target: 'web' }), map)).not.toContain('Row zero');
  });

  it('still sends honestly when no map was drawn', () => {
    expect(buildExploreMessage(input(), null)).toContain('No explorer map was drawn');
    expect(buildExploreMessage({ ...input(), explorer: undefined }, null)).toContain('[Explorer: none]');
  });
});

describe('request validation', () => {
  it('requires a reference, target, mode and brain', () => {
    expect(validateExploreRequest({}).status).toBe(400);
    expect(validateExploreRequest({ reference: { name: 'x' } }).status).toBe(400);

    const good = {
      reference: { name: 'Linear' },
      target: 'web',
      mode: 'clone',
      explorer: { provider: 'OpenRouter', model: 'm' },
    };
    expect(validateExploreRequest(good)).toEqual({});
  });

  it('caps screenshots at six usable images', () => {
    const good = {
      reference: { name: 'Linear' },
      target: 'web',
      mode: 'inspire',
      explorer: { provider: 'OpenRouter', model: 'm' },
    };
    const shots = Array.from({ length: 7 }, (_, i) => ({ name: `${i}`, mediaType: 'image/png', data: 'x' }));
    expect(validateExploreRequest({ ...good, screenshots: shots }).status).toBe(400);
    expect(
      validateExploreRequest({ ...good, screenshots: [{ name: 'a', mediaType: 'image/gif', data: 'x' }] }).status,
    ).toBe(400);
  });
});
