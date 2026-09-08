/**
 * Cude.new - prompt selection.
 *
 * Cude.new ships one system prompt, because the prompt encodes the product's
 * pipeline and there is only one pipeline. The inherited implementation offered
 * three interchangeable variants of the same generic instruction set, which
 * meant the product's core behaviour was a user-selectable setting and two of
 * the three options did not describe Cude at all.
 *
 * The selection API is kept so existing callers and stored settings keep
 * working: an unknown or stale prompt id resolves to the Cude prompt rather
 * than throwing.
 */

import type { DesignScheme } from '~/types/design-scheme';
import { getCudeSystemPrompt } from './systemPrompt';

export { getCudeSystemPrompt, PROTOCOL } from './systemPrompt';
export { getDiscussPrompt, CONTINUE_PROMPT } from './discussPrompt';
export type { CudeSystemPromptOptions } from './systemPrompt';

export interface PromptOptions {
  cwd: string;
  allowedHtmlElements: string[];
  designScheme?: DesignScheme;
  database?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
  };
}

export interface PromptDescriptor {
  id: string;
  label: string;
  description: string;
}

export const CUDE_PROMPT_ID = 'cude';

const DESCRIPTORS: PromptDescriptor[] = [
  {
    id: CUDE_PROMPT_ID,
    label: 'Cude engineering pipeline',
    description: 'Requirements, architecture, design approval, build, test and repair.',
  },
];

/** Prompts the user may choose between. */
export function listPrompts(): PromptDescriptor[] {
  return [...DESCRIPTORS];
}

/**
 * Resolve a prompt by id.
 *
 * Unknown ids fall back rather than throwing: a stale id in a restored setting
 * must not be able to break a build request.
 */
export function getPrompt(_promptId: string | undefined, options: PromptOptions): string {
  return getCudeSystemPrompt({
    cwd: options.cwd,
    allowedHtmlElements: options.allowedHtmlElements,
    designScheme: options.designScheme,
    database: options.database,
  });
}
