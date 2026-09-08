/**
 * Cude.new - Self-Healing Build System
 */

export const MAX_REPAIR_ATTEMPTS = 3;

export type BuildStatus = 'idle' | 'installing' | 'building' | 'success' | 'failed' | 'repairing';

export interface BuildResult {
  status: BuildStatus;
  output: string;
  error?: string;
  durationMs?: number;
}

export function classifyError(output: string): 'dependency' | 'type' | 'syntax' | 'config' | 'unknown' {
  const lower = output.toLowerCase();

  if (
    lower.includes('cannot find module') ||
    lower.includes('module not found') ||
    lower.includes('package not found') ||
    lower.includes('failed to resolve')
  ) {
    return 'dependency';
  }

  if (lower.includes('type error') || (lower.includes('ts') && lower.includes('error'))) {
    return 'type';
  }

  if (lower.includes('syntaxerror') || lower.includes('unexpected token')) {
    return 'syntax';
  }

  if (lower.includes('manifest') || lower.includes('config') || lower.includes('vite') || lower.includes('remix')) {
    return 'config';
  }

  return 'unknown';
}

export function shouldRepair(result: BuildResult, attempts: number): boolean {
  return result.status === 'failed' && attempts < MAX_REPAIR_ATTEMPTS;
}

export function formatRepairPrompt(error: string, category: string, attempt: number): string {
  return `Build failed (attempt ${attempt}/${MAX_REPAIR_ATTEMPTS}). Category: ${category}. Error:\n${error.slice(0, 4000)}\nProvide targeted fix.`;
}
