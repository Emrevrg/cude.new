/**
 * Cude.new - Orchestrator
 * Drives pipelineStore based on REAL operations.
 * No fake timers; transitions happen when files/builds complete.
 */
import { workbenchStore } from '~/lib/stores/workbench';
import { summarizeArchitecture } from '~/lib/cude/architecture';
import {
  platformStore,
  pipelineStore,
  setPipelineStatus,
  updateAgentStatus,
  designSystemStore,
  designSystemStatusStore,
  projectMemoryStore,
  architectureStore,
  planArchitectureFromPrompt,
  attachDesignSystemToArchitecture,
  setDesignContract,
  addTargetToCurrentProduct,
} from '~/lib/stores/cude';
import { createDefaultRequirements, summarizeRequirements } from '~/lib/cude/engineeringRequirements';
import { createDesignContract, requiresDesignApproval } from '~/lib/cude/designContract';
import { detectProductIntent } from '~/lib/cude/addPlatform';
import { detectProjectType } from '~/lib/cude/detector';
import { PROJECT_TYPE_CONFIGS } from '~/lib/cude/platform';
import { classifyError, MAX_REPAIR_ATTEMPTS } from '~/lib/cude/build';
import {
  createDesignSystem,
  designSystemToCssVars,
  validateDesignSystem,
  applyGlobalCompactSharp,
  updateDesignSystem,
} from '~/lib/cude/designSystem';
import type { DesignSystem } from '~/lib/cude/designSystem';
import { streamingState } from '~/lib/stores/streaming';

let bound = false;

/** Explicit wording in a prompt can opt a visual product out of the review gate. */
export function isDesignReviewSkipped(prompt: string): boolean {
  return (
    /\b(skip|bypass|without|no)\b[^.\n]{0,48}\bdesign\s+review\b/i.test(prompt) ||
    /\bdesign\s+review\b[^.\n]{0,48}\b(skip|bypass|without)\b/i.test(prompt)
  );
}

export function bindPipelineToWorkbench() {
  if (bound) {
    return;
  }

  bound = true;

  const settleExecution = () => {
    if (streamingState.get()) {
      return;
    }

    const artifact = Object.values(workbenchStore.artifacts.get()).at(-1);

    if (!artifact?.closed) {
      return;
    }

    const actions = Object.values(artifact.runner.actions.get());

    if (!actions.length || actions.some((a) => a.status === 'running' || a.status === 'pending')) {
      return;
    }

    if (actions.some((a) => a.status === 'failed' || a.status === 'aborted')) {
      setPipelineStatus('needs_user_action');
      return;
    }

    updateAgentStatus('builder', 'complete', 'Workspace actions finished');

    const passed = actions.filter((a) => a.type !== 'file' && a.exitCode === 0 && a.status === 'complete');
    const buildPassed = passed.some((a) => /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build\b/.test(a.content));
    const testsPassed = passed.some((a) => /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\bvitest\b/.test(a.content));
    updateAgentStatus(
      'tester',
      buildPassed && testsPassed ? 'complete' : 'waiting',
      buildPassed && testsPassed
        ? 'Build and test commands passed; preview review still required'
        : 'Generation finished; build and tests have not both passed',
    );
    setPipelineStatus(buildPassed && testsPassed ? 'verified' : 'needs_user_action');
  };
  streamingState.subscribe(settleExecution);

  // Observe actual verification commands, not the mere presence of starter files.
  const subscriptions = new Map<string, () => void>();
  workbenchStore.artifacts.subscribe((artifacts) => {
    for (const [key, dispose] of subscriptions) {
      if (!artifacts[key]) {
        dispose();
        subscriptions.delete(key);
      }
    }

    for (const [key, artifact] of Object.entries(artifacts)) {
      if (subscriptions.has(key)) {
        continue;
      }

      const seen = new Map<string, string>();
      const dispose = artifact.runner.actions.subscribe((actions) => {
        for (const [id, action] of Object.entries(actions)) {
          if (seen.get(id) === action.status) {
            continue;
          }

          seen.set(id, action.status);

          if (
            action.type === 'file' ||
            !/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|test)\b|\b(?:vitest|tsc)\b/.test(action.content)
          ) {
            continue;
          }

          if (action.status === 'running') {
            updateAgentStatus('tester', 'working', action.content.slice(0, 180));
            setPipelineStatus('testing');
          } else if (action.status === 'complete' && action.exitCode === 0) {
            updateAgentStatus('tester', 'complete', `Command passed: ${action.content.slice(0, 150)}`);
            setPipelineStatus('building');
          } else if (action.status === 'failed' || action.status === 'aborted') {
            updateAgentStatus('tester', 'failed', action.error || 'Verification did not complete');
            setPipelineStatus('needs_user_action');
          }
        }
        settleExecution();
      });
      subscriptions.set(key, dispose);
    }
    settleExecution();
  });

  /*
   * The workspace is the signal that the Builder is producing something. This
   * used to be a 1.2-second interval running for the lifetime of the page,
   * alongside this subscription; the file map is reactive, so the transition
   * happens when files actually appear rather than up to a second later.
   */
  workbenchStore.files.subscribe((files) => {
    const count = Object.keys(files).length;

    if (count === 0) {
      return;
    }

    const builder = pipelineStore.get().agents.find((agent) => agent.id === 'builder');

    if (builder?.status !== 'working') {
      return;
    }

    updateAgentStatus('builder', 'working', `${count} files in workspace`);
  });

  // Listen to previews / terminal for build signals (best-effort via polling workbench alerts)
  workbenchStore.alert.subscribe((alert) => {
    if (alert && alert.description?.toLowerCase().includes('error')) {
      const pipeline = pipelineStore.get();
      const tester = pipeline.agents.find((a) => a.id === 'tester');

      if (tester?.status === 'working') {
        updateAgentStatus('tester', 'failed', alert.description.slice(0, 180));
        setPipelineStatus('repairing');
        updateAgentStatus('repair', 'working', `Classified: ${classifyError(alert.description)}`);
      }
    }
  });
}

export async function startCudePipeline(prompt: string): Promise<{ platform: string; detected: string }> {
  bindPipelineToWorkbench();

  /*
   * "Make a desktop version of this" must extend the existing product, not
   * start a new one. Classifying it as a fresh prompt would discard the
   * requirements, architecture and approved design the user already has.
   */
  const existingArchitecture = architectureStore.get();
  const intent = detectProductIntent(prompt, existingArchitecture);
  const skipDesignReview = isDesignReviewSkipped(prompt);

  if (intent.intent === 'ADD_TARGET' && intent.platform && existingArchitecture) {
    const added = addTargetToCurrentProduct(intent.platform, prompt);

    if (added) {
      updateAgentStatus(
        'analyst',
        'complete',
        `Recognised "${intent.evidence ?? intent.platform}" as adding a ${intent.platform} target to ${existingArchitecture.productName}`,
      );

      return { platform: intent.platform, detected: `ADD_TARGET → ${intent.platform}` };
    }
  }

  const currentPlatform = platformStore.get();
  let resolvedPlatform = currentPlatform;
  let reason = 'manual';

  if (currentPlatform === 'auto') {
    const detected = detectProjectType(prompt);
    resolvedPlatform = detected;
    reason = `AUTO → ${detected}`;
  }

  // Reset + start
  pipelineStore.set({
    status: 'planning',
    agents: pipelineStore.get().agents.map((a) => ({ id: a.id, status: 'waiting' as const })),
    repairAttempts: 0,
    maxRepairAttempts: MAX_REPAIR_ATTEMPTS,
  });

  setPipelineStatus('planning');

  // Analyst — runs the real requirements extraction and architecture planning.
  updateAgentStatus('analyst', 'working', `Extracting requirements from: "${prompt.slice(0, 80)}..."`);
  await microDelay(120);

  const architecture = planArchitectureFromPrompt(prompt, currentPlatform);

  if (architecture) {
    const constraints = summarizeRequirements(architecture.requirements);
    updateAgentStatus(
      'analyst',
      'complete',
      constraints.length > 0
        ? `${architecture.requirements.targetPlatforms.join(', ')} · ${constraints.slice(0, 3).join(' · ')}`
        : `Requirements extracted · platform: ${resolvedPlatform} (${reason})`,
    );
  } else {
    updateAgentStatus('analyst', 'complete', `Requirements extracted · platform: ${resolvedPlatform} (${reason})`);
  }

  /*
   * Planner — reports the work this prompt actually implies.
   *
   * It used to print "scaffold -> implement -> configure -> build -> test"
   * after a pause, identically for every request, whatever was asked for. A
   * stage that says the same thing regardless of its input is not reporting,
   * it is decoration, and it was the last of that left in the pipeline.
   *
   * The architecture already knows what has to be built: which targets, what
   * they share, how many constraints came out of the prompt. That is a real
   * plan and it differs from one request to the next.
   */
  updateAgentStatus('planner', 'working', 'Splitting work into tasks and dependencies');
  await microDelay(120);

  if (architecture) {
    const summary = summarizeArchitecture(architecture);
    const targets = summary.targets.map((target: { platform: string }) => target.platform);
    const parts = [
      targets.length === 1 ? `1 target: ${targets[0]}` : `${targets.length} targets: ${targets.join(', ')}`,
      summary.sharedServices.length > 0 ? `shared: ${summary.sharedServices.join(', ')}` : null,
      summary.requirementLines.length > 0 ? `${summary.requirementLines.length} constraints` : null,
    ].filter(Boolean);

    updateAgentStatus('planner', 'complete', parts.join(' · '));
  } else {
    /* No architecture to plan from — say that rather than inventing a task list. */
    updateAgentStatus('planner', 'complete', `Single ${resolvedPlatform} target, no separate services`);
  }

  // Design Director — BEFORE major UI generation, produces machine-readable design system artifact
  updateAgentStatus('design', 'working', 'Deriving product personality and design direction');
  await microDelay(100);

  const existingDs = designSystemStore.get();
  const needsNewSystem =
    !existingDs || !prompt.toLowerCase().includes('add ') || prompt.toLowerCase().includes('redesign');
  let ds: DesignSystem | null = null;

  if (needsNewSystem) {
    ds = createDesignSystem(prompt);

    const validation = validateDesignSystem(ds);
    designSystemStore.set(ds);
    designSystemStatusStore.set(validation.valid ? 'active' : 'validation_issue');

    // Persist to project memory
    const mem = projectMemoryStore.get();

    if (mem) {
      projectMemoryStore.set({
        ...mem,
        designSystem: ds,
        designSystemStatus: validation.valid ? 'active' : 'validation_issue',
        designHistory: [
          ...(mem.designHistory ?? []),
          {
            version: ds.meta.version,
            change: `Design system created: ${ds.identity.personality.join(', ')} · ${ds.identity.density}`,
            at: new Date().toISOString(),
          },
        ],
      });
    }

    attachDesignSystemToArchitecture(ds);
    updateAgentStatus(
      'design',
      'complete',
      `Created design system v${ds.meta.version}: ${ds.identity.personality.join(', ')} · ${ds.identity.density} · ${ds.meta.preset}`,
    );

    // Make CSS vars available for builder (real artifact)
    try {
      (globalThis as any).__cudeDesignCssVars = designSystemToCssVars(ds);
      (globalThis as any).__cudeDesignSystem = ds;
    } catch {}
  } else {
    // Reuse existing system for new screen additions
    ds = existingDs;
    updateAgentStatus(
      'design',
      'complete',
      `Reused design system v${ds!.meta.version}: ${ds!.identity.personality.join(', ')} — new screen will preserve tokens`,
    );
  }

  // Architect — reports the stack decisions Stack Intelligence actually made.
  const cfg = PROJECT_TYPE_CONFIGS[resolvedPlatform];
  updateAgentStatus('architect', 'working', 'Scoring candidate stacks against the extracted requirements');
  await microDelay(120);

  const planned = architectureStore.get();

  if (planned && Object.keys(planned.stackDecisions).length > 0) {
    const perTarget = Object.entries(planned.stackDecisions)
      .map(([platform, decision]) => `${platform}: ${decision.selected.name}`)
      .join(' · ');

    const rejected = Object.values(planned.stackDecisions)
      .flatMap((decision) => decision.candidates.filter((c) => c.rejected).map((c) => c.name))
      .slice(0, 2);

    updateAgentStatus(
      'architect',
      'complete',
      `${perTarget}${rejected.length > 0 ? ` · excluded: ${rejected.join(', ')}` : ''}`,
    );
  } else {
    updateAgentStatus(
      'architect',
      'complete',
      `Selected ${cfg.label}: ${cfg.frameworks[0] ?? 'custom'} · build: ${cfg.buildCommand}${ds ? ` · design: ${ds.meta.preset}` : ''}`,
    );
  }

  /*
   * Design approval gate.
   *
   * For products with a meaningful interface the Builder must not start until
   * the user has seen and approved what will be built. This is real
   * orchestration state: the pipeline genuinely stops here and only
   * approveDesignAndBuild() resumes it.
   *
   * Headless products (a pure backend) skip the gate entirely — forcing a
   * visual approval on a service with no UI would just be friction.
   */
  const gateArchitecture = architectureStore.get();
  const gatePlatforms = gateArchitecture ? gateArchitecture.requirements.targetPlatforms : [resolvedPlatform];

  if (ds && requiresDesignApproval(gatePlatforms) && !skipDesignReview) {
    updateAgentStatus('designReview', 'working', 'Preparing the interface proposal for your review');

    const contract = createDesignContract({
      productId: gateArchitecture?.productId ?? 'product',
      productName: gateArchitecture?.productName ?? 'Product',
      prompt,
      platforms: gatePlatforms,
      requirements: gateArchitecture?.requirements ?? createDefaultRequirements(),
      designSystem: ds,
    });

    setDesignContract(contract);

    const surfaceCount = Object.values(contract.platformDesigns).reduce((n, d) => n + d.surfaces.length, 0);
    updateAgentStatus(
      'designReview',
      'working',
      `${surfaceCount} surfaces across ${contract.platforms.join(', ')} — waiting for your approval`,
    );
    setPipelineStatus('design_review');

    // The Builder is intentionally left untouched; it stays 'waiting'.
    return { platform: resolvedPlatform, detected: reason };
  }

  if (ds) {
    updateAgentStatus(
      'designReview',
      'skipped',
      skipDesignReview ? 'Skipped at the user’s request' : 'No user-facing surfaces — design approval not required',
    );
  }

  startBuilderStage(ds);

  return { platform: resolvedPlatform, detected: reason };
}

/**
 * Moves the pipeline into implementation. Called after design approval, or
 * directly for products that need no approval.
 */
export function startBuilderStage(ds: DesignSystem | null) {
  updateAgentStatus(
    'builder',
    'working',
    `Generating project files${ds ? ` (tokens: ${Object.keys(ds.colors).length} colors, ${Object.keys(ds.spacing.scale).length} spacings)` : ''}...`,
  );
  setPipelineStatus('building');
}

export function completeBuilderIfFilesExist() {
  const pipeline = pipelineStore.get();
  const builder = pipeline.agents.find((a) => a.id === 'builder');
  const files = workbenchStore.files.get();

  if (builder?.status === 'working' && Object.keys(files).length > 0) {
    updateAgentStatus('builder', 'complete', `${Object.keys(files).length} files generated`);

    /*
     * Straight to the build. The step between used to wait 400ms and then say
     * "manifests and platform config applied", which nothing had done.
     */
    updateAgentStatus('tester', 'working', 'Running build and tests');
    setPipelineStatus('testing');
  }
}

export function reportBuildResult(success: boolean, output: string) {
  const pipeline = pipelineStore.get();
  const tester = pipeline.agents.find((a) => a.id === 'tester');

  if (!tester || tester.status !== 'working') {
    return;
  }

  if (success) {
    updateAgentStatus('tester', 'complete', 'Build passed');

    /*
     * The build passing is the last thing this pipeline actually knows.
     *
     * What used to follow was a chain of timers that reported "4 screens
     * rechecked", "preview loaded, no critical console errors", "requirements
     * and design consistency passed" and "no secrets found" — none of which
     * had run. Three hundred milliseconds apart, in order, every time. A
     * person reading that would believe their code had been reviewed and
     * scanned. Telling somebody their build is safe when nothing looked at it
     * is worse than saying nothing, so it says nothing.
     *
     * These stages come back when there is something behind them: a real
     * render to inspect, a real preview to load, a real scan to run.
     */
    setPipelineStatus('verified');
    pipelineStore.set({ ...pipelineStore.get(), status: 'verified' });
  } else {
    const category = classifyError(output);
    updateAgentStatus('tester', 'failed', output.slice(0, 180));

    const attempts = pipeline.repairAttempts;

    if (attempts < MAX_REPAIR_ATTEMPTS) {
      pipelineStore.set({ ...pipeline, repairAttempts: attempts + 1 });
      setPipelineStatus('repairing');
      updateAgentStatus(
        'repair',
        'working',
        `Attempt ${attempts + 1}/${MAX_REPAIR_ATTEMPTS} · ${category}: diagnosing`,
      );

      /*
       * The repair agent names what broke and hands it back to the model,
       * which is what actually fixes it. It used to announce "patch prepared"
       * after 600ms without having prepared one.
       */
    } else {
      updateAgentStatus('repair', 'failed', `Max repairs (${MAX_REPAIR_ATTEMPTS}) reached`);
      setPipelineStatus('failed');
    }
  }
}

export function applyGlobalDesignChange(
  mode: 'compactSharp' | 'custom',
  patch?: Partial<DesignSystem>,
): DesignSystem | null {
  const ds = designSystemStore.get();

  if (!ds) {
    return null;
  }

  let next: DesignSystem;

  if (mode === 'compactSharp') {
    next = applyGlobalCompactSharp(ds);
  } else if (patch) {
    next = updateDesignSystem(ds, patch);
  } else {
    return ds;
  }

  designSystemStore.set(next);
  designSystemStatusStore.set('modified');

  const mem = projectMemoryStore.get();

  if (mem) {
    projectMemoryStore.set({
      ...mem,
      designSystem: next,
      designSystemStatus: 'modified',
      designHistory: [
        ...(mem.designHistory ?? []),
        {
          version: next.meta.version,
          change: `Global design change: ${mode} · radius ${next.radius.md}`,
          at: new Date().toISOString(),
        },
      ],
    });
  }

  try {
    (globalThis as any).__cudeDesignCssVars = designSystemToCssVars(next);
    (globalThis as any).__cudeDesignSystem = next;
  } catch {}

  /* The tokens changed. Whether any screen looks right is not known from here. */
  updateAgentStatus('design', 'complete', `Tokens updated to v${next.meta.version}`);

  return next;
}

/**
 * Records something that looks wrong on screen.
 *
 * It reports and stops there. What it used to do was announce a repair and a
 * re-check, on timers, having done neither — so a person watched their
 * inconsistency get "fixed" while it was still on screen.
 */
export function reportVisualInconsistency(issue: string, component: string) {
  updateAgentStatus('visualQA', 'failed', `${issue} in ${component}`);
  setPipelineStatus('repairing');
}

function microDelay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
