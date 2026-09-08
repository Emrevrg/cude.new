/**
 * Cude.new - taking your data out, and putting it back.
 *
 * One archive format covering conversations and settings, so an export is a
 * single file a person can keep, read, and hand back later. The inherited code
 * had three formats — "comprehensive", "legacy", and a settings-only shape —
 * with an importer that guessed between them.
 *
 * Every export passes through the same secret stripper the project manifest
 * uses. Settings hold no credentials by construction, but an export is a file
 * that leaves the machine, and "by construction" is worth checking on the way
 * out rather than trusting.
 */

import { stripSecrets } from '~/lib/cude/projectManifest';
import type { Conversation, ConversationStore } from '~/lib/cude/persistence/conversationStore';
import type { SettingsStorage } from './settings/types';
import { SETTINGS_PREFIX } from './settings/storage';
import { PREFERENCES_KEY } from './settings/preferences';
import { PROVIDERS_KEY } from './settings/providers';
import { TAB_CONFIGURATION_KEY } from './settings/tabConfiguration';
import { LAYOUT_KEY } from './settings/workspaceLayout';
import { cudeEventLog } from './eventLog';

export const ARCHIVE_FORMAT = 'cude.archive';
export const ARCHIVE_VERSION = 1;

export type ArchiveSection = 'conversations' | 'settings';

export const ARCHIVE_SECTIONS: ArchiveSection[] = ['conversations', 'settings'];

/**
 * The settings an archive carries, named explicitly.
 *
 * Enumerated rather than scraped from storage: an export should contain what it
 * says it contains, and a future key that holds something private should have
 * to be added here deliberately.
 */
export const EXPORTED_SETTINGS_KEYS = [PREFERENCES_KEY, PROVIDERS_KEY, TAB_CONFIGURATION_KEY, LAYOUT_KEY] as const;

export interface CudeArchive {
  format: typeof ARCHIVE_FORMAT;
  version: number;
  exportedAt: string;
  conversations?: Conversation[];
  settings?: Record<string, unknown>;
}

export interface ArchiveContents {
  sections: ArchiveSection[];
  conversations: number;
  settings: number;
}

export interface RestoreResult {
  conversations: number;
  settings: number;
  skipped: string[];
}

export class ArchiveError extends Error {}

/** What an archive holds, without restoring any of it. */
export function describeArchive(archive: CudeArchive): ArchiveContents {
  const sections: ArchiveSection[] = [];

  if (archive.conversations) {
    sections.push('conversations');
  }

  if (archive.settings) {
    sections.push('settings');
  }

  return {
    sections,
    conversations: archive.conversations?.length ?? 0,
    settings: Object.keys(archive.settings ?? {}).length,
  };
}

/**
 * Parse a file's text into an archive.
 *
 * Rejects anything it does not recognise rather than importing half of it: a
 * partial restore of the wrong file is worse than a clear refusal.
 */
export function readArchive(text: string): CudeArchive {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ArchiveError('That file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ArchiveError('That file does not contain a Cude archive.');
  }

  const candidate = parsed as Partial<CudeArchive>;

  if (candidate.format !== ARCHIVE_FORMAT) {
    throw new ArchiveError('That file was not exported by Cude.');
  }

  if (typeof candidate.version !== 'number' || candidate.version > ARCHIVE_VERSION) {
    throw new ArchiveError(`That archive was made by a newer version of Cude (format ${candidate.version}).`);
  }

  if (candidate.conversations !== undefined && !Array.isArray(candidate.conversations)) {
    throw new ArchiveError('The conversations in that archive are not in a readable shape.');
  }

  if (candidate.settings !== undefined && (typeof candidate.settings !== 'object' || candidate.settings === null)) {
    throw new ArchiveError('The settings in that archive are not in a readable shape.');
  }

  return {
    format: ARCHIVE_FORMAT,
    version: candidate.version,
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : new Date().toISOString(),
    conversations: candidate.conversations as Conversation[] | undefined,
    settings: candidate.settings as Record<string, unknown> | undefined,
  };
}

/** Filename for an export, stamped so two exports never collide. */
export function archiveFilename(at: Date = new Date()): string {
  return `cude-archive-${at.toISOString().replace(/[:.]/g, '-')}.json`;
}

export class DataTransfer {
  constructor(
    private readonly _conversations: ConversationStore,
    private readonly _settings: SettingsStorage,
  ) {}

  /** Build an archive of the requested sections. */
  async export(sections: ArchiveSection[] = ARCHIVE_SECTIONS): Promise<CudeArchive> {
    const archive: CudeArchive = {
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      exportedAt: new Date().toISOString(),
    };

    if (sections.includes('conversations')) {
      archive.conversations = await this._conversations.list();
    }

    if (sections.includes('settings')) {
      const settings: Record<string, unknown> = {};

      for (const key of EXPORTED_SETTINGS_KEYS) {
        const raw = this._settings.get(`${SETTINGS_PREFIX}${key}`);

        if (raw === null) {
          continue;
        }

        try {
          settings[key] = JSON.parse(raw);
        } catch {
          // A corrupt setting is not worth failing an export over.
        }
      }

      archive.settings = settings;
    }

    // Checked on the way out, not assumed.
    return stripSecrets(archive);
  }

  /** Serialize an archive for download. */
  async exportToText(sections?: ArchiveSection[]): Promise<string> {
    return `${JSON.stringify(await this.export(sections), null, 2)}\n`;
  }

  /**
   * Restore an archive.
   *
   * Conversations are added, not replaced: importing an archive into an account
   * that has since done other work should not erase that work. Settings are
   * overwritten, because a half-applied settings file is a confusing state.
   */
  async import(archive: CudeArchive, sections: ArchiveSection[] = ARCHIVE_SECTIONS): Promise<RestoreResult> {
    const result: RestoreResult = { conversations: 0, settings: 0, skipped: [] };

    if (sections.includes('conversations') && archive.conversations) {
      for (const conversation of archive.conversations) {
        if (!conversation?.id || !Array.isArray(conversation.messages)) {
          result.skipped.push(`conversation ${conversation?.id ?? '(unnamed)'}`);
          continue;
        }

        await this._conversations.save(conversation);
        result.conversations += 1;
      }
    }

    if (sections.includes('settings') && archive.settings) {
      for (const [key, value] of Object.entries(archive.settings)) {
        if (!(EXPORTED_SETTINGS_KEYS as readonly string[]).includes(key)) {
          // An unknown key is data Cude does not own. Say so rather than store it.
          result.skipped.push(`setting ${key}`);
          continue;
        }

        this._settings.set(`${SETTINGS_PREFIX}${key}`, JSON.stringify(value));
        result.settings += 1;
      }
    }

    cudeEventLog.append({
      level: 'success',
      source: 'persistence',
      message: `Imported ${result.conversations} conversations and ${result.settings} settings`,
    });

    return result;
  }

  /** Delete every conversation. Returns how many went. */
  async clearConversations(): Promise<number> {
    const removed = await this._conversations.deleteAll();

    cudeEventLog.append({ level: 'info', source: 'persistence', message: `Deleted ${removed} conversations` });

    return removed;
  }

  /** Return every setting to its default. Returns how many were cleared. */
  resetSettings(): number {
    let cleared = 0;

    for (const key of EXPORTED_SETTINGS_KEYS) {
      const storageKey = `${SETTINGS_PREFIX}${key}`;

      if (this._settings.get(storageKey) !== null) {
        this._settings.remove(storageKey);
        cleared += 1;
      }
    }

    cudeEventLog.append({ level: 'info', source: 'persistence', message: `Reset ${cleared} settings` });

    return cleared;
  }
}
