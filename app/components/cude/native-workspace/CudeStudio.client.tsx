import { useSearchParams } from '@remix-run/react';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { CudeLogo } from '~/components/cude/CudeLogo';
import { createProductRun, productRunReducer, type ProductRunState } from '~/lib/cude/native/productRun';
import { loadProductRun, saveProductRun } from '~/lib/cude/native/productRunStorage';
import { NativeBuildStudio } from './NativeBuildStudio.client';
import { CudeNativeWorkspace, type CudeWorkspaceActivity, type CudeWorkspaceStage } from './CudeNativeWorkspace';

type StudioSurface = 'run' | 'build';

function workspaceStage(state: ProductRunState): CudeWorkspaceStage {
  if (state.stage === 'design-review') {
    return 'design';
  }

  if (state.stage === 'building') {
    return 'build';
  }

  if (state.stage === 'released') {
    return 'evidence';
  }

  return state.stage;
}

function projectTitle(prompt: string) {
  const compact = prompt.replace(/\s+/g, ' ').trim();

  if (!compact) {
    return 'Untitled product run';
  }

  return compact.length > 58 ? `${compact.slice(0, 57).trimEnd()}…` : compact;
}

export function CudeStudio({ runId }: { runId: string }) {
  const [searchParams] = useSearchParams();
  const prompt = searchParams.get('prompt') ?? '';
  const [sessionRunId] = useState(() =>
    runId === 'new' ? `run-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}` : runId,
  );
  const [surface, setSurface] = useState<StudioSurface>('run');
  const [run, dispatch] = useReducer(productRunReducer, sessionRunId, (id) =>
    typeof window === 'undefined' ? createProductRun(id) : loadProductRun(window.localStorage, id),
  );
  const stage = workspaceStage(run);

  useEffect(() => {
    saveProductRun(window.localStorage, run);
  }, [run]);

  const activity = useMemo<CudeWorkspaceActivity[]>(
    () => [
      {
        id: 'intent',
        title: prompt ? 'Intent captured' : 'Run ready',
        detail: prompt || 'Describe the outcome in the builder to begin.',
        at: 'Now',
        tone: 'ready',
      },
      {
        id: 'ownership',
        title: 'Ownership controls active',
        detail: 'Provider choice, files, decisions and export remain under your control.',
        at: 'This run',
        tone: 'ready',
      },
      {
        id: 'stage',
        title: `${stage[0].toUpperCase()}${stage.slice(1)} stage`,
        detail:
          stage === 'evidence' ? 'Run checks before release.' : 'The next decision remains explicit and editable.',
        at: 'Current',
        tone: stage === 'evidence' ? 'attention' : 'working',
      },
      ...run.events
        .slice(-2)
        .reverse()
        .map((event) => ({
          id: `event-${event.sequence}`,
          title: event.accepted ? event.action.replaceAll('_', ' ') : 'Transition blocked',
          detail: event.reason ?? `${event.from} → ${event.to}`,
          at: `Event ${event.sequence}`,
          tone: event.accepted ? ('ready' as const) : ('attention' as const),
        })),
    ],
    [prompt, run.events, stage],
  );

  const advanceRun = (current: CudeWorkspaceStage) => {
    switch (current) {
      case 'brief':
        dispatch({
          type: 'SUBMIT_BRIEF',
          brief: {
            outcome: prompt.trim() || 'Create a new product',
            audience: 'Defined during the build conversation',
            constraints: ['Decisions and evidence remain inspectable'],
          },
        });
        break;
      case 'architecture':
        dispatch({
          type: 'ACCEPT_ARCHITECTURE',
          architecture: {
            summary: 'Architecture accepted for implementation',
            targets: ['Selected in Cude architecture review'],
            tradeoffs: ['Recorded with the product run'],
          },
        });
        break;
      case 'design':
        dispatch({
          type: 'APPROVE_DESIGN',
          design: {
            summary: 'Design direction approved for the build',
            acceptanceCriteria: ['Hierarchy, states and accessibility remain reviewable'],
          },
        });
        break;
      case 'build':
      case 'evidence':
        setSurface('build');
        break;
    }
  };

  return (
    <div className="flex h-full min-h-screen w-full flex-col bg-cude-background-depth-1 text-cude-textPrimary">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-cude-borderColor px-4 sm:px-6">
        <a href="/" aria-label="Cude home">
          <CudeLogo height={25} />
        </a>
        <div
          className="flex rounded-xl border border-cude-borderColor bg-cude-background-depth-2 p-1"
          aria-label="Studio surface"
        >
          {(['run', 'build'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSurface(item)}
              aria-pressed={surface === item}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                surface === item
                  ? 'bg-cude-textPrimary text-cude-background-depth-1'
                  : 'text-cude-textSecondary hover:text-cude-textPrimary'
              }`}
            >
              {item === 'run' ? 'Product run' : 'Build studio'}
            </button>
          ))}
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-cude-textTertiary">RUN</p>
          <p className="max-w-48 truncate text-xs text-cude-textSecondary">{sessionRunId}</p>
        </div>
      </header>

      {surface === 'run' ? (
        <main className="flex-1 p-3 sm:p-5">
          <CudeNativeWorkspace
            projectName={projectTitle(prompt)}
            stage={stage}
            files={[]}
            activity={activity}
            onStageChange={() => undefined}
            canSelectStage={(candidate) => candidate === stage}
            onPrimaryAction={advanceRun}
            onRunCheck={() => setSurface('build')}
            primaryActionLabel={
              stage === 'build' ? 'Open build studio' : stage === 'evidence' ? 'Verify in build studio' : undefined
            }
            className="mx-auto max-w-[1600px]"
          />
        </main>
      ) : (
        <main className="min-h-0 flex-1" aria-label="Cude build studio">
          <NativeBuildStudio runId={sessionRunId} initialPrompt={prompt} />
        </main>
      )}
    </div>
  );
}
