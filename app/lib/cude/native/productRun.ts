/**
 * The Cude product-run protocol.
 *
 * This is intentionally a small, dependency-free domain module.  UI, model
 * providers, runtimes and persistence adapt to these values; none of them are
 * required to decide what a valid product delivery sequence is.
 */

export const PRODUCT_RUN_STAGES = [
  'brief',
  'architecture',
  'design-review',
  'building',
  'evidence',
  'released',
] as const;

export type ProductRunStage = (typeof PRODUCT_RUN_STAGES)[number];

export interface ProductBrief {
  readonly outcome: string;
  readonly audience: string;
  readonly constraints: readonly string[];
}

export interface ArchitectureDecision {
  readonly summary: string;
  readonly targets: readonly string[];
  readonly tradeoffs: readonly string[];
}

export interface DesignReview {
  readonly summary: string;
  readonly acceptanceCriteria: readonly string[];
}

export interface BuildRecord {
  readonly buildId: string;
  readonly succeeded: boolean;
  readonly summary: string;
}

export interface EvidenceRecord {
  readonly evidenceId: string;
  readonly kind: 'test' | 'preview' | 'accessibility' | 'security' | 'manual';
  readonly summary: string;
  readonly passed: boolean;
}

export interface ReleaseRecord {
  readonly releaseId: string;
  readonly destination: string;
  readonly summary: string;
}

export type ProductRunAction =
  | { readonly type: 'SUBMIT_BRIEF'; readonly brief: ProductBrief }
  | { readonly type: 'ACCEPT_ARCHITECTURE'; readonly architecture: ArchitectureDecision }
  | { readonly type: 'REQUEST_ARCHITECTURE_REVISION'; readonly reason: string }
  | { readonly type: 'APPROVE_DESIGN'; readonly design: DesignReview }
  | { readonly type: 'REQUEST_DESIGN_REVISION'; readonly reason: string }
  | { readonly type: 'RECORD_BUILD'; readonly build: BuildRecord }
  | { readonly type: 'CAPTURE_EVIDENCE'; readonly evidence: EvidenceRecord }
  | { readonly type: 'RELEASE'; readonly release: ReleaseRecord };

export interface ProductRunEvent {
  readonly sequence: number;
  readonly action: ProductRunAction['type'];
  readonly accepted: boolean;
  readonly from: ProductRunStage;
  readonly to: ProductRunStage;
  readonly reason?: string;
}

export interface ProductRunState {
  readonly id: string;
  readonly stage: ProductRunStage;
  readonly brief?: ProductBrief;
  readonly architecture?: ArchitectureDecision;
  readonly design?: DesignReview;
  readonly builds: readonly BuildRecord[];
  readonly evidence: readonly EvidenceRecord[];
  readonly release?: ReleaseRecord;
  readonly architectureRevisions: number;
  readonly designRevisions: number;
  readonly events: readonly ProductRunEvent[];
}

export function createProductRun(id: string): ProductRunState {
  if (!id.trim()) {
    throw new Error('A product run requires a stable id.');
  }

  return {
    id,
    stage: 'brief',
    builds: [],
    evidence: [],
    architectureRevisions: 0,
    designRevisions: 0,
    events: [],
  };
}

/** A pure reducer: equivalent state plus equivalent action always yields equivalent state. */
export function productRunReducer(state: ProductRunState, action: ProductRunAction): ProductRunState {
  switch (action.type) {
    case 'SUBMIT_BRIEF':
      return state.stage === 'brief'
        ? accepted(state, action, 'architecture', { brief: action.brief })
        : rejected(state, action, 'A brief can only be submitted at the start of a run.');

    case 'ACCEPT_ARCHITECTURE':
      return state.stage === 'architecture'
        ? accepted(state, action, 'design-review', { architecture: action.architecture })
        : rejected(state, action, 'Architecture can only be accepted after a brief.');

    case 'REQUEST_ARCHITECTURE_REVISION':
      return state.stage === 'architecture'
        ? accepted(state, action, 'architecture', { architectureRevisions: state.architectureRevisions + 1 })
        : rejected(state, action, 'Architecture revisions are only available during architecture.');

    case 'APPROVE_DESIGN':
      return state.stage === 'design-review'
        ? accepted(state, action, 'building', { design: action.design })
        : rejected(state, action, 'Design approval requires an accepted architecture.');

    case 'REQUEST_DESIGN_REVISION':
      return state.stage === 'design-review'
        ? accepted(state, action, 'design-review', { designRevisions: state.designRevisions + 1 })
        : rejected(state, action, 'Design revisions are only available during design review.');

    case 'RECORD_BUILD':
      if (state.stage !== 'building') {
        return rejected(state, action, 'Build results can only be recorded while building.');
      }

      return accepted(state, action, action.build.succeeded ? 'evidence' : 'building', {
        builds: [...state.builds, action.build],
      });

    case 'CAPTURE_EVIDENCE':
      return state.stage === 'evidence'
        ? accepted(state, action, 'evidence', { evidence: [...state.evidence, action.evidence] })
        : rejected(state, action, 'Evidence is collected after a successful build.');

    case 'RELEASE':
      if (state.stage !== 'evidence') {
        return rejected(state, action, 'A release requires completed evidence review.');
      }

      if (!state.evidence.some((item) => item.passed)) {
        return rejected(state, action, 'At least one passing evidence record is required before release.');
      }

      return accepted(state, action, 'released', { release: action.release });

    default:
      return unreachableAction(action);
  }
}

function accepted(
  state: ProductRunState,
  action: ProductRunAction,
  stage: ProductRunStage,
  changes: Partial<Omit<ProductRunState, 'id' | 'stage' | 'events'>>,
): ProductRunState {
  return {
    ...state,
    ...changes,
    stage,
    events: [...state.events, eventFor(state, action, true, stage)],
  };
}

function rejected(state: ProductRunState, action: ProductRunAction, reason: string): ProductRunState {
  return {
    ...state,
    events: [...state.events, eventFor(state, action, false, state.stage, reason)],
  };
}

function eventFor(
  state: ProductRunState,
  action: ProductRunAction,
  accepted: boolean,
  to: ProductRunStage,
  reason?: string,
): ProductRunEvent {
  return {
    sequence: state.events.length + 1,
    action: action.type,
    accepted,
    from: state.stage,
    to,
    ...(reason ? { reason } : {}),
  };
}

function unreachableAction(action: never): never {
  throw new Error(`Unknown product-run action: ${String(action)}`);
}
