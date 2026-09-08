/**
 * Cude.new - constants with no dependencies.
 *
 * Paths, protocol tags and cookie names. Deliberately importing nothing.
 *
 * These used to live beside the provider registry, which builds itself at
 * module scope — so importing a path constant to compute a relative filename
 * booted every LLM provider, the AWS SDK included. Anything that needs a
 * literal should be able to have one.
 */

/** Directory the workspace is mounted at, inside the runtime. */
export const WORK_DIR_NAME = 'project';
export const WORK_DIR = `/home/${WORK_DIR_NAME}`;

export const MODIFICATIONS_TAG_NAME = 'cude_file_modifications';

export const MODEL_REGEX = /^\[Model: (.*?)\]\n\n/;
export const PROVIDER_REGEX = /\[Provider: (.*?)\]\n\n/;

export const DEFAULT_MODEL = 'gpt-5.6';
export const PROMPT_COOKIE_KEY = 'cachedPrompt';

export const TOOL_EXECUTION_APPROVAL = {
  APPROVE: 'Yes, approved.',
  REJECT: 'No, rejected.',
} as const;

export const TOOL_NO_EXECUTE_FUNCTION = 'Error: No execute function found on tool';
export const TOOL_EXECUTION_DENIED = 'Error: User denied access to tool execution';
export const TOOL_EXECUTION_ERROR = 'Error: An error occurred while calling tool';
