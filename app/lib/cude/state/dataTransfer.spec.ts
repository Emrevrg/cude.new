/**
 * Cude.new - data export and import behaviour.
 *
 * Two things carry weight here. An export must not contain a credential, even
 * one that got into settings by a route that should not exist. And an import of
 * the wrong file must refuse outright rather than restore the half of it that
 * happened to parse.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DataTransfer,
  readArchive,
  describeArchive,
  archiveFilename,
  ArchiveError,
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  EXPORTED_SETTINGS_KEYS,
} from './dataTransfer';
import { ConversationStore } from '~/lib/cude/persistence/conversationStore';
import { MemoryProjectStorage } from '~/lib/cude/persistence/storage';
import { MemorySettingsStorage } from './settings/storage';
import { SETTINGS_PREFIX } from './settings/storage';

let conversations: ConversationStore;
let settings: MemorySettingsStorage;
let transfer: DataTransfer;

beforeEach(() => {
  conversations = new ConversationStore(new MemoryProjectStorage());
  settings = new MemorySettingsStorage();
  transfer = new DataTransfer(conversations, settings);
});

async function seedConversation(id = 'c1', description = 'A build') {
  return conversations.save({
    id,
    urlId: id,
    description,
    messages: [{ id: 'm1', role: 'user', content: 'build me a thing' }],
  });
}

function seedSettings() {
  settings.set(`${SETTINGS_PREFIX}preferences`, JSON.stringify({ theme: 'dark' }));
  settings.set(`${SETTINGS_PREFIX}providers`, JSON.stringify({ anthropic: { enabled: true } }));
}

describe('export', () => {
  it('carries the conversations', async () => {
    await seedConversation();

    const archive = await transfer.export(['conversations']);

    expect(archive.conversations).toHaveLength(1);
    expect(archive.conversations?.[0].description).toBe('A build');
  });

  it('carries the settings it names, and nothing else', async () => {
    seedSettings();
    settings.set(`${SETTINGS_PREFIX}somethingElse`, JSON.stringify({ a: 1 }));

    const archive = await transfer.export(['settings']);

    expect(Object.keys(archive.settings ?? {}).sort()).toEqual(['preferences', 'providers']);
  });

  it('omits a section that was not asked for', async () => {
    await seedConversation();
    seedSettings();

    const archive = await transfer.export(['settings']);

    expect(archive.conversations).toBeUndefined();
    expect(archive.settings).toBeDefined();
  });

  it('stamps the format and version so an importer knows what it has', async () => {
    const archive = await transfer.export();

    expect(archive).toMatchObject({ format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION });
    expect(Date.parse(archive.exportedAt)).not.toBeNaN();
  });

  it('survives a corrupt setting rather than failing the whole export', async () => {
    settings.set(`${SETTINGS_PREFIX}preferences`, '{not json');
    settings.set(`${SETTINGS_PREFIX}providers`, JSON.stringify({ anthropic: { enabled: true } }));

    const archive = await transfer.export(['settings']);

    expect(Object.keys(archive.settings ?? {})).toEqual(['providers']);
  });

  it('strips a credential that reached settings by some other route', async () => {
    settings.set(
      `${SETTINGS_PREFIX}providers`,
      JSON.stringify({ anthropic: { enabled: true, apiKey: 'sk-ant-not-a-real-key-000000' } }),
    );

    const text = await transfer.exportToText(['settings']);

    expect(text).not.toContain('sk-ant');
    expect(text).not.toContain('apiKey');
  });

  it('serializes as readable JSON, because a person opens this file', async () => {
    await seedConversation();

    const text = await transfer.exportToText();

    expect(text).toContain('\n  ');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('names the file with a timestamp so two exports do not collide', () => {
    const name = archiveFilename(new Date('2026-03-04T05:06:07.008Z'));

    expect(name).toBe('cude-archive-2026-03-04T05-06-07-008Z.json');
  });
});

describe('reading an archive', () => {
  it('refuses a file that is not JSON', () => {
    expect(() => readArchive('not json at all')).toThrow(ArchiveError);
    expect(() => readArchive('not json at all')).toThrow(/not valid JSON/i);
  });

  it('refuses JSON that is not a Cude archive', () => {
    expect(() => readArchive(JSON.stringify({ chats: [] }))).toThrow(/not exported by Cude/i);
  });

  it('refuses an archive from a newer version rather than guessing', () => {
    const future = JSON.stringify({ format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION + 1 });

    expect(() => readArchive(future)).toThrow(/newer version/i);
  });

  it('refuses conversations that are not a list', () => {
    const bad = JSON.stringify({ format: ARCHIVE_FORMAT, version: 1, conversations: { a: 1 } });

    expect(() => readArchive(bad)).toThrow(/not in a readable shape/i);
  });

  it('accepts an archive that carries only one section', () => {
    const archive = readArchive(JSON.stringify({ format: ARCHIVE_FORMAT, version: 1, settings: { preferences: {} } }));

    expect(describeArchive(archive)).toMatchObject({ sections: ['settings'], settings: 1 });
  });

  it('round-trips what was exported', async () => {
    await seedConversation();
    seedSettings();

    const archive = readArchive(await transfer.exportToText());

    expect(describeArchive(archive)).toMatchObject({ conversations: 1, settings: 2 });
  });
});

describe('import', () => {
  it('restores conversations into an empty store', async () => {
    await seedConversation('c1', 'First');

    const archive = await transfer.export(['conversations']);

    const fresh = new DataTransfer(new ConversationStore(new MemoryProjectStorage()), new MemorySettingsStorage());
    const result = await fresh.import(archive);

    expect(result.conversations).toBe(1);
  });

  it('adds to existing conversations rather than replacing them', async () => {
    await seedConversation('c1', 'Imported');

    const archive = await transfer.export(['conversations']);

    const store = new ConversationStore(new MemoryProjectStorage());
    await store.save({ id: 'c2', urlId: 'c2', description: 'Work done since', messages: [] });

    await new DataTransfer(store, new MemorySettingsStorage()).import(archive);

    const all = await store.list();

    expect(all.map((item) => item.id).sort()).toEqual(['c1', 'c2']);
  });

  it('skips a conversation with no messages array rather than storing a broken one', async () => {
    const archive = readArchive(
      JSON.stringify({
        format: ARCHIVE_FORMAT,
        version: 1,
        conversations: [{ id: 'ok', urlId: 'ok', messages: [] }, { id: 'broken' }],
      }),
    );

    const result = await transfer.import(archive);

    expect(result.conversations).toBe(1);
    expect(result.skipped).toEqual(['conversation broken']);
  });

  it('applies settings it recognises', async () => {
    seedSettings();

    const archive = await transfer.export(['settings']);

    const target = new MemorySettingsStorage();
    await new DataTransfer(new ConversationStore(new MemoryProjectStorage()), target).import(archive);

    expect(JSON.parse(target.get(`${SETTINGS_PREFIX}preferences`)!)).toEqual({ theme: 'dark' });
  });

  it('refuses to store a setting Cude does not own', async () => {
    const archive = readArchive(
      JSON.stringify({ format: ARCHIVE_FORMAT, version: 1, settings: { preferences: {}, injected: { evil: true } } }),
    );

    const result = await transfer.import(archive);

    expect(result.settings).toBe(1);
    expect(result.skipped).toEqual(['setting injected']);
    expect(settings.get(`${SETTINGS_PREFIX}injected`)).toBeNull();
  });

  it('restores only the section asked for', async () => {
    await seedConversation();
    seedSettings();

    const archive = await transfer.export();

    const target = new MemorySettingsStorage();
    const result = await new DataTransfer(new ConversationStore(new MemoryProjectStorage()), target).import(archive, [
      'settings',
    ]);

    expect(result).toMatchObject({ conversations: 0, settings: 2 });
  });
});

describe('clearing', () => {
  it('deletes every conversation and says how many', async () => {
    await seedConversation('c1');
    await seedConversation('c2');

    expect(await transfer.clearConversations()).toBe(2);
    expect(await conversations.list()).toHaveLength(0);
  });

  it('resets only the settings it owns', async () => {
    seedSettings();
    settings.set(`${SETTINGS_PREFIX}notOurs`, '1');

    expect(transfer.resetSettings()).toBe(2);
    expect(settings.get(`${SETTINGS_PREFIX}preferences`)).toBeNull();
    expect(settings.get(`${SETTINGS_PREFIX}notOurs`)).toBe('1');
  });

  it('counts only what was actually there', () => {
    expect(transfer.resetSettings()).toBe(0);
  });
});

describe('the exported key list', () => {
  it('names each key once', () => {
    expect(new Set(EXPORTED_SETTINGS_KEYS).size).toBe(EXPORTED_SETTINGS_KEYS.length);
  });
});
