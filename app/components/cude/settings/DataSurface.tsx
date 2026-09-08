/**
 * Cude.new - your data.
 *
 * Export what Cude has stored, put an export back, or delete it. Three
 * questions, three sections. What it replaces was a tab, a thousand-line hook
 * and a service class, spread across ten operations that were mostly the same
 * two.
 *
 * An import shows what is in the file before restoring it. The inherited
 * version applied the file on selection and reported afterwards, which is the
 * wrong order for an operation that writes over settings.
 */

import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, Download, Loader2, Upload } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import {
  DataTransfer,
  readArchive,
  describeArchive,
  archiveFilename,
  ARCHIVE_SECTIONS,
  type ArchiveSection,
  type CudeArchive,
} from '~/lib/cude/state/dataTransfer';
import { getConversationStore } from '~/lib/cude/state/useConversationHistory';
import { createSettingsStorage } from '~/lib/cude/state/settings/storage';

const SECTION_LABEL: Record<ArchiveSection, string> = {
  conversations: 'Conversations',
  settings: 'Settings',
};

const SECTION_DETAIL: Record<ArchiveSection, string> = {
  conversations: 'Everything you have built with Cude, and the exchanges that built it.',
  settings: 'Preferences, providers, and how the workspace is arranged. Never any credentials.',
};

const BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const PRIMARY = `${BUTTON} bg-cude-button-primary-background text-cude-button-primary-text hover:bg-cude-button-primary-backgroundHover`;

const SECONDARY = `${BUTTON} border border-cude-borderColor text-cude-textSecondary hover:text-cude-textPrimary`;

const DANGER = `${BUTTON} border border-red-500/40 text-cude-item-contentDanger hover:bg-cude-item-contentDanger/5`;

function transfer(): DataTransfer {
  return new DataTransfer(getConversationStore(), createSettingsStorage());
}

function SectionToggle({
  section,
  checked,
  onChange,
}: {
  section: ArchiveSection;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-cude-borderColor bg-cude-background-depth-2 px-3 py-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-cude-textPrimary"
      />

      <span className="min-w-0">
        <span className="block text-sm text-cude-textPrimary">{SECTION_LABEL[section]}</span>
        <span className="block text-[11px] text-cude-textTertiary">{SECTION_DETAIL[section]}</span>
      </span>
    </label>
  );
}

export function DataSurface() {
  const [selected, setSelected] = useState<ArchiveSection[]>([...ARCHIVE_SECTIONS]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<CudeArchive | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const toggle = useCallback((section: ArchiveSection, on: boolean) => {
    setSelected((current) => (on ? [...current, section] : current.filter((item) => item !== section)));
  }, []);

  const run = useCallback(async (name: string, work: () => Promise<string>) => {
    setBusy(name);
    setMessage(null);

    try {
      setMessage({ tone: 'ok', text: await work() });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }, []);

  const download = useCallback(
    () =>
      run('export', async () => {
        const text = await transfer().exportToText(selected);
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = archiveFilename();
        link.click();
        URL.revokeObjectURL(url);

        return 'Exported. Check your downloads.';
      }),
    [run, selected],
  );

  const readFile = useCallback(
    (file: File) =>
      run('read', async () => {
        const archive = readArchive(await file.text());
        setPending(archive);

        const contents = describeArchive(archive);

        return `Ready to restore ${contents.conversations} conversations and ${contents.settings} settings.`;
      }),
    [run],
  );

  const restore = useCallback(
    () =>
      run('import', async () => {
        if (!pending) {
          throw new Error('Choose a file first.');
        }

        const result = await transfer().import(pending, selected);
        setPending(null);

        const skipped = result.skipped.length ? ` ${result.skipped.length} entries were skipped.` : '';

        return `Restored ${result.conversations} conversations and ${result.settings} settings.${skipped}`;
      }),
    [run, pending, selected],
  );

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h3 className="text-sm font-medium text-cude-textPrimary">What to include</h3>
        <p className="mt-1 text-[11px] text-cude-textTertiary">Applies to both exporting and restoring.</p>

        <div className="mt-3 flex flex-col gap-2">
          {ARCHIVE_SECTIONS.map((section) => (
            <SectionToggle
              key={section}
              section={section}
              checked={selected.includes(section)}
              onChange={(on) => toggle(section, on)}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-cude-textPrimary">Export</h3>
        <p className="mt-1 text-[11px] text-cude-textTertiary">
          One JSON file you can keep and read. Credentials are stripped on the way out.
        </p>

        <button
          onClick={download}
          disabled={busy !== null || selected.length === 0}
          className={classNames('mt-3', PRIMARY)}
        >
          {busy === 'export' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export
        </button>
      </section>

      <section>
        <h3 className="text-sm font-medium text-cude-textPrimary">Restore</h3>
        <p className="mt-1 text-[11px] text-cude-textTertiary">
          Conversations are added to what you have. Settings are overwritten.
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              readFile(file);
            }

            event.target.value = '';
          }}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => fileInput.current?.click()} disabled={busy !== null} className={SECONDARY}>
            <Upload className="h-3.5 w-3.5" />
            Choose a file
          </button>

          {pending && (
            <button onClick={restore} disabled={busy !== null || selected.length === 0} className={PRIMARY}>
              {busy === 'import' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Restore it
            </button>
          )}
        </div>
      </section>

      <section>
        <h3 className="flex items-center gap-2 text-sm font-medium text-cude-textPrimary">
          <AlertTriangle className="h-4 w-4 text-cude-item-contentDanger" />
          Delete
        </h3>
        <p className="mt-1 text-[11px] text-cude-textTertiary">
          There is no undo. Export first if you might want any of it back.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={busy !== null}
            className={DANGER}
            onClick={() =>
              run('conversations', async () => {
                const removed = await transfer().clearConversations();

                return `Deleted ${removed} conversations.`;
              })
            }
          >
            Delete all conversations
          </button>

          <button
            disabled={busy !== null}
            className={DANGER}
            onClick={() =>
              run('settings', async () => {
                const cleared = transfer().resetSettings();

                return `Reset ${cleared} settings to their defaults.`;
              })
            }
          >
            Reset all settings
          </button>
        </div>
      </section>

      {message && (
        <p
          role="status"
          className={classNames(
            'text-sm',
            message.tone === 'ok' ? 'text-cude-icon-success' : 'text-cude-item-contentDanger',
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
