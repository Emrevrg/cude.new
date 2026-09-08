/**
 * Cude.new - Provider error normalization
 *
 * One place that turns whatever a provider SDK throws into a small, typed shape
 * the rest of the application can reason about: what happened, whether it is
 * worth retrying, and what the user can do next.
 *
 * This module is deliberately provider-agnostic. It reads HTTP status codes and
 * provider error codes, which every supported provider exposes in some form, so
 * Anthropic, Gemini, local models and future adapters all benefit. Nothing here
 * imports a provider SDK.
 *
 * Two rules it exists to enforce:
 *   1. Credentials never travel in a normalized error.
 *   2. Non-retryable failures are never marked retryable, so a bad key or an
 *      unsupported model cannot turn into a retry storm.
 */

export type ProviderErrorKind =
  | 'missing_api_key'
  | 'authentication'
  | 'permission'
  | 'rate_limit'
  | 'quota'
  | 'model_unavailable'
  | 'context_length'
  | 'bad_request'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'server_error'
  | 'unknown';

export interface NormalizedProviderError {
  kind: ProviderErrorKind;

  /** Short human-readable title, e.g. "OpenAI rate limit reached". */
  title: string;

  /** One sentence explaining what happened. */
  message: string;

  /** Concrete steps the user can take. */
  actions: string[];

  /** HTTP status when the provider supplied one. */
  statusCode?: number;

  /** Whether retrying the identical request could plausibly succeed. */
  retryable: boolean;

  /** Provider display name, when known. */
  provider?: string;

  /** Redacted technical detail for the disclosure area. Never contains a key. */
  detail?: string;
}

/**
 * Credential shapes that must never survive into a normalized error, a log line
 * or the UI. These have no capture groups: the whole match is replaced.
 */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{16,}/g, // Anthropic (before the generic sk- rule)
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI and compatible
  /\bAIza[A-Za-z0-9_-]{30,}/g, // Google
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g, // GitHub
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS
  /\bnvapi-[A-Za-z0-9_-]{16,}/g, // NVIDIA
  /(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, // Authorization header values
];

/**
 * Credential-bearing fields, e.g. `"apiKey": "..."` or `x-api-key: ...`.
 * Group 1 is the key and separator, which is preserved so the shape of the
 * message survives; the value is replaced.
 */
const SECRET_FIELD_PATTERN = /((?:api[-_]?key|apikey|authorization|x-api-key)"?\s*[:=]\s*"?)([^"\s,}]+)/gi;

/**
 * Removes anything credential-shaped from a string.
 *
 * Note on `String.replace` with a function: for a pattern with no capture
 * groups the second callback argument is the match *offset*, not a group. An
 * earlier version treated it as a group and emitted the offset plus the whole
 * input. Value patterns and field patterns are therefore handled separately.
 */
export function redactSecrets(input: string): string {
  let out = input;

  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }

  out = out.replace(SECRET_FIELD_PATTERN, (_match, prefix: string) => `${prefix}[REDACTED]`);

  return out;
}

/** Kinds where sending the identical request again cannot help. */
const NON_RETRYABLE: ReadonlySet<ProviderErrorKind> = new Set<ProviderErrorKind>([
  'missing_api_key',
  'authentication',
  'permission',
  'quota',
  'model_unavailable',
  'context_length',
  'bad_request',
  'aborted',
]);

interface ErrorLike {
  message?: string;
  statusCode?: number;
  status?: number;
  name?: string;
  code?: string;
  cause?: unknown;
  responseBody?: string;
  data?: { error?: { code?: string; type?: string; message?: string } };
}

function readStatus(error: ErrorLike): number | undefined {
  const status = error.statusCode ?? error.status;

  return typeof status === 'number' ? status : undefined;
}

/** Provider error codes are more reliable than status alone where present. */
function readProviderCode(error: ErrorLike): string {
  return (error.data?.error?.code ?? error.data?.error?.type ?? error.code ?? '').toString().toLowerCase();
}

function classify(error: ErrorLike, text: string): ProviderErrorKind {
  const status = readStatus(error);
  const code = readProviderCode(error);
  const name = (error.name ?? '').toLowerCase();

  if (name === 'aborterror' || code === 'abort_err' || /\baborted\b|\bcancell?ed\b/.test(text)) {
    return 'aborted';
  }

  // Provider codes first — they disambiguate cases that share a status.
  if (code.includes('insufficient_quota') || code === 'billing_hard_limit_reached') {
    return 'quota';
  }

  if (code === 'context_length_exceeded' || code === 'string_above_max_length') {
    return 'context_length';
  }

  if (code === 'model_not_found' || code === 'invalid_model') {
    return 'model_unavailable';
  }

  if (code === 'invalid_api_key' || code === 'authentication_error') {
    return 'authentication';
  }

  if (code === 'rate_limit_exceeded') {
    return 'rate_limit';
  }

  if (status === 401) {
    return 'authentication';
  }

  if (status === 403) {
    return 'permission';
  }

  if (status === 404) {
    return 'model_unavailable';
  }

  if (status === 429) {
    // OpenAI returns 429 for both throttling and exhausted billing.
    return /quota|billing|insufficient/.test(text) ? 'quota' : 'rate_limit';
  }

  /*
   * Seen live against OpenRouter: a key without funds for the chosen model
   * answers 402, which used to surface as a generic rejected request.
   */
  if (status === 402) {
    return 'quota';
  }

  if (status !== undefined && status >= 500) {
    return 'server_error';
  }

  // Message heuristics for SDKs that do not surface a status.
  if (/context length|maximum context|too many tokens|reduce the length/.test(text)) {
    return 'context_length';
  }

  if (/insufficient[_ ]quota|exceeded your current quota|billing/.test(text)) {
    return 'quota';
  }

  if (/rate limit|too many requests/.test(text)) {
    return 'rate_limit';
  }

  if (/missing api key|no api key|api key is required|apikey.*required/.test(text)) {
    return 'missing_api_key';
  }

  if (/invalid api key|incorrect api key|unauthorized|invalid_api_key/.test(text)) {
    return 'authentication';
  }

  if (/does not exist|model not found|unknown model|unsupported model|no models? found/.test(text)) {
    return 'model_unavailable';
  }

  if (/timeout|timed out|etimedout/.test(text)) {
    return 'timeout';
  }

  if (/fetch failed|network|econnreset|enotfound|socket hang up|econnrefused/.test(text)) {
    return 'network';
  }

  if (status !== undefined && status >= 400) {
    return 'bad_request';
  }

  return 'unknown';
}

/** Title and recovery guidance per failure kind. */
function describe(kind: ProviderErrorKind, provider: string): { title: string; message: string; actions: string[] } {
  switch (kind) {
    case 'missing_api_key':
      return {
        title: `${provider} API key required`,
        message: `Add your own ${provider} API key to use this provider.`,
        actions: [
          `Open the provider row beneath the composer and choose Configure.`,
          `Keys are stored only in this browser and are never written to the project or an export.`,
        ],
      };
    case 'authentication':
      return {
        title: `${provider} rejected the API key`,
        message: `${provider} did not accept the credentials Cude sent.`,
        actions: [
          'Check the key is correct and has not been revoked.',
          `Confirm the key belongs to ${provider} and not another provider.`,
          'Update it from the provider row beneath the composer.',
        ],
      };
    case 'permission':
      return {
        title: `${provider} denied access`,
        message: `This key is valid but is not permitted to use the selected model or endpoint.`,
        actions: ['Check the key’s scopes or project permissions.', 'Select a model your account is allowed to use.'],
      };
    case 'rate_limit':
      return {
        title: `${provider} rate limit reached`,
        message: `${provider} is throttling requests for this key.`,
        actions: ['Wait briefly and try again.', 'Select another provider or model to continue now.'],
      };
    case 'quota':
      return {
        title: `${provider} quota exhausted`,
        message: `The billing quota for this ${provider} account is used up.`,
        actions: [
          `Add credit or raise the limit in the ${provider} dashboard.`,
          'Switch to another provider to continue.',
        ],
      };
    case 'model_unavailable':
      return {
        title: 'Model unavailable',
        message: `${provider} does not offer the selected model to this account.`,
        actions: ['Pick a different model in the model selector.', 'Check the model is enabled for your account tier.'],
      };
    case 'context_length':
      return {
        title: 'Conversation too long for this model',
        message: 'The request exceeded the selected model’s context window.',
        actions: [
          'Start a new chat, or remove large files from the context.',
          'Select a model with a larger context window.',
        ],
      };
    case 'bad_request':
      return {
        title: `${provider} rejected the request`,
        message: 'The request was malformed or used an unsupported option for this model.',
        actions: ['Try a different model.', 'Open the technical details below if this repeats.'],
      };
    case 'network':
      return {
        title: `Could not reach ${provider}`,
        message: 'The network request did not complete.',
        actions: ['Check your network connection.', `Check ${provider}’s status page if this persists.`],
      };
    case 'timeout':
      return {
        title: `${provider} timed out`,
        message: `${provider} did not respond in time.`,
        actions: ['Send the request again.', 'Try a smaller prompt or a faster model if it repeats.'],
      };
    case 'aborted':
      return {
        title: 'Request stopped',
        message: 'The request was cancelled before it finished.',
        actions: ['Send it again when you are ready.'],
      };
    case 'server_error':
      return {
        title: `${provider} is unavailable`,
        message: `${provider} returned a server error.`,
        actions: ['Wait a moment and try again.', 'Switch provider if the outage continues.'],
      };
    default:
      return {
        title: 'Request failed',
        message: 'The request could not be completed.',
        actions: ['Try again.', 'Open the technical details below if the problem repeats.'],
      };
  }
}

/**
 * Turns any thrown provider value into a {@link NormalizedProviderError}.
 *
 * Always safe to surface: the message and detail are redacted, and `retryable`
 * is derived from the failure kind rather than assumed.
 */
export function normalizeProviderError(error: unknown, providerName = 'The provider'): NormalizedProviderError {
  const errorLike: ErrorLike = (typeof error === 'object' && error !== null ? error : {}) as ErrorLike;

  const rawMessage =
    (typeof error === 'string' ? error : undefined) ??
    errorLike.message ??
    errorLike.data?.error?.message ??
    (error instanceof Error ? error.message : '') ??
    '';

  const searchText = `${rawMessage} ${errorLike.responseBody ?? ''} ${readProviderCode(errorLike)}`.toLowerCase();

  const kind = classify(errorLike, searchText);
  const { title, message, actions } = describe(kind, providerName);
  const statusCode = readStatus(errorLike);

  const detail = rawMessage ? redactSecrets(String(rawMessage)).slice(0, 600) : undefined;

  return {
    kind,
    title,
    message,
    actions,
    statusCode,
    retryable: !NON_RETRYABLE.has(kind),
    provider: providerName,
    detail,
  };
}

/** True when retrying the identical request could plausibly succeed. */
export function isRetryableProviderError(error: unknown, providerName?: string): boolean {
  return normalizeProviderError(error, providerName).retryable;
}
