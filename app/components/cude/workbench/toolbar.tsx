/**
 * Cude.new - the workspace toolbar's parts.
 *
 * Three small pieces with one job between them: keep the hierarchy legible.
 * The workspace mode (Code / Diff / Preview) is what a person reaches for, the
 * engineering inspectors are how they look at the pipeline, and the project
 * actions are supporting work that must not out-shout either.
 *
 * Kept apart from the shell so the shell reads as composition rather than as
 * five hundred lines of markup.
 */

import { memo } from 'react';
import { classNames } from '~/utils/classNames';
import { AGENT_DEFS, type PipelineState } from '~/lib/cude/agents';
import { formatPipelineStatus } from '~/lib/stores/cude';

export interface InspectorTabProps {
  active: boolean;
  label: string;

  /** Shown instead of the label when the toolbar is short of room. */
  shortLabel?: string;
  badge?: string;
  title: string;
  dimmed?: boolean;

  /** True when the toolbar has room for full labels. */
  wide?: boolean;
  onClick: () => void;
}

export const InspectorTab = memo(
  ({ active, dimmed, label, shortLabel, badge, title, wide = true, onClick }: InspectorTabProps) => (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={title}
      className={classNames(
        'shrink-0 h-7 px-2.5 rounded-md border text-[11px] tracking-widest font-medium whitespace-nowrap',
        'flex items-center gap-1.5 transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-textTertiary',
        active
          ? 'bg-cude-textPrimary text-cude-background-depth-1 border-cude-textPrimary'
          : dimmed
            ? 'border-transparent text-cude-textTertiary hover:text-cude-textSecondary hover:border-cude-borderColor'
            : 'border-transparent text-cude-textSecondary hover:text-cude-textPrimary hover:border-cude-borderColor',
      )}
    >
      <span>{shortLabel && !wide ? shortLabel : label}</span>

      {badge && (
        <span
          className={classNames(
            'px-1 rounded text-[9px] tracking-wide leading-[1.4]',

            /*
             * The badge inverts along with the active tab, or its label
             * disappears into the fill.
             */
            active
              ? 'bg-cude-background-depth-1 text-cude-textPrimary'
              : 'bg-cude-background-depth-3 text-cude-textSecondary',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  ),
);

InspectorTab.displayName = 'InspectorTab';

export const ToolbarDivider = memo(({ className }: { className?: string }) => (
  <span className={classNames('shrink-0 w-px h-4 bg-cude-borderColor mx-1', className)} aria-hidden="true" />
));

ToolbarDivider.displayName = 'ToolbarDivider';

export interface ToolbarActionProps {
  icon: string;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;

  /** True when the toolbar has room for the label beside the icon. */
  wide?: boolean;
}

export const ToolbarAction = memo(
  ({ icon, label, title, onClick, disabled, active, wide = true }: ToolbarActionProps) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={classNames(
        'shrink-0 h-7 px-2 rounded-md flex items-center gap-1.5 text-xs whitespace-nowrap transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cude-textTertiary',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        active
          ? 'bg-cude-background-depth-3 text-cude-textPrimary'
          : 'text-cude-textSecondary hover:text-cude-textPrimary hover:bg-cude-background-depth-3',
      )}
    >
      <span className={classNames(icon, 'text-sm')} />
      {wide && <span>{label}</span>}
    </button>
  ),
);

ToolbarAction.displayName = 'ToolbarAction';

export interface EngineeringStatusStripProps {
  pipeline: PipelineState;
  targets: string[];
  designStatus: string | null;
  filesCount?: number;
}

/**
 * One line of real state: the stage, the targets, the repair count, the design
 * verdict. No percentages and no time estimates, because neither is known.
 */
export const EngineeringStatusStrip = memo(
  ({ pipeline, targets, designStatus, filesCount = 0 }: EngineeringStatusStripProps) => {
    const activeStage = pipeline.agents.find((agent) => agent.status === 'working');
    const failedStage = pipeline.agents.find((agent) => agent.status === 'failed');

    if (pipeline.status === 'idle' && targets.length === 0) {
      return null;
    }

    const isFailed = pipeline.status === 'failed' || Boolean(failedStage);
    const isVerified = pipeline.status === 'verified';
    const hasProductOutput = filesCount > 0 && pipeline.status === 'design_review';
    const statusLabel = hasProductOutput ? 'Workspace ready' : formatPipelineStatus(pipeline.status);
    const displayedStage = hasProductOutput ? undefined : activeStage;

    return (
      <div
        className={classNames(
          'flex items-center gap-2 px-3 h-7 border-t border-cude-borderColor',
          'text-[10px] tracking-widest font-medium overflow-x-auto no-scrollbar',
          'bg-cude-background-depth-1',
        )}
      >
        <span
          aria-hidden="true"
          className={classNames(
            'shrink-0 w-1.5 h-1.5 rounded-full',
            isFailed
              ? 'bg-cude-item-contentDanger'
              : isVerified
                ? 'bg-cude-textPrimary'
                : pipeline.status === 'idle'
                  ? 'bg-cude-textTertiary'
                  : 'bg-cude-textPrimary animate-pulse',
          )}
        />

        <span className={classNames('shrink-0', isFailed ? 'text-red-400' : 'text-cude-textPrimary')}>
          {statusLabel}
        </span>

        {targets.length > 0 && (
          <>
            <span className="shrink-0 text-cude-textTertiary">·</span>
            <span className="shrink-0 text-cude-textSecondary">
              {targets.map((target) => target.toUpperCase()).join(' + ')}
            </span>
          </>
        )}

        {displayedStage && (
          <>
            <span className="shrink-0 text-cude-textTertiary">·</span>
            <span className="shrink-0 text-cude-textSecondary">
              {AGENT_DEFS[displayedStage.id].label.toUpperCase()}
            </span>
          </>
        )}

        {pipeline.repairAttempts > 0 && (
          <>
            <span className="shrink-0 text-cude-textTertiary">·</span>
            <span className="shrink-0 text-amber-400">
              REPAIR {pipeline.repairAttempts}/{pipeline.maxRepairAttempts}
            </span>
          </>
        )}

        {designStatus && !hasProductOutput && (
          <span className="ml-auto shrink-0 text-cude-textTertiary hidden md:inline">
            Design {formatPipelineStatus(designStatus)}
          </span>
        )}
      </div>
    );
  },
);

EngineeringStatusStrip.displayName = 'EngineeringStatusStrip';
