import { useEffect, useMemo, useState } from 'react';
import {
  createVirtualWorkspace,
  listVirtualFiles,
  writeVirtualFile,
  type VirtualWorkspace,
} from '~/lib/cude/native/workspace';

type NativeFile = { path: string; content: string };
type RunEvent = { id: string; title: string; detail: string; tone: 'ready' | 'working' | 'attention' };

const STARTER_FILES: NativeFile[] = [
  {
    path: 'README.md',
    content: '# Cude project\n\nDescribe the product in the build composer. Your files stay editable and exportable.\n',
  },
];

function storageKey(runId: string) {
  return `cude.native-files.${runId}`;
}

function loadWorkspace(runId: string): VirtualWorkspace {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(runId)) ?? 'null');

    if (Array.isArray(value)) {
      const files = value.filter(
        (item): item is NativeFile =>
          Boolean(item) && typeof item.path === 'string' && typeof item.content === 'string',
      );

      if (files.length === value.length) {
        return createVirtualWorkspace(files);
      }
    }
  } catch {
    // Start with a recoverable local project when storage is unavailable.
  }

  return createVirtualWorkspace(STARTER_FILES);
}

export function NativeBuildStudio({ runId, initialPrompt }: { runId: string; initialPrompt: string }) {
  const [workspace, setWorkspace] = useState<VirtualWorkspace>(() => loadWorkspace(runId));
  const files = useMemo(() => listVirtualFiles(workspace).map(({ path, content }) => ({ path, content })), [workspace]);
  const [selectedPath, setSelectedPath] = useState<string>(files[0]?.path ?? 'README.md');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434/v1');
  const [model, setModel] = useState('qwen2.5-coder:7b');
  const [apiKey, setApiKey] = useState('');
  const [showConnection, setShowConnection] = useState(false);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<RunEvent[]>([
    { id: 'ready', title: 'Native workspace ready', detail: 'No inherited runtime is required.', tone: 'ready' },
  ]);
  const selectedFile = useMemo(
    () => files.find((file) => file.path === selectedPath) ?? files[0],
    [files, selectedPath],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(runId), JSON.stringify(files));
    } catch {
      // Editing continues even if persistence is blocked.
    }
  }, [files, runId]);

  const updateSelected = (content: string) => {
    if (selectedFile) {
      setWorkspace((current) => writeVirtualFile(current, { path: selectedFile.path, content }));
    }
  };

  const runBuild = async () => {
    if (!prompt.trim() || running) {
      return;
    }

    setRunning(true);
    setEvents((current) => [
      { id: `run-${Date.now()}`, title: 'Model run started', detail: `${model} · ${baseUrl}`, tone: 'working' },
      ...current,
    ]);

    try {
      const response = await fetch('/api/native-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseUrl, model, apiKey, prompt, files }),
      });
      const result: unknown = await response.json();

      if (
        !response.ok ||
        !result ||
        typeof result !== 'object' ||
        !Array.isArray((result as { files?: unknown }).files)
      ) {
        const message =
          result && typeof result === 'object' && typeof (result as { error?: unknown }).error === 'string'
            ? (result as { error: string }).error
            : 'The model run did not return files.';
        throw new Error(message);
      }

      const build = result as { summary?: string; files: NativeFile[] };
      setWorkspace((current) => build.files.reduce(writeVirtualFile, current));

      if (build.files[0]) {
        setSelectedPath(build.files[0].path);
      }

      setEvents((current) => [
        {
          id: `complete-${Date.now()}`,
          title: `${build.files.length} file${build.files.length === 1 ? '' : 's'} applied`,
          detail: build.summary ?? 'Native build completed.',
          tone: 'ready',
        },
        ...current,
      ]);
    } catch (error) {
      setEvents((current) => [
        {
          id: `failed-${Date.now()}`,
          title: 'Build needs attention',
          detail: error instanceof Error ? error.message : 'Native build failed.',
          tone: 'attention',
        },
        ...current,
      ]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid h-full min-h-[720px] grid-cols-1 bg-cude-background-depth-1 lg:grid-cols-[360px_minmax(0,1fr)_280px]">
      <aside className="flex min-h-0 flex-col border-r border-cude-borderColor bg-cude-background-depth-2 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] text-cude-textTertiary">BUILD COMPOSER</p>
            <h2 className="mt-1 text-sm font-semibold">Build with your own model</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowConnection((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cude-borderColor px-2.5 py-2 text-[11px] font-semibold text-cude-textSecondary hover:text-cude-textPrimary"
            aria-label="Model connection"
          >
            <span className="i-ph:plugs-connected text-lg" aria-hidden="true" />
            <span>Model</span>
          </button>
        </div>

        {showConnection && (
          <div className="mt-4 grid gap-3 rounded-xl border border-cude-borderColor bg-cude-background-depth-1 p-3">
            <label className="grid gap-1 text-[11px] text-cude-textSecondary">
              OpenAI-compatible endpoint
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className="rounded-lg border border-cude-borderColor bg-transparent px-3 py-2 text-xs text-cude-textPrimary"
              />
            </label>
            <label className="grid gap-1 text-[11px] text-cude-textSecondary">
              Model
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="rounded-lg border border-cude-borderColor bg-transparent px-3 py-2 text-xs text-cude-textPrimary"
              />
            </label>
            <label className="grid gap-1 text-[11px] text-cude-textSecondary">
              API key (optional for local models)
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="off"
                className="rounded-lg border border-cude-borderColor bg-transparent px-3 py-2 text-xs text-cude-textPrimary"
              />
            </label>
            <p className="text-[10px] leading-relaxed text-cude-textTertiary">
              The key is sent with this request and is never written to project storage.
            </p>
          </div>
        )}

        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the product or change…"
          className="mt-4 min-h-52 flex-1 resize-none rounded-xl border border-cude-borderColor bg-cude-background-depth-1 p-3 text-sm leading-relaxed outline-none focus:border-cude-textTertiary"
        />
        <button
          type="button"
          onClick={runBuild}
          disabled={running || !prompt.trim()}
          className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-cude-textPrimary px-4 py-3 text-sm font-semibold text-cude-background-depth-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={running ? 'i-svg-spinners:90-ring-with-bg' : 'i-ph:play-fill'} />
          {running ? 'Building…' : 'Run native build'}
        </button>
      </aside>

      <main className="grid min-h-0 grid-rows-[48px_minmax(0,1fr)]">
        <header className="flex items-center justify-between border-b border-cude-borderColor px-4">
          <span className="truncate text-xs font-semibold">{selectedFile?.path ?? 'No file selected'}</span>
          <span className="rounded-full border border-emerald-500/30 px-2 py-1 text-[10px] font-semibold text-emerald-600">
            LOCAL OWNERSHIP
          </span>
        </header>
        {selectedFile ? (
          <textarea
            value={selectedFile.content}
            onChange={(event) => updateSelected(event.target.value)}
            spellCheck={false}
            className="h-full min-h-[640px] w-full resize-none bg-cude-background-depth-1 p-5 font-mono text-xs leading-6 outline-none"
            aria-label={`Edit ${selectedFile.path}`}
          />
        ) : (
          <div className="grid place-items-center text-sm text-cude-textSecondary">No files yet.</div>
        )}
      </main>

      <aside className="grid min-h-0 grid-rows-[minmax(240px,0.8fr)_minmax(280px,1.2fr)] border-l border-cude-borderColor bg-cude-background-depth-2">
        <section className="min-h-0 border-b border-cude-borderColor p-3">
          <p className="px-2 text-[10px] font-semibold tracking-[0.16em] text-cude-textTertiary">FILES</p>
          <div className="mt-2 max-h-full overflow-auto">
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedPath(file.path)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs ${file.path === selectedFile?.path ? 'bg-cude-background-depth-3' : 'hover:bg-cude-background-depth-3/70'}`}
              >
                <span className="i-ph:file-code text-cude-textSecondary" />
                <span className="truncate">{file.path}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="min-h-0 overflow-auto p-3">
          <p className="px-2 text-[10px] font-semibold tracking-[0.16em] text-cude-textTertiary">RUN EVIDENCE</p>
          <div className="mt-2 space-y-2">
            {events.map((event) => (
              <article
                key={event.id}
                className="rounded-xl border border-cude-borderColor bg-cude-background-depth-1 p-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${event.tone === 'ready' ? 'bg-emerald-400' : event.tone === 'working' ? 'bg-sky-400' : 'bg-amber-400'}`}
                  />
                  <h3 className="text-xs font-semibold">{event.title}</h3>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-cude-textSecondary">{event.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
