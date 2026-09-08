/**
 * Cude.new - artifact protocol.
 *
 * The wire format between the model and the workspace, as specified by
 * Cude.new's own system prompt: one artifact per response, containing actions
 * that write files or run commands.
 *
 *   <cudeArtifact id="..." title="...">
 *     <cudeAction type="file" filePath="src/App.tsx">...</cudeAction>
 *     <cudeAction type="shell">pnpm install</cudeAction>
 *   </cudeArtifact>
 *
 * The parser is a streaming state machine because responses arrive token by
 * token: a file's contents must reach the workspace as they are produced, not
 * after the whole response is complete.
 */

export const ARTIFACT_TAG = 'cudeArtifact';
export const ACTION_TAG = 'cudeAction';

export type CudeActionType = 'file' | 'shell' | 'start' | 'build';

export interface CudeAction {
  type: CudeActionType;

  /** Workspace-relative path, for a `file` action. */
  filePath?: string;
  content: string;
}

export interface CudeArtifact {
  id: string;
  title: string;
}

/** Parse the attributes of an opening tag body. */
export function parseAttributes(tagBody: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  /*
   * Small/free models regularly copy JSX, XML and HTML conventions into the
   * same response: filePath="...", filepath='...', or path=src/App.tsx. The
   * wire protocol is strict in the prompt, but rejecting an otherwise complete
   * file because its quotes differ makes one harmless formatting variation
   * abort the entire build. Accept the three ordinary attribute forms here;
   * path traversal is still rejected by the workspace layer.
   */
  const pattern = /([a-zA-Z_][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)')|\s*=([^\s>="']+))/g;

  for (const match of tagBody.matchAll(pattern)) {
    attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }

  return attributes;
}

/** Read the common spellings models use for a file action's path. */
export function getActionFilePath(attributes: Record<string, string>): string | undefined {
  return attributes.filePath ?? attributes.filepath ?? attributes.file_path ?? attributes.path;
}

/** Action types the runtime knows how to perform. */
const KNOWN_ACTION_TYPES: CudeActionType[] = ['file', 'shell', 'start', 'build'];

export function isKnownActionType(value: string): value is CudeActionType {
  return (KNOWN_ACTION_TYPES as string[]).includes(value);
}

/**
 * Strip a markdown fence the model wrapped file contents in.
 *
 * Models frequently produce ```ts ... ``` inside a file action. Writing the
 * fence into the file would break the file, so it is removed — but only when it
 * wraps the entire content, so a fence that is genuinely part of a markdown
 * document survives.
 */
export function stripWrappingCodeFence(content: string): string {
  const match = content.match(/^\s*```[\w-]*\r?\n([\s\S]*?)\r?\n?\s*```\s*$/);
  return match ? match[1] : content;
}

/** Undo the HTML escaping some models apply to angle brackets. */
export function unescapeTags(content: string): string {
  return content.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Normalize what a file action produced into what should land on disk. */
export function normalizeFileContent(raw: string): string {
  return unescapeTags(stripWrappingCodeFence(raw));
}

export function isArtifactTag(tag: string): boolean {
  return tag === ARTIFACT_TAG;
}

export function isActionTag(tag: string): boolean {
  return tag === ACTION_TAG;
}
