export type PreviewState =
  | { readonly phase: 'idle'; readonly generation: number }
  | { readonly phase: 'starting'; readonly generation: number; readonly requestId: string }
  | { readonly phase: 'ready'; readonly generation: number; readonly requestId: string; readonly url: string }
  | { readonly phase: 'failed'; readonly generation: number; readonly requestId: string; readonly message: string }
  | {
      readonly phase: 'stopped';
      readonly generation: number;
      readonly reason: 'user' | 'replaced' | 'workspace-closed';
    };

export type PreviewEvent =
  | { readonly type: 'START'; readonly requestId: string }
  | { readonly type: 'READY'; readonly requestId: string; readonly url: string }
  | { readonly type: 'FAIL'; readonly requestId: string; readonly message: string }
  | { readonly type: 'STOP'; readonly reason: 'user' | 'replaced' | 'workspace-closed' }
  | { readonly type: 'RESET' };

export function createPreviewState(): PreviewState {
  return Object.freeze({ phase: 'idle', generation: 0 });
}

export function previewReducer(state: PreviewState, event: PreviewEvent): PreviewState {
  switch (event.type) {
    case 'START': {
      const requestId = event.requestId.trim();

      if (!requestId) {
        throw new Error('A preview start requires a request id.');
      }

      return Object.freeze({ phase: 'starting', generation: state.generation + 1, requestId });
    }
    case 'READY':
      if (!isCurrentRequest(state, event.requestId)) {
        return state;
      }

      if (!isPreviewUrl(event.url)) {
        return Object.freeze({
          phase: 'failed',
          generation: state.generation,
          requestId: event.requestId,
          message: 'Preview returned an unsupported URL.',
        });
      }

      return Object.freeze({
        phase: 'ready',
        generation: state.generation,
        requestId: event.requestId,
        url: event.url,
      });
    case 'FAIL':
      if (!isCurrentRequest(state, event.requestId)) {
        return state;
      }

      return Object.freeze({
        phase: 'failed',
        generation: state.generation,
        requestId: event.requestId,
        message: event.message.trim() || 'Preview failed.',
      });
    case 'STOP':
      return state.phase === 'idle' || state.phase === 'stopped'
        ? state
        : Object.freeze({ phase: 'stopped', generation: state.generation, reason: event.reason });
    case 'RESET':
      return state.phase === 'idle' ? state : Object.freeze({ phase: 'idle', generation: state.generation });
    default:
      return unreachablePreviewEvent(event);
  }
}

function isCurrentRequest(
  state: PreviewState,
  requestId: string,
): state is Extract<PreviewState, { phase: 'starting' }> {
  return state.phase === 'starting' && state.requestId === requestId;
}

function isPreviewUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function unreachablePreviewEvent(event: never): never {
  throw new Error(`Unknown preview event: ${String(event)}`);
}
