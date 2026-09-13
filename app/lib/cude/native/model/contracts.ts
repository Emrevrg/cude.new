export type ModelMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type ModelContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly mediaType: string; readonly data: string }
  | { readonly type: 'tool-result'; readonly callId: string; readonly result: unknown; readonly isError?: boolean };

export interface ModelMessage {
  readonly role: ModelMessageRole;
  readonly content: readonly ModelContentPart[];
}

export interface ModelToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface ModelTarget {
  readonly providerId: string;
  readonly modelId: string;
}

export interface ModelRequest {
  readonly requestId: string;
  readonly target: ModelTarget;
  readonly messages: readonly ModelMessage[];
  readonly tools?: readonly ModelToolDefinition[];
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface ModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens?: number;
}

export type ModelFinishReason = 'stop' | 'length' | 'tool-call' | 'content-filter' | 'unknown';

export type ModelErrorCode =
  | 'cancelled'
  | 'authentication'
  | 'permission'
  | 'rate-limit'
  | 'quota'
  | 'invalid-request'
  | 'model-unavailable'
  | 'provider-unavailable'
  | 'timeout'
  | 'network'
  | 'unknown';

export interface NormalizedModelError {
  readonly code: ModelErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly providerId?: string;
  readonly status?: number;
  readonly cause?: unknown;
}

export type ModelAdapterEvent =
  | { readonly type: 'text-delta'; readonly text: string }
  | {
      readonly type: 'tool-call';
      readonly callId: string;
      readonly name: string;
      readonly arguments: Readonly<Record<string, unknown>>;
    }
  | { readonly type: 'usage'; readonly usage: ModelUsage }
  | { readonly type: 'completed'; readonly finishReason: ModelFinishReason };

interface StreamEventBase {
  readonly requestId: string;
  readonly sequence: number;
}

export type ModelStreamEvent =
  | (StreamEventBase & {
      readonly type: 'started';
      readonly target: ModelTarget;
    })
  | (StreamEventBase & { readonly type: 'text-delta'; readonly text: string })
  | (StreamEventBase & {
      readonly type: 'tool-call';
      readonly callId: string;
      readonly name: string;
      readonly arguments: Readonly<Record<string, unknown>>;
    })
  | (StreamEventBase & { readonly type: 'usage'; readonly usage: ModelUsage })
  | (StreamEventBase & { readonly type: 'completed'; readonly finishReason: ModelFinishReason })
  | (StreamEventBase & { readonly type: 'failed'; readonly error: NormalizedModelError });

export interface ModelAdapterContext {
  readonly signal: AbortSignal;
}

export interface ModelAdapter {
  readonly providerId: string;
  stream(request: ModelRequest, context: ModelAdapterContext): AsyncIterable<ModelAdapterEvent>;
}

export interface ModelStream {
  readonly events: AsyncIterable<ModelStreamEvent>;
  readonly signal: AbortSignal;
  cancel(reason?: unknown): void;
}
