/**
 * Cude.new - action runner facade.
 *
 * Presents the shape the workbench and the deploy surfaces already call, backed
 * by `ActionExecutor`. Those surfaces are themselves still inherited; giving
 * them a facade replaces the *implementation* now, without a UI rewrite in the
 * same change.
 *
 * Deploy progress is reported through the same alert channel as before, because
 * a deploy that silently stops telling the user what it is doing is worse than
 * a slightly awkward seam.
 */

import { atom } from 'nanostores';
import type { WorkspaceService } from '~/lib/cude/state/workspace/workspaceService';
import type { TerminalService } from '~/lib/cude/state/workspace/terminalService';
import type { DeployAlert, ActionAlert } from '~/types/actions';
import { ActionExecutor, type ActionState, type ActionFailure } from './actionExecutor';
import type { ActionCallbackData } from './artifactParser';
import type { CudeAction } from './artifactProtocol';

export type DeployStage = 'building' | 'deploying' | 'complete';
export type DeployStatus = 'pending' | 'running' | 'complete' | 'failed';

/** Translate a workbench action payload into the executor's vocabulary. */
function toCudeAction(data: ActionCallbackData): CudeAction {
  const action = data.action as { type: string; content: string; filePath?: string };

  return {
    type: (['file', 'shell', 'start', 'build'] as const).includes(action.type as never)
      ? (action.type as CudeAction['type'])
      : 'shell',
    filePath: action.filePath,
    content: action.content ?? '',
  };
}

export interface ActionRunnerOptions {
  workspace: WorkspaceService;
  terminals: TerminalService;
  onAlert?: (alert: ActionAlert) => void;
  onDeployAlert?: (alert: DeployAlert) => void;
}

export class CudeActionRunner {
  readonly runnerId = atom<string>(`${Date.now()}`);
  readonly executor: ActionExecutor;

  /** Result of the most recent build action, for the deploy surfaces. */
  buildOutput?: { path: string; exitCode: number; output: string };

  private _options: ActionRunnerOptions;

  constructor(options: ActionRunnerOptions) {
    this._options = options;
    this.executor = new ActionExecutor({
      workspace: options.workspace,
      terminals: options.terminals,
      onFailure: (failure) => this._reportFailure(failure),
      onChange: (_id, state) => this._captureBuildOutput(state),
    });
  }

  get actions() {
    return this.executor.actions;
  }

  addAction(data: ActionCallbackData): void {
    this.executor.add(data.actionId, toCudeAction(data));
  }

  async runAction(data: ActionCallbackData, isStreaming = false): Promise<void> {
    /*
     * Hand over the content, not just the id.
     *
     * The executor kept its own copy of an action, taken when the action
     * opened — which for a file is before a single character of it has
     * arrived. Running it by id alone meant writing that copy: zero bytes,
     * every time, over the file the editor had just saved correctly.
     *
     * Whether that landed before or after the good write was a race, which is
     * why a generated project was sometimes intact and sometimes a set of
     * correctly named empty files.
     */
    this.executor.add(data.actionId, toCudeAction(data));

    await this.executor.run(data.actionId, { streaming: isStreaming });
  }

  abort(): void {
    this.executor.abort();
  }

  private _captureBuildOutput(state: ActionState): void {
    if (state.type !== 'build' || (state.status !== 'complete' && state.status !== 'failed')) {
      return;
    }

    this.buildOutput = {
      path: 'dist',
      exitCode: state.exitCode ?? (state.status === 'complete' ? 0 : 1),
      output: state.output ?? '',
    };
  }

  private _reportFailure(failure: ActionFailure): void {
    this._options.onAlert?.({
      type: 'error',
      title: failure.title,
      description: failure.description,
      content: failure.output,
      source: 'terminal',
    } as ActionAlert);
  }

  /** Report deploy progress through the alert channel. */
  handleDeployAction(
    stage: DeployStage,
    status: DeployStatus,
    details?: { url?: string; error?: string; source?: 'netlify' | 'vercel' | 'github' | 'gitlab' },
  ): void {
    if (!this._options.onDeployAlert) {
      return;
    }

    const noun = stage === 'building' ? 'Build' : 'Deployment';
    const verb = stage === 'building' ? 'Building' : 'Deploying';

    const description =
      status === 'failed'
        ? `${noun} failed`
        : status === 'running'
          ? `${verb} your application...`
          : status === 'complete'
            ? `${noun} completed successfully`
            : `Preparing to ${verb.toLowerCase()} your application`;

    this._options.onDeployAlert({
      type: status === 'failed' ? 'error' : status === 'complete' ? 'success' : 'info',
      title: stage === 'complete' ? 'Deployment Complete' : `${verb} Application`,
      description,
      stage,
      buildStatus:
        stage === 'building' ? status : stage === 'deploying' || stage === 'complete' ? 'complete' : 'pending',
      deployStatus: stage === 'deploying' ? status : stage === 'complete' ? 'complete' : 'pending',
      url: details?.url,
      error: details?.error,
      source: details?.source,
    } as unknown as DeployAlert);
  }
}
