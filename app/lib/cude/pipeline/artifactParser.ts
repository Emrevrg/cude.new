/**
 * Cude.new - streaming artifact parser.
 *
 * Turns a model response, arriving in fragments, into artifact and action
 * events. Two properties matter and both come from how responses actually
 * arrive:
 *
 *   - A tag can be split across fragments. The parser keeps unconsumed input
 *     and resumes from it, so `<cudeAct` followed later by `ion type="file">`
 *     is one tag, not prose.
 *   - File contents stream. A `file` action emits its content as it grows, so
 *     the workspace and the editor fill in while the model is still writing.
 *
 * The parser is per-conversation and keyed by message id, because a response
 * may be re-parsed from the beginning when a conversation is restored.
 */

import {
  ACTION_TAG,
  ARTIFACT_TAG,
  isActionTag,
  isArtifactTag,
  isKnownActionType,
  getActionFilePath,
  normalizeFileContent,
  parseAttributes,
  type CudeAction,
  type CudeArtifact,
} from './artifactProtocol';

export interface ArtifactEvent {
  messageId: string;
  artifact: CudeArtifact;
}

export interface ActionEvent {
  messageId: string;
  artifactId: string;
  actionId: string;
  action: CudeAction;
}

export interface ParserCallbacks {
  onArtifactOpen?: (event: ArtifactEvent) => void;
  onArtifactClose?: (event: ArtifactEvent) => void;
  onActionOpen?: (event: ActionEvent) => void;

  /** Called repeatedly as a file action's content grows. */
  onActionStream?: (event: ActionEvent) => void;
  onActionClose?: (event: ActionEvent) => void;
}

export interface ArtifactParserOptions {
  callbacks?: ParserCallbacks;

  /** Markup substituted for an artifact in the rendered message. */
  renderArtifact?: (artifact: CudeArtifact, messageId: string) => string;
}

interface MessageState {
  /** How far into the accumulated input this message has been consumed. */
  position: number;
  artifact?: CudeArtifact;
  action?: CudeAction;
  actionIndex: number;
  insideArtifact: boolean;
  insideAction: boolean;

  /** Tag the open action used, so it closes with the same name. */
  currentActionTag?: string;
}

function freshState(): MessageState {
  return {
    position: 0,
    actionIndex: 0,
    insideArtifact: false,
    insideAction: false,
  };
}

export class ArtifactParser {
  private _messages = new Map<string, MessageState>();

  constructor(private readonly _options: ArtifactParserOptions = {}) {}

  /**
   * Feed the full response text received so far for a message.
   *
   * Returns the prose to display: everything outside artifacts, with each
   * artifact replaced by whatever `renderArtifact` produces.
   */
  parse(messageId: string, input: string): string {
    const state = this._messages.get(messageId) ?? freshState();
    this._messages.set(messageId, state);

    let output = '';
    let i = state.position;

    while (i < input.length) {
      if (state.insideAction) {
        const closeTag = `</${state.currentActionTag ?? ACTION_TAG}>`;
        const close = input.indexOf(closeTag, i);
        const action = state.action as CudeAction;

        if (close !== -1) {
          action.content = this._finishContent(action, input.slice(i, close));
          this._emitActionClose(messageId, state);

          i = close + closeTag.length;
          state.insideAction = false;
          state.action = undefined;
          state.currentActionTag = undefined;
        } else {
          /*
           * Still streaming. Emit what has arrived so the workspace fills in
           * while the model is writing, but do not consume it: the closing tag
           * may still be split across fragments.
           */
          action.content = this._finishContent(action, input.slice(i));
          this._emitActionStream(messageId, state);
          break;
        }

        continue;
      }

      if (state.insideArtifact) {
        const opened = this._readTag(input, i, isActionTag);

        if (opened === 'incomplete') {
          break;
        }

        if (opened) {
          const attributes = parseAttributes(opened.body);
          const type = attributes.type ?? '';

          state.action = {
            type: isKnownActionType(type) ? type : 'shell',
            filePath: getActionFilePath(attributes),
            content: '',
          };
          state.currentActionTag = opened.tag;
          state.insideAction = true;
          state.actionIndex += 1;
          this._emitActionOpen(messageId, state);

          i = opened.end;
          continue;
        }

        const closeArtifact = this._findCloseTag(input, i, ARTIFACT_TAG);

        if (closeArtifact === 'incomplete') {
          break;
        }

        if (closeArtifact !== null) {
          this._options.callbacks?.onArtifactClose?.({
            messageId,
            artifact: state.artifact as CudeArtifact,
          });

          state.insideArtifact = false;
          state.artifact = undefined;
          i = closeArtifact;
          continue;
        }

        // Text between actions inside an artifact is not shown.
        i += 1;
        continue;
      }

      const opened = this._readTag(input, i, isArtifactTag);

      if (opened === 'incomplete') {
        break;
      }

      if (opened) {
        const attributes = parseAttributes(opened.body);
        const artifact: CudeArtifact = {
          id: attributes.id ?? `artifact-${this._messages.size}`,
          title: attributes.title ?? 'Untitled',
        };

        state.artifact = artifact;
        state.insideArtifact = true;
        this._options.callbacks?.onArtifactOpen?.({ messageId, artifact });

        output += this._options.renderArtifact?.(artifact, messageId) ?? '';
        i = opened.end;

        continue;
      }

      output += input[i];
      i += 1;
    }

    state.position = i;

    return output;
  }

  /** Forget a message, so re-parsing it starts clean. */
  reset(messageId?: string): void {
    if (messageId === undefined) {
      this._messages.clear();
      return;
    }

    this._messages.delete(messageId);
  }

  private _finishContent(action: CudeAction, raw: string): string {
    return action.type === 'file' ? normalizeFileContent(raw) : raw.trim();
  }

  private _emitActionOpen(messageId: string, state: MessageState) {
    this._options.callbacks?.onActionOpen?.(this._actionEvent(messageId, state));
  }

  private _emitActionStream(messageId: string, state: MessageState) {
    this._options.callbacks?.onActionStream?.(this._actionEvent(messageId, state));
  }

  private _emitActionClose(messageId: string, state: MessageState) {
    this._options.callbacks?.onActionClose?.(this._actionEvent(messageId, state));
  }

  private _actionEvent(messageId: string, state: MessageState): ActionEvent {
    return {
      messageId,
      artifactId: state.artifact?.id ?? '',
      actionId: String(state.actionIndex - 1),
      action: state.action as CudeAction,
    };
  }

  /**
   * Read an opening tag at `index`.
   *
   * Returns `'incomplete'` when the input ends mid-tag, so the caller stops and
   * waits for more rather than treating a partial tag as prose.
   */
  private _readTag(
    input: string,
    index: number,
    accept: (tag: string) => boolean,
  ): { tag: string; body: string; end: number } | null | 'incomplete' {
    if (input[index] !== '<' || input[index + 1] === '/') {
      return null;
    }

    const close = input.indexOf('>', index);

    if (close === -1) {
      return this._couldBecomeTag(input.slice(index), accept) ? 'incomplete' : null;
    }

    const inner = input.slice(index + 1, close);
    const tag = inner.split(/[\s>]/)[0];

    if (!accept(tag)) {
      return null;
    }

    return { tag, body: inner.slice(tag.length), end: close + 1 };
  }

  private _couldBecomeTag(fragment: string, accept: (tag: string) => boolean): boolean {
    const partial = fragment.slice(1).split(/[\s>]/)[0];

    for (const candidate of [ARTIFACT_TAG, ACTION_TAG]) {
      if (accept(candidate) && candidate.startsWith(partial)) {
        return true;
      }
    }

    return false;
  }

  /** Position just past a closing tag at `index`, if one is there. */
  private _findCloseTag(input: string, index: number, tag: string): number | null | 'incomplete' {
    if (input[index] !== '<' || input[index + 1] !== '/') {
      return null;
    }

    const close = input.indexOf('>', index);

    if (close === -1) {
      return 'incomplete';
    }

    const name = input.slice(index + 2, close).trim();

    return isArtifactTag(name) || name === tag ? close + 1 : null;
  }
}

/*
 * Shapes the workbench's action queue and the deploy surfaces consume. Kept
 * here so the parser owns the vocabulary of what it produces.
 */
export interface ArtifactCallbackData {
  messageId: string;
  id: string;
  title: string;
  type?: string;
  artifactId?: string;
}

export interface ActionCallbackData {
  artifactId: string;
  messageId: string;
  actionId: string;
  action: import('~/types/actions').CudeAction;
}
