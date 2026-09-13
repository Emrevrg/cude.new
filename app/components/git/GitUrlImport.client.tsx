import { useSearchParams } from '@remix-run/react';
import { useEffect, useState } from 'react';

type ImportedFile = { path: string; content: string };

export function GitUrlImport() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('Preparing a native import…');
  const [error, setError] = useState<string>();

  useEffect(() => {
    const repoUrl = searchParams.get('url');

    if (!repoUrl) {
      setError('Add a GitHub repository URL to import.');

      return () => undefined;
    }

    const controller = new AbortController();

    async function importRepository() {
      try {
        setStatus('Reading repository files…');

        const response = await fetch('/api/native-git-import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ repoUrl }),
          signal: controller.signal,
        });
        const result: unknown = await response.json();

        if (!response.ok || !isImportResult(result)) {
          const message =
            isRecord(result) && typeof result.error === 'string' ? result.error : 'Repository import failed.';
          throw new Error(message);
        }

        const runId = `run-${crypto.randomUUID()}`;
        window.localStorage.setItem(`cude.native-files.${runId}`, JSON.stringify(result.files));
        setStatus(`${result.files.length} files imported. Opening the native workspace…`);
        window.location.assign(`/chat/${runId}?prompt=${encodeURIComponent(`Continue building ${result.name}`)}`);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Repository import failed.');
        }
      }
    }

    void importRepository();

    return () => controller.abort();
  }, [searchParams]);

  return (
    <main className="relative z-10 grid flex-1 place-items-center px-6 py-16">
      <section className="w-full max-w-xl rounded-3xl border border-cude-borderColor bg-cude-background-depth-2 p-8 shadow-xl">
        <p className="text-[10px] font-semibold tracking-[0.18em] text-cude-textTertiary">NATIVE GIT IMPORT</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Bring the code. Keep ownership.</h1>
        <p className="mt-3 text-sm leading-relaxed text-cude-textSecondary">
          Cude imports text files directly into its portable workspace. No inherited browser runtime is started.
        </p>
        <div className="mt-7 rounded-2xl border border-cude-borderColor bg-cude-background-depth-1 p-4">
          <div className="flex items-center gap-3">
            <span
              className={
                error ? 'i-ph:warning-circle text-xl text-amber-500' : 'i-svg-spinners:90-ring-with-bg text-xl'
              }
              aria-hidden="true"
            />
            <p className="text-sm font-medium">{error ?? status}</p>
          </div>
        </div>
        {error && (
          <a
            href="/"
            className="mt-5 inline-flex rounded-xl bg-cude-textPrimary px-4 py-2.5 text-sm font-semibold text-cude-background-depth-1"
          >
            Return home
          </a>
        )}
      </section>
    </main>
  );
}

function isImportResult(value: unknown): value is { name: string; files: ImportedFile[] } {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    Array.isArray(value.files) &&
    value.files.every((file) => isRecord(file) && typeof file.path === 'string' && typeof file.content === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
