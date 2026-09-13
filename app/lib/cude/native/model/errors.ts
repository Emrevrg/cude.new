import type { ModelErrorCode, NormalizedModelError } from './contracts';

export class ModelGatewayError extends Error {
  readonly code: ModelErrorCode;
  readonly retryable: boolean;
  readonly providerId?: string;
  readonly status?: number;

  constructor(
    code: ModelErrorCode,
    message: string,
    options: {
      readonly retryable?: boolean;
      readonly providerId?: string;
      readonly status?: number;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ModelGatewayError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.providerId = options.providerId;
    this.status = options.status;
  }
}

export function normalizeModelError(
  error: unknown,
  context: { readonly providerId?: string; readonly signal?: AbortSignal } = {},
): NormalizedModelError {
  if (context.signal?.aborted || isAbortError(error)) {
    return {
      code: 'cancelled',
      message: 'Model request was cancelled.',
      retryable: false,
      ...(context.providerId ? { providerId: context.providerId } : {}),
      cause: error,
    };
  }

  if (error instanceof ModelGatewayError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...((error.providerId ?? context.providerId) ? { providerId: error.providerId ?? context.providerId } : {}),
      ...(error.status === undefined ? {} : { status: error.status }),
      cause: error.cause,
    };
  }

  const status = httpStatusOf(error);
  const mapped = status === undefined ? undefined : fromHttpStatus(status);

  if (mapped) {
    return {
      ...mapped,
      message: safeMessage(error),
      ...(context.providerId ? { providerId: context.providerId } : {}),
      status,
      cause: error,
    };
  }

  if (error instanceof TypeError) {
    return {
      code: 'network',
      message: safeMessage(error),
      retryable: true,
      ...(context.providerId ? { providerId: context.providerId } : {}),
      cause: error,
    };
  }

  return {
    code: 'unknown',
    message: safeMessage(error),
    retryable: false,
    ...(context.providerId ? { providerId: context.providerId } : {}),
    cause: error,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function safeMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return typeof error === 'string' && error.trim() ? error : 'The model provider returned an unknown error.';
}

function httpStatusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined;
  }

  return typeof error.status === 'number' ? error.status : undefined;
}

function fromHttpStatus(status: number): Pick<NormalizedModelError, 'code' | 'retryable'> | undefined {
  if (status === 401) {
    return { code: 'authentication', retryable: false };
  }

  if (status === 402) {
    return { code: 'quota', retryable: false };
  }

  if (status === 403) {
    return { code: 'permission', retryable: false };
  }

  if (status === 408 || status === 504) {
    return { code: 'timeout', retryable: true };
  }

  if (status === 429) {
    return { code: 'rate-limit', retryable: true };
  }

  if (status === 404) {
    return { code: 'model-unavailable', retryable: false };
  }

  if (status >= 500) {
    return { code: 'provider-unavailable', retryable: true };
  }

  if (status >= 400) {
    return { code: 'invalid-request', retryable: false };
  }

  return undefined;
}
