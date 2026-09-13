import { useMemo, useState } from 'react';

export type CudeWorkspaceStage = 'brief' | 'architecture' | 'design' | 'build' | 'evidence';

export type CudeWorkspaceFile = {
  path: string;
  status?: 'changed' | 'new' | 'synced';
};

export type CudeWorkspaceActivity = {
  id: string;
  title: string;
  detail: string;
  at: string;
  tone?: 'ready' | 'working' | 'attention';
};

export interface CudeNativeWorkspaceProps {
  projectName?: string;
  stage?: CudeWorkspaceStage;
  files?: CudeWorkspaceFile[];
  activity?: CudeWorkspaceActivity[];
  onStageChange?: (stage: CudeWorkspaceStage) => void;
  canSelectStage?: (stage: CudeWorkspaceStage) => boolean;
  onOpenFile?: (file: CudeWorkspaceFile) => void;
  onRunCheck?: () => void;
  onPrimaryAction?: (stage: CudeWorkspaceStage) => void;
  primaryActionLabel?: string;
  className?: string;
}

const STAGES: Array<{ id: CudeWorkspaceStage; label: string; description: string; icon: string }> = [
  { id: 'brief', label: 'Brief', description: 'Define the outcome', icon: 'i-ph:note-pencil' },
  { id: 'architecture', label: 'Architecture', description: 'Choose the shape', icon: 'i-ph:tree-structure' },
  { id: 'design', label: 'Design', description: 'Review the experience', icon: 'i-ph:palette' },
  { id: 'build', label: 'Build', description: 'Make the change', icon: 'i-ph:hammer' },
  { id: 'evidence', label: 'Evidence', description: 'Prove it works', icon: 'i-ph:seal-check' },
];

const DEFAULT_FILES: CudeWorkspaceFile[] = [
  { path: 'app/routes/_index.tsx', status: 'changed' },
  { path: 'app/components/Checkout.tsx', status: 'new' },
  { path: 'app/lib/pricing.ts', status: 'synced' },
];

const DEFAULT_ACTIVITY: CudeWorkspaceActivity[] = [
  {
    id: 'brief',
    title: 'Outcome captured',
    detail: 'A faster, clearer checkout for returning customers.',
    at: 'Now',
    tone: 'ready',
  },
  {
    id: 'architecture',
    title: 'Decision waiting',
    detail: 'Choose whether cart state belongs in the URL or session.',
    at: '2 min ago',
    tone: 'attention',
  },
  {
    id: 'build',
    title: 'Build surface prepared',
    detail: '3 files are ready for review and change.',
    at: '4 min ago',
    tone: 'working',
  },
];

const STAGE_COPY: Record<CudeWorkspaceStage, { heading: string; summary: string; action: string }> = {
  brief: {
    heading: 'Give the run a direction.',
    summary: 'Capture the customer outcome and constraints before files move.',
    action: 'Refine brief',
  },
  architecture: {
    heading: 'Make the consequential choice visible.',
    summary: 'Compare approaches, risks and reversibility before implementation starts.',
    action: 'Review decision',
  },
  design: {
    heading: 'Put the experience under a lens.',
    summary: 'Inspect hierarchy, states and accessibility as part of the product—not decoration.',
    action: 'Open review',
  },
  build: {
    heading: 'Build with a readable trail.',
    summary: 'Every proposed change stays inspectable, editable and yours to keep.',
    action: 'Start build',
  },
  evidence: {
    heading: 'Leave with proof, not promises.',
    summary: 'Collect checks, decisions and release notes in one handoff-ready record.',
    action: 'Run checks',
  },
};

function fileName(path: string) {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/**
 * An intentionally standalone Cude workspace shell. Runtime, model, file system
 * and deploy implementations can be attached via its small prop API; this
 * component itself owns no provider or inherited workbench state.
 */
export function CudeNativeWorkspace({
  projectName = 'Untitled product run',
  stage: controlledStage,
  files = DEFAULT_FILES,
  activity = DEFAULT_ACTIVITY,
  onStageChange,
  canSelectStage,
  onOpenFile,
  onRunCheck,
  onPrimaryAction,
  primaryActionLabel,
  className = '',
}: CudeNativeWorkspaceProps) {
  const [localStage, setLocalStage] = useState<CudeWorkspaceStage>('brief');
  const [activeRail, setActiveRail] = useState<'run' | 'files' | 'activity'>('run');
  const [selectedPath, setSelectedPath] = useState(files[0]?.path);
  const stage = controlledStage ?? localStage;
  const stageCopy = STAGE_COPY[stage];
  const completedStages = STAGES.findIndex((item) => item.id === stage);
  const selectedFile = useMemo(
    () => files.find((file) => file.path === selectedPath) ?? files[0],
    [files, selectedPath],
  );

  const selectStage = (nextStage: CudeWorkspaceStage) => {
    if (!controlledStage) {
      setLocalStage(nextStage);
    }

    onStageChange?.(nextStage);
  };

  const selectFile = (file: CudeWorkspaceFile) => {
    setSelectedPath(file.path);
    onOpenFile?.(file);
  };

  return (
    <section
      className={`min-h-[680px] overflow-hidden rounded-2xl border border-cude-borderColor bg-cude-background-depth-1 text-cude-textPrimary shadow-2xl shadow-black/10 ${className}`}
      aria-label={`${projectName} workspace`}
    >
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-cude-borderColor bg-cude-background-depth-2 px-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-cude-textTertiary">CUDE PRODUCT RUN</p>
          <h1 className="truncate text-sm font-semibold sm:text-base">{projectName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-cude-borderColor px-2.5 py-1 text-[11px] text-cude-textSecondary sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Local control
          </span>
          <button
            type="button"
            className="rounded-lg border border-cude-borderColor p-2 text-cude-textSecondary hover:bg-cude-background-depth-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cude-textPrimary"
            aria-label="Workspace settings"
          >
            <span className="i-ph:sliders-horizontal text-base" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="grid min-h-[616px] grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)]">
        <nav
          className="flex flex-col items-center gap-2 border-r border-cude-borderColor bg-cude-background-depth-2 py-3"
          aria-label="Workspace surfaces"
        >
          {(
            [
              ['run', 'i-ph:circles-three-plus', 'Product run'],
              ['files', 'i-ph:files', 'Files'],
              ['activity', 'i-ph:clock-counter-clockwise', 'Activity'],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveRail(id)}
              className={`grid h-9 w-9 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cude-textPrimary ${activeRail === id ? 'bg-cude-textPrimary text-cude-background-depth-1' : 'text-cude-textSecondary hover:bg-cude-background-depth-3 hover:text-cude-textPrimary'}`}
              aria-label={label}
              aria-pressed={activeRail === id}
            >
              <span className={`${icon} text-lg`} aria-hidden="true" />
            </button>
          ))}
          <span
            className="mt-auto mb-1 grid h-8 w-8 place-items-center rounded-full border border-cude-borderColor text-[10px] font-bold text-cude-textSecondary"
            aria-label="Current user"
          >
            E
          </span>
        </nav>

        <div className="min-w-0">
          {activeRail === 'run' && (
            <div className="grid min-h-[616px] lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.7fr)_minmax(250px,0.9fr)]">
              <aside
                className="border-b border-cude-borderColor bg-cude-background-depth-2 p-4 lg:border-b-0 lg:border-r"
                aria-label="Run stages"
              >
                <p className="mb-3 text-[10px] font-semibold tracking-[0.16em] text-cude-textTertiary">RUN MAP</p>
                <ol className="grid gap-1 sm:grid-cols-5 lg:grid-cols-1">
                  {STAGES.map((item, index) => {
                    const active = item.id === stage;
                    const done = index < completedStages;
                    const selectable = canSelectStage?.(item.id) ?? true;

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => selectStage(item.id)}
                          disabled={!selectable}
                          aria-current={active ? 'step' : undefined}
                          className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cude-textPrimary disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'bg-cude-background-depth-3' : selectable ? 'hover:bg-cude-background-depth-3/70' : ''}`}
                        >
                          <span
                            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs ${active ? 'border-cude-textPrimary bg-cude-textPrimary text-cude-background-depth-1' : done ? 'border-emerald-400/60 text-emerald-400' : 'border-cude-borderColor text-cude-textTertiary'}`}
                          >
                            <span className={done && !active ? 'i-ph:check' : item.icon} aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold">{item.label}</span>
                            <span className="hidden truncate text-[11px] text-cude-textSecondary lg:block">
                              {item.description}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </aside>

              <main className="flex min-w-0 flex-col p-5 sm:p-7">
                <div className="flex items-center justify-between gap-4">
                  <span className="rounded-full border border-cude-borderColor px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-cude-textSecondary">
                    0{completedStages + 1} / 05
                  </span>
                  <span className="text-xs text-cude-textTertiary">Autosaved locally</span>
                </div>
                <div className="my-auto max-w-xl py-12">
                  <p className="text-xs font-medium text-cude-textSecondary">
                    {STAGES.find((item) => item.id === stage)?.label.toUpperCase()}
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{stageCopy.heading}</h2>
                  <p className="mt-4 text-sm leading-relaxed text-cude-textSecondary sm:text-base">
                    {stageCopy.summary}
                  </p>
                  <div className="mt-8 rounded-xl border border-cude-borderColor bg-cude-background-depth-2 p-4">
                    <div className="flex gap-3">
                      <span className="i-ph:sparkle mt-0.5 text-lg text-cude-textSecondary" aria-hidden="true" />
                      <div>
                        <h3 className="text-sm font-semibold">Cude keeps the reasoning attached.</h3>
                        <p className="mt-1 text-xs leading-relaxed text-cude-textSecondary">
                          You can change the model, edit the plan, export the files and keep the evidence. No black-box
                          handoff.
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (stage === 'evidence') {
                        onRunCheck?.();
                      }

                      onPrimaryAction?.(stage);
                    }}
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-cude-textPrimary px-4 py-2.5 text-sm font-semibold text-cude-background-depth-1 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cude-textPrimary focus-visible:ring-offset-2 focus-visible:ring-offset-cude-background-depth-1"
                  >
                    {primaryActionLabel ?? stageCopy.action} <span className="i-ph:arrow-right" aria-hidden="true" />
                  </button>
                </div>
              </main>

              <aside
                className="border-t border-cude-borderColor bg-cude-background-depth-2 p-4 lg:border-l lg:border-t-0"
                aria-label="Run context"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold tracking-[0.16em] text-cude-textTertiary">LIVE CONTEXT</p>
                  <span className="i-ph:radio text-sm text-emerald-400" aria-label="Run active" />
                </div>
                <div className="mt-4 space-y-3">
                  {activity.slice(0, 3).map((event) => (
                    <article key={event.id} className="rounded-lg border border-cude-borderColor p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-xs font-semibold">{event.title}</h3>
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${event.tone === 'attention' ? 'bg-amber-400' : event.tone === 'working' ? 'bg-sky-400' : 'bg-emerald-400'}`}
                        />
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-cude-textSecondary">{event.detail}</p>
                      <time className="mt-2 block text-[10px] text-cude-textTertiary">{event.at}</time>
                    </article>
                  ))}
                </div>
              </aside>
            </div>
          )}

          {activeRail === 'files' && (
            <main className="min-h-[616px] p-5 sm:p-7" aria-label="Project files">
              <p className="text-[10px] font-semibold tracking-[0.16em] text-cude-textTertiary">OWNED FILES</p>
              <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.5fr)]">
                <div className="rounded-xl border border-cude-borderColor bg-cude-background-depth-2 p-2">
                  {files.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => selectFile(file)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cude-textPrimary ${selectedFile?.path === file.path ? 'bg-cude-background-depth-3' : 'hover:bg-cude-background-depth-3/70'}`}
                    >
                      <span className="i-ph:file-code text-base text-cude-textSecondary" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{fileName(file.path)}</span>
                      {file.status && (
                        <span
                          className={`h-2 w-2 rounded-full ${file.status === 'changed' ? 'bg-amber-400' : file.status === 'new' ? 'bg-sky-400' : 'bg-emerald-400'}`}
                          aria-label={file.status}
                        />
                      )}
                    </button>
                  ))}
                </div>
                <section
                  className="rounded-xl border border-dashed border-cude-borderColor p-5"
                  aria-label="Selected file preview"
                >
                  <div className="flex items-center gap-2 text-cude-textSecondary">
                    <span className="i-ph:brackets-curly text-lg" aria-hidden="true" />
                    <span className="text-sm font-semibold">{selectedFile?.path ?? 'No file selected'}</span>
                  </div>
                  <p className="mt-5 text-sm leading-relaxed text-cude-textSecondary">
                    Attach your editor or runtime here. The workspace shell never hides the files behind the assistant.
                  </p>
                </section>
              </div>
            </main>
          )}

          {activeRail === 'activity' && (
            <main className="min-h-[616px] p-5 sm:p-7" aria-label="Run activity">
              <p className="text-[10px] font-semibold tracking-[0.16em] text-cude-textTertiary">AUDIT TRAIL</p>
              <ol className="mt-5 max-w-2xl border-l border-cude-borderColor pl-5">
                {activity.map((event) => (
                  <li key={event.id} className="relative pb-6 last:pb-0">
                    <span
                      className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-cude-background-depth-1 ${event.tone === 'attention' ? 'bg-amber-400' : event.tone === 'working' ? 'bg-sky-400' : 'bg-emerald-400'}`}
                    />
                    <h2 className="text-sm font-semibold">{event.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-cude-textSecondary">{event.detail}</p>
                    <time className="mt-1 block text-xs text-cude-textTertiary">{event.at}</time>
                  </li>
                ))}
              </ol>
            </main>
          )}
        </div>
      </div>
    </section>
  );
}
