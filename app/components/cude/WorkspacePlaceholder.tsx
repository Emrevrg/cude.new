/**
 * Cude.new - Workspace placeholder
 *
 * Shown in the editor before any project files exist. Rather than an empty
 * canvas, it reports what the engineering team has actually decided so far:
 * the targets, the stack chosen for each, and the stage currently running.
 *
 * Everything here reads real architecture and pipeline state. When no work has
 * started the component falls back to a plain invitation — it never invents
 * targets, stacks or progress.
 */

import { useStore } from '@nanostores/react';
import { architectureStore, pipelineStore } from '~/lib/stores/cude';
import { approveDesignAndBuild, designContractStore } from '~/lib/stores/cude';
import { AGENT_DEFS } from '~/lib/cude/agents';
import { classNames } from '~/utils/classNames';

export function WorkspacePlaceholder({ hasFiles }: { hasFiles: boolean }) {
  const architecture = useStore(architectureStore);
  const pipeline = useStore(pipelineStore);
  const contract = useStore(designContractStore);

  // Once files exist the editor owns the space; this state disappears naturally.
  if (hasFiles) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center bg-cude-background-depth-1">
        <div className="i-ph:file-code text-3xl text-cude-textTertiary" />
        <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary">EDITOR</div>
        <p className="text-sm text-cude-textSecondary max-w-sm leading-relaxed">
          Select a file from the tree to open it here.
        </p>
      </div>
    );
  }

  const targets = architecture ? Object.entries(architecture.stackDecisions) : [];
  const activeStage = pipeline.agents.find((a) => a.status === 'working');
  const failedStage = pipeline.agents.find((a) => a.status === 'failed');

  /*
   * The card used to report "waiting for your approval" with nowhere to give
   * it — approval lived only in the DESIGN inspector, so the wait read as a
   * dead end. The action is the same store call the inspector button makes.
   */
  const awaitingApproval = activeStage?.id === 'designReview' && contract != null && contract.status !== 'approved';

  const headline =
    failedStage != null
      ? 'The pipeline stopped before files were written.'
      : activeStage != null
        ? 'Builder is preparing the project workspace.'
        : 'Project files will appear here as the Builder generates them.';

  return (
    <div className="h-full overflow-auto modern-scrollbar bg-cude-background-depth-1">
      <div className="min-h-full flex flex-col items-center justify-center gap-5 px-8 py-10">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="i-ph:file-code text-3xl text-cude-textTertiary" />
          <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary">EDITOR</div>
          <p className="text-sm text-cude-textSecondary max-w-sm leading-relaxed">{headline}</p>
        </div>

        {targets.length > 0 && (
          <div className="w-full max-w-md">
            <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mb-2">TARGETS</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {targets.map(([platform, decision]) => (
                <div
                  key={platform}
                  className="px-3 py-2 rounded-md border border-cude-borderColor bg-cude-background-depth-2"
                >
                  <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary">
                    {platform.toUpperCase()}
                  </div>
                  <div className="text-xs font-medium text-cude-textPrimary truncate">{decision.selected.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(activeStage || failedStage) && (
          <div className="w-full max-w-md">
            <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mb-2">
              {failedStage ? 'FAILED STAGE' : 'CURRENT STAGE'}
            </div>
            <div
              className={classNames(
                'px-3 py-2 rounded-md border bg-cude-background-depth-2',
                failedStage ? 'border-red-500/40' : 'border-cude-borderColor',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={classNames(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    failedStage ? 'bg-cude-item-contentDanger' : 'bg-cude-textPrimary animate-pulse',
                  )}
                  aria-hidden="true"
                />
                <span className="text-xs font-medium text-cude-textPrimary">
                  {AGENT_DEFS[(failedStage ?? activeStage)!.id].label}
                </span>
              </div>
              <p className="text-[11px] leading-4 text-cude-textSecondary mt-1">
                {(failedStage ?? activeStage)!.summary ?? AGENT_DEFS[(failedStage ?? activeStage)!.id].description}
              </p>
              {awaitingApproval && (
                <button
                  type="button"
                  onClick={approveDesignAndBuild}
                  className="mt-2.5 h-8 px-3 rounded-md bg-cude-textPrimary text-cude-background-depth-1 border border-cude-textPrimary text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-textTertiary"
                >
                  Approve & Build
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
