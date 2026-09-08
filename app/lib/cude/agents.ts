/**
 * Cude.new - Multi-Agent Engineering Team
 * Definitions + pipeline + execution state.
 */

export const AGENT_IDS = [
  'analyst',
  'planner',
  'requirements',
  'stack',
  'productGraph',
  'design',
  'architect',
  'platform',
  'designReview',
  'builder',
  'integration',
  'tester',
  'visualQA',
  'qa',
  'repair',
  'reviewer',
  'security',
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export type AgentStatus = 'waiting' | 'working' | 'complete' | 'failed' | 'skipped';

export interface AgentDef {
  id: AgentId;
  label: string;
  role: string;
  description: string;
  icon: string;
}

export const AGENT_DEFS: Record<AgentId, AgentDef> = {
  analyst: {
    id: 'analyst',
    label: 'Product Analyst',
    role: 'Requirements',
    description: 'Understands user request and produces structured requirements.',
    icon: 'i-ph:clipboard-text',
  },
  planner: {
    id: 'planner',
    label: 'Planner',
    role: 'Planning',
    description: 'Splits work into tasks and determines dependencies.',
    icon: 'i-ph:list-checks',
  },
  requirements: {
    id: 'requirements',
    label: 'Requirements',
    role: 'Constraints',
    description: 'Extracts structured engineering constraints from the prompt.',
    icon: 'i-ph:list-checks',
  },
  stack: {
    id: 'stack',
    label: 'Stack Intelligence',
    role: 'Stack Decision',
    description: 'Scores candidates and selects the best stack for each target.',
    icon: 'i-ph:stack',
  },
  productGraph: {
    id: 'productGraph',
    label: 'Product Graph',
    role: 'System Graph',
    description: 'Builds the connected product family and shared services graph.',
    icon: 'i-ph:graph',
  },
  design: {
    id: 'design',
    label: 'Design Director',
    role: 'Design System',
    description: 'Defines visual language, tokens and component conventions before UI generation.',
    icon: 'i-ph:palette',
  },
  designReview: {
    id: 'designReview',
    label: 'Design Review',
    role: 'Approval Gate',
    description: 'Presents the proposed interface and waits for your approval before implementation begins.',
    icon: 'i-ph:eye',
  },
  architect: {
    id: 'architect',
    label: 'Architect',
    role: 'Architecture',
    description: 'Chooses platform, framework, structure and integrations.',
    icon: 'i-ph:blueprint',
  },
  builder: {
    id: 'builder',
    label: 'Builder',
    role: 'Implementation',
    description: 'Creates and modifies project files.',
    icon: 'i-ph:hammer',
  },
  integration: {
    id: 'integration',
    label: 'Integration',
    role: 'System Wiring',
    description: 'Wires shared services, contracts and cross-target integration.',
    icon: 'i-ph:plugs-connected',
  },
  platform: {
    id: 'platform',
    label: 'Platform Engineer',
    role: 'Platform Config',
    description: 'Handles manifest, native config, packaging.',
    icon: 'i-ph:gear',
  },
  tester: {
    id: 'tester',
    label: 'Tester',
    role: 'Build / Test',
    description: 'Runs builds, typechecks and tests.',
    icon: 'i-ph:flask',
  },
  visualQA: {
    id: 'visualQA',
    label: 'Visual QA',
    role: 'Consistency Review',
    description: 'Renders screens, checks tokens, reuse and responsive consistency.',
    icon: 'i-ph:eye',
  },
  qa: {
    id: 'qa',
    label: 'QA Agent',
    role: 'Verification',
    description: 'Tests application behavior (web/mobile/extension).',
    icon: 'i-ph:check-circle',
  },
  repair: {
    id: 'repair',
    label: 'Repair Agent',
    role: 'Self-Repair',
    description: 'Diagnoses failures and produces targeted fixes.',
    icon: 'i-ph:wrench',
  },
  reviewer: {
    id: 'reviewer',
    label: 'Reviewer',
    role: 'Review',
    description: 'Verifies requested scope and quality.',
    icon: 'i-ph:eye',
  },
  security: {
    id: 'security',
    label: 'Security Reviewer',
    role: 'Security',
    description: 'Static checks and secret review.',
    icon: 'i-ph:shield-check',
  },
};

export type PipelineStatus =
  | 'idle'
  | 'planning'
  | 'designing'
  | 'design_review'
  | 'design_approved'
  | 'building'
  | 'running'
  | 'testing'
  | 'repairing'
  | 'reviewing'
  | 'integrating'
  | 'needs_user_action'
  | 'verified'
  | 'failed'
  | 'cancelled';

export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  summary?: string;
  startedAt?: number;
  endedAt?: number;
}

export interface PipelineState {
  status: PipelineStatus;
  agents: AgentState[];
  repairAttempts: number;
  maxRepairAttempts: number;
  lastError?: string;
}

export const MAX_REPAIR_ATTEMPTS = 3;

export function createInitialPipeline(): PipelineState {
  return {
    status: 'idle',
    agents: AGENT_IDS.map((id) => ({ id, status: 'waiting' as AgentStatus })),
    repairAttempts: 0,
    maxRepairAttempts: MAX_REPAIR_ATTEMPTS,
  };
}

export const PIPELINE_ORDER: AgentId[] = [
  'analyst',
  'planner',
  'requirements',
  'stack',
  'productGraph',
  'design',
  'architect',
  'platform',
  'designReview',
  'builder',
  'integration',
  'tester',
  'visualQA',
  'qa',
  'repair',
  'reviewer',
  'security',
];

export function getNextAgent(current: AgentId | null): AgentId | null {
  if (!current) {
    return PIPELINE_ORDER[0];
  }

  const idx = PIPELINE_ORDER.indexOf(current);

  if (idx === -1 || idx === PIPELINE_ORDER.length - 1) {
    return null;
  }

  return PIPELINE_ORDER[idx + 1];
}
