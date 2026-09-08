import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { workbenchStore, type ArtifactState } from '~/lib/stores/workbench';
import type { ActionState } from '~/lib/cude/pipeline/actionExecutor';
import { AGENT_DEFS, type PipelineState } from '~/lib/cude/agents';
import { pipelineStore, formatPipelineStatus } from '~/lib/stores/cude';
import { streamingState } from '~/lib/stores/streaming';

/** Model streaming and workspace execution have independent lifecycles. */
export function ExecutionStatus({ planningOnly = false }: { planningOnly?: boolean }) {
  const artifacts = useStore(workbenchStore.artifacts);
  const pipeline = useStore(pipelineStore);
  const streaming = useStore(streamingState);
  const latest = Object.entries(artifacts).at(-1);
  const latestActions = latest ? Object.values(latest[1].runner.actions.get()) : [];

  /*
   * An artifact can be registered before its action stream receives the first
   * event. Keep the pipeline card visible during that short hand-off instead
   * of returning an empty panel and making the UI look stuck.
   */
  if (latest && latestActions.length > 0) {
    if (planningOnly) {
      return null;
    }

    return <ArtifactExecution key={latest[0]} artifact={latest[1]} pipeline={pipeline} />;
  }

  return streaming || pipeline.status !== 'idle' ? <PipelineActivity pipeline={pipeline} /> : null;
}

function ArtifactExecution({ artifact, pipeline }: { artifact: ArtifactState; pipeline: PipelineState }) {
  const states = useStore(artifact.runner.actions);
  const actions = Object.values(states);
  const running = actions.find((action) => action.status === 'running');
  const pending = actions.filter((action) => action.status === 'pending').length;
  const failed = actions.some((action) => action.status === 'failed');
  const aborted = actions.some((action) => action.status === 'aborted');
  const active = Boolean(running || pending);
  const filesTouched = new Set(
    actions.filter((action) => action.type === 'file' && action.filePath).map((action) => action.filePath),
  ).size;
  const commandsRun = actions.filter((action) => action.type !== 'file').length;
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const command = running && running.type !== 'file' ? running.content : '';

  useEffect(() => {
    setElapsed(0);

    if (!active) {
      return undefined;
    }

    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);

    return () => clearInterval(timer);
  }, [active, command]);

  if (!actions.length) {
    return null;
  }

  const label = failed
    ? 'Workspace needs attention'
    : active
      ? running?.type === 'start'
        ? 'Starting preview'
        : command
          ? 'Running command'
          : 'Writing project files'
      : aborted
        ? 'Workspace stopped'
        : 'Workspace actions finished';

  return (
    <div
      className="rounded-lg border border-cude-borderColor bg-cude-background-depth-2 px-3 py-2 text-xs"
      data-testid="execution-status"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div role="status" className="flex items-center gap-2 text-cude-textPrimary">
            <span
              className={
                active
                  ? 'i-svg-spinners:90-ring-with-bg'
                  : failed
                    ? 'i-ph:warning'
                    : aborted
                      ? 'i-ph:stop'
                      : 'i-ph:check'
              }
              aria-hidden="true"
            />
            {label}
            {active && (
              <span className="text-cude-textTertiary" aria-hidden="true">
                {elapsed}s
              </span>
            )}
          </div>
          {command && (
            <div className="mt-1 truncate text-cude-textSecondary" title={command}>
              {command}
            </div>
          )}
          {active && elapsed >= 30 && (
            <div className="mt-1 text-cude-textSecondary">
              Still running. You can stop this operation; your files will be kept.
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="rounded-md px-2 py-1 text-cude-textTertiary hover:bg-cude-background-depth-3 hover:text-cude-textPrimary"
          >
            {expanded ? 'Hide activity' : `${actions.length} steps`}
          </button>
          {active && (
            <button
              type="button"
              className="rounded-md border border-cude-borderColor px-3 py-1.5 hover:bg-cude-background-depth-3"
              onClick={() => workbenchStore.abortAllActions()}
            >
              Stop
            </button>
          )}
        </div>
      </div>
      {expanded && <ActivityList actions={actions} />}
      {pipeline.status !== 'idle' && <PipelineSummary pipeline={pipeline} />}
      {!active && !failed && (filesTouched > 0 || commandsRun > 0) && (
        <div className="mt-2 border-t border-cude-borderColor pt-2 text-[11px] text-cude-textTertiary">
          {filesTouched > 0 ? `${filesTouched} file${filesTouched === 1 ? '' : 's'} changed` : 'No files changed'}
          {commandsRun > 0 ? ` · ${commandsRun} command${commandsRun === 1 ? '' : 's'} run` : ''}
        </div>
      )}
    </div>
  );
}

function PipelineActivity({ pipeline }: { pipeline: PipelineState }) {
  const [elapsed, setElapsed] = useState(0);
  const active = pipeline.agents.find((agent) => agent.status === 'working');
  const completed = pipeline.agents.filter((agent) => agent.status === 'complete' || agent.status === 'skipped').length;
  const quality = pipeline.agents.filter((agent) =>
    ['tester', 'visualQA', 'qa', 'reviewer', 'security'].includes(agent.id),
  );
  const qualityDone = quality.filter((agent) => agent.status === 'complete').length;
  const tester = pipeline.agents.find((agent) => agent.id === 'tester');
  const testStatus =
    tester?.status === 'complete'
      ? tester.summary || 'Build and tests passed'
      : tester?.status === 'working'
        ? 'Build and tests running'
        : 'Tests pending';

  useEffect(() => {
    const started = active?.startedAt ?? Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    setElapsed(Math.floor((Date.now() - started) / 1000));

    return () => clearInterval(timer);
  }, [active?.startedAt]);

  const label = active ? AGENT_DEFS[active.id].label : formatPipelineStatus(pipeline.status);
  const summary = active?.summary ?? 'Preparing the next engineering step';

  return (
    <div
      className="rounded-lg border border-cude-borderColor bg-cude-background-depth-2 px-3 py-2 text-xs"
      data-testid="pipeline-activity"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div role="status" className="flex items-center gap-2 text-cude-textPrimary">
            <span className="i-svg-spinners:90-ring-with-bg" aria-hidden="true" />
            <span>{label}</span>
            <span className="text-cude-textTertiary">{elapsed}s</span>
          </div>
          <div className="mt-1 truncate text-cude-textSecondary" title={summary}>
            {summary}
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-cude-borderColor px-2.5 py-1.5 text-cude-textSecondary hover:bg-cude-background-depth-3 hover:text-cude-textPrimary"
          onClick={() => workbenchStore.showWorkbench.set(true)}
        >
          Open workspace
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3 border-t border-cude-borderColor pt-2 text-[11px] text-cude-textTertiary">
        <span>
          {completed}/{pipeline.agents.length} stages complete
        </span>
        <span>
          {qualityDone}/{quality.length} checks complete
        </span>
        <span className="min-w-0 truncate" title={testStatus}>
          {testStatus}
        </span>
      </div>
    </div>
  );
}

function PipelineSummary({ pipeline }: { pipeline: PipelineState }) {
  const active = pipeline.agents.find((agent) => agent.status === 'working');
  const completed = pipeline.agents.filter((agent) => agent.status === 'complete' || agent.status === 'skipped').length;

  return (
    <div className="mt-2 border-t border-cude-borderColor pt-2 text-[11px] text-cude-textTertiary">
      <span>
        {completed}/{pipeline.agents.length} stages complete
      </span>
      {active && <span> · {AGENT_DEFS[active.id].label} active</span>}
    </div>
  );
}

function ActivityList({ actions }: { actions: ActionState[] }) {
  const visible = actions.slice(-6).reverse();

  return (
    <div className="mt-2 max-h-40 space-y-1 overflow-y-auto border-t border-cude-borderColor pt-2" aria-live="polite">
      {visible.map((action, index) => {
        const title = action.type === 'file' ? action.filePath || 'project file' : action.content.trim() || action.type;
        const icon =
          action.type === 'file'
            ? 'i-ph:file-code'
            : action.type === 'shell'
              ? 'i-ph:terminal-window'
              : action.type === 'build'
                ? 'i-ph:hammer'
                : 'i-ph:play-circle';
        const statusIcon =
          action.status === 'running' || action.status === 'pending'
            ? 'i-svg-spinners:90-ring-with-bg'
            : action.status === 'complete'
              ? 'i-ph:check-circle'
              : action.status === 'failed'
                ? 'i-ph:warning-circle'
                : 'i-ph:stop-circle';
        const stateLabel =
          action.status === 'running' ? 'running' : action.status === 'pending' ? 'queued' : action.status;

        return (
          <div
            key={`${title}-${index}`}
            className="flex items-center gap-2 rounded-md bg-cude-background-depth-3 px-2 py-1.5"
          >
            <span className={`${icon} shrink-0 text-cude-textSecondary`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-cude-textSecondary" title={title}>
              {title}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[10px] text-cude-textTertiary">
              <span className={statusIcon} aria-hidden="true" />
              {stateLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
