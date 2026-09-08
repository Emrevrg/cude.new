/**
 * Cude.new - Engineering Pipeline UI
 *
 * Shows what the engineering team is actually doing: which stages are done,
 * which one is running, what is still waiting, and whether anything failed and
 * is being repaired.
 *
 * Progress is derived from completed stages — there are no invented percentages
 * and no fabricated time estimates.
 */

import { AGENT_DEFS, PIPELINE_ORDER, type AgentState, type AgentStatus, type PipelineStatus } from '~/lib/cude/agents';
import { classNames } from '~/utils/classNames';

/** Stages that fan out per target when a product has more than one. */
const BRANCHING_AGENTS = new Set(['architect', 'builder', 'platform', 'visualQA']);

const STATUS_STYLES: Record<AgentStatus, { dot: string; label: string; text: string }> = {
  waiting: {
    dot: 'border-cude-borderColor bg-transparent',
    label: 'border-transparent text-cude-textTertiary',
    text: 'text-cude-textTertiary',
  },
  working: {
    dot: 'border-cude-textPrimary bg-cude-textPrimary animate-pulse',
    label: 'border-cude-textPrimary text-cude-textPrimary',
    text: 'text-cude-textPrimary',
  },
  complete: {
    dot: 'border-cude-textPrimary bg-cude-textPrimary',
    label: 'border-cude-borderColor text-cude-textSecondary',
    text: 'text-cude-textPrimary',
  },
  failed: {
    dot: 'border-red-500 bg-cude-item-contentDanger',
    label: 'border-red-500 text-red-400',
    text: 'text-red-400',
  },
  skipped: {
    dot: 'border-cude-borderColor bg-transparent',
    label: 'border-transparent text-cude-textTertiary',
    text: 'text-cude-textTertiary',
  },
};

function formatDuration(startedAt?: number, endedAt?: number): string | null {
  if (!startedAt || !endedAt || endedAt <= startedAt) {
    return null;
  }

  const seconds = Math.round((endedAt - startedAt) / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function StageRow({ agent, targets }: { agent: AgentState; targets: string[] }) {
  const def = AGENT_DEFS[agent.id];
  const style = STATUS_STYLES[agent.status];
  const duration = formatDuration(agent.startedAt, agent.endedAt);

  // Only show branches once the stage has actually started doing per-target work.
  const branches = BRANCHING_AGENTS.has(agent.id) && targets.length > 1 && agent.status !== 'waiting' ? targets : [];

  return (
    <div
      className={classNames(
        'flex items-start gap-3 px-2.5 py-2 rounded-md border',
        agent.status === 'working' ? 'bg-cude-background-depth-2 border-cude-borderColor' : 'border-transparent',
      )}
    >
      <div className={classNames('mt-1.5 w-2 h-2 rounded-full border shrink-0', style.dot)} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={classNames('text-[11px] font-semibold tracking-widest', style.text)}>
            {def.label.toUpperCase()}
          </span>
          <span className="text-[10px] tracking-wide text-cude-textTertiary">{def.role}</span>

          {duration && <span className="text-[10px] tabular-nums text-cude-textTertiary">{duration}</span>}

          <span className={classNames('ml-auto text-[10px] px-1.5 py-0.5 rounded border tracking-wide', style.label)}>
            {agent.status.toUpperCase()}
          </span>
        </div>

        <p
          className={classNames(
            'text-[12px] leading-4 mt-1 line-clamp-2',
            agent.summary ? 'text-cude-textSecondary' : 'text-cude-textTertiary',
          )}
        >
          {agent.summary || def.description}
        </p>

        {branches.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {branches.map((target) => (
              <span
                key={target}
                className="px-1.5 py-0.5 rounded border border-cude-borderColor text-[10px] tracking-wide text-cude-textTertiary"
              >
                {target.toUpperCase()}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export interface AgentTimelineProps {
  agents: AgentState[];
  status?: PipelineStatus;
  repairAttempts?: number;
  maxRepairAttempts?: number;
  lastError?: string;

  /** Target platforms, used to show per-target branching on fan-out stages. */
  targets?: string[];
  compact?: boolean;
}

export function AgentTimeline({
  agents,
  status = 'idle',
  repairAttempts = 0,
  maxRepairAttempts = 3,
  lastError,
  targets = [],
  compact,
}: AgentTimelineProps) {
  /*
   * Order the rows the way the pipeline actually runs. Stages that sit outside
   * the linear order (Repair, which only runs on failure) have no index, so
   * they are pushed to the end rather than sorting to the front on -1.
   */
  const rank = (id: AgentState['id']) => {
    const index = PIPELINE_ORDER.indexOf(id);
    return index === -1 ? PIPELINE_ORDER.length : index;
  };

  const ordered = [...agents].sort((a, b) => rank(a.id) - rank(b.id));

  const completed = ordered.filter((a) => a.status === 'complete').length;
  const failed = ordered.filter((a) => a.status === 'failed');
  const current = ordered.find((a) => a.status === 'working');
  const total = ordered.length;

  if (status === 'idle' && completed === 0 && !current) {
    return (
      <div className="p-6 rounded-lg border border-cude-borderColor bg-cude-background-depth-1">
        <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary mb-2">
          ENGINEERING PIPELINE
        </div>
        <p className="text-sm text-cude-textSecondary max-w-md leading-relaxed">
          Describe the software you want built. Each stage below reports its own state as the team works — analysis,
          architecture, design, implementation, test, repair and verification.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] tracking-widest font-semibold text-cude-textTertiary">ENGINEERING PIPELINE</span>
        <span className="text-[11px] text-cude-textTertiary">
          {completed}/{total} stages
        </span>

        {repairAttempts > 0 && (
          <span className="text-[10px] tracking-wide px-1.5 py-0.5 rounded border border-amber-500/60 text-amber-400">
            REPAIR {repairAttempts}/{maxRepairAttempts}
          </span>
        )}

        <span
          className={classNames(
            'ml-auto text-[10px] tracking-widest px-2 py-0.5 rounded border font-medium',
            status === 'verified'
              ? 'bg-cude-textPrimary text-cude-background-depth-1 border-cude-textPrimary'
              : status === 'failed'
                ? 'border-red-500 text-red-400'
                : status === 'repairing'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-cude-borderColor text-cude-textSecondary',
          )}
        >
          {status.toUpperCase()}
        </span>
      </div>

      {/* Real progress: completed stages over total. Never an invented estimate. */}
      <div className="h-0.5 w-full rounded-full bg-cude-background-depth-3 overflow-hidden">
        <div
          className={classNames(
            'h-full transition-all duration-500',
            failed.length > 0 ? 'bg-cude-item-contentDanger' : 'bg-cude-textPrimary',
          )}
          style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
        />
      </div>

      {lastError && failed.length > 0 && (
        <div className="px-3 py-2 rounded-md border border-red-500/40 bg-cude-item-contentDanger/5">
          <div className="text-[10px] tracking-widest font-semibold text-red-400 mb-0.5">FAILURE</div>
          <p className="text-[12px] leading-4 text-cude-textSecondary line-clamp-3">{lastError}</p>
        </div>
      )}

      <div className={classNames('flex flex-col', compact ? 'gap-1' : 'gap-1.5')}>
        {ordered.map((agent) => (
          <StageRow key={agent.id} agent={agent} targets={targets} />
        ))}
      </div>
    </div>
  );
}

export function PipelineStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    verified: 'bg-cude-textPrimary text-cude-background-depth-1 border-cude-textPrimary',
    failed: 'bg-cude-item-contentDanger text-white border-red-500',
    building: 'bg-cude-background-depth-2 text-cude-textPrimary border-cude-borderColor',
    testing: 'bg-cude-background-depth-2 text-cude-textPrimary border-cude-borderColor',
    repairing: 'bg-amber-500 text-black border-amber-500',
  };

  const cls = map[status] ?? 'bg-transparent text-cude-textSecondary border-cude-borderColor';

  return (
    <span className={classNames('px-2 py-1 rounded-md border text-[11px] font-medium tracking-widest', cls)}>
      {status.toUpperCase()}
    </span>
  );
}
