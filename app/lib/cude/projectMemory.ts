/**
 * Cude.new - Project Memory
 * Inspectable structured memory for current project.
 */
import type { ProjectType } from './platform';
import type { AgentId } from './agents';
import type { DesignSystem } from './designSystem';

export interface ProjectMemory {
  id: string;
  createdAt: string;
  prompt: string;
  platform: ProjectType;
  framework?: string;
  requirements?: string[];
  architecture?: {
    platform: ProjectType;
    framework: string;
    structure: string;
    libraries: string[];
    dataLayer?: string;
  };
  dependencies?: string[];
  buildCommands?: string[];
  knownProblems?: string[];
  repairAttempts?: { agent: AgentId; error: string; fix: string; at: string }[];
  decisions?: { decision: string; reason: string; at: string }[];
  preferences?: Record<string, string>;
  designSystem?: DesignSystem;
  designSystemStatus?: 'none' | 'draft' | 'active' | 'modified' | 'validation_issue';
  designHistory?: { version: number; change: string; at: string }[];
}

export function createProjectMemory(prompt: string, platform: ProjectType): ProjectMemory {
  return {
    id: `cude-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    prompt,
    platform,
    requirements: [],
    dependencies: [],
    buildCommands: [],
    knownProblems: [],
    repairAttempts: [],
    decisions: [],
  };
}

export function addDecision(memory: ProjectMemory, decision: string, reason: string): ProjectMemory {
  return {
    ...memory,
    decisions: [...(memory.decisions ?? []), { decision, reason, at: new Date().toISOString() }],
  };
}
