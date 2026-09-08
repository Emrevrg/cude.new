// Cude.new - stream-text.ts (Cude product surface, 2026)
import { convertToCoreMessages, streamText as _streamText, type Message } from 'ai';
import { MAX_TOKENS, PROVIDER_COMPLETION_LIMITS, isReasoningModel, type FileMap } from './constants';
import { DEFAULT_MODEL, WORK_DIR } from '~/utils/constants';
import { DEFAULT_SERVER_PROVIDER, SERVER_PROVIDER_LIST } from './providerRegistry';
import type { IProviderSetting } from '~/types/model';
import { getPrompt, getDiscussPrompt } from '~/lib/cude/prompt';
import { allowedHTMLElements } from '~/utils/markdown';
import { LLMManager } from '~/lib/modules/llm/manager';
import { fetchModelRegistry, mergeRegistryModels } from '~/lib/cude/providers/modelRegistry';
import { createScopedLogger } from '~/utils/logger';
import { createFilesContext, extractPropertiesFromMessage } from './utils';

import type { DesignScheme } from '~/types/design-scheme';
import { THOUGHT_BLOCK } from '~/lib/cude/pipeline/messageMarkers';

export type Messages = Message[];

export interface StreamingOptions extends Omit<Parameters<typeof _streamText>[0], 'model'> {
  supabaseConnection?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };
}

const logger = createScopedLogger('stream-text');

/**
 * How much a single turn is allowed to write.
 *
 * Not what the model could write. Kimi K3 accepts a completion budget of
 * 131072, and asking for it stopped the answer arriving at all: NVIDIA took so
 * long to begin streaming that the request hit the stream timeout, and the
 * turn ended with every file of the generated project created and empty —
 * opened by the artifact, never filled.
 *
 * A build turn does not need six figures of output. The largest whole-project
 * responses seen here are a few thousand tokens; this leaves several times
 * that in hand, and keeps the provider answering promptly.
 */
export const TURN_COMPLETION_CEILING = 32000;

function getCompletionTokenLimit(modelDetails: any): number {
  // 1. If model specifies completion tokens, use that
  if (modelDetails.maxCompletionTokens && modelDetails.maxCompletionTokens > 0) {
    return Math.min(modelDetails.maxCompletionTokens, TURN_COMPLETION_CEILING);
  }

  // 2. Use provider-specific default
  const providerDefault = PROVIDER_COMPLETION_LIMITS[modelDetails.provider];

  if (providerDefault) {
    return Math.min(providerDefault, TURN_COMPLETION_CEILING);
  }

  // 3. Final fallback to MAX_TOKENS, but cap at reasonable limit for safety
  return Math.min(MAX_TOKENS, 16384);
}

function sanitizeText(text: string): string {
  let sanitized = text.replace(THOUGHT_BLOCK, '');
  sanitized = sanitized.replace(/<think>.*?<\/think>/s, '');
  sanitized = sanitized.replace(/<cudeAction type="file" filePath="package-lock\.json">[\s\S]*?<\/cudeAction>/g, '');

  return sanitized.trim();
}

export async function streamText(props: {
  messages: Omit<Message, 'id'>[];
  env?: Env;
  options?: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  contextFiles?: FileMap;
  summary?: string;
  messageSliceId?: number;
  chatMode?: 'discuss' | 'build';
  designScheme?: DesignScheme;
}) {
  const {
    messages,
    env: serverEnv,
    options,
    apiKeys,
    files,
    providerSettings,
    promptId,
    contextOptimization,
    contextFiles,
    summary,
    chatMode,
    designScheme,
  } = props;
  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_SERVER_PROVIDER.name;
  let processedMessages = messages.map((message) => {
    const newMessage = { ...message };

    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;
      newMessage.content = sanitizeText(content);
    } else if (message.role == 'assistant') {
      newMessage.content = sanitizeText(message.content);
    }

    // Sanitize all text parts in parts array, if present
    if (Array.isArray(message.parts)) {
      newMessage.parts = message.parts.map((part) =>
        part.type === 'text' ? { ...part, text: sanitizeText(part.text) } : part,
      );
    }

    return newMessage;
  });

  const provider = SERVER_PROVIDER_LIST.find((p) => p.name === currentProvider) || DEFAULT_SERVER_PROVIDER;
  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    let modelsList = [
      ...(provider.staticModels || []),
      ...(await LLMManager.getInstance().getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: serverEnv as any,
      })),
    ];

    /*
     * The registry, always — not only when discovery came back empty.
     *
     * The picker merges it unconditionally, so this list has to as well or the
     * two disagree about the same model. They did: NVIDIA's discovery reports
     * an id and nothing else, so Kimi K3 arrived here with the house default
     * 32k context and no idea it reasons, while the picker showed its real
     * 1M window. The send then used the wrong limit and the wrong parameters.
     *
     * It is not a cost worth avoiding — the registry is held in memory for an
     * hour, so this is a map lookup on all but the first call of the hour.
     */
    try {
      modelsList = mergeRegistryModels(modelsList, await fetchModelRegistry());
    } catch {
      // A smaller list, not a broken send.
    }

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    /*
     * Same provider first: the merged list spans every provider, and two of
     * them can publish the same model id with different limits.
     */
    modelDetails =
      modelsList.find((m) => m.name === currentModel && m.provider === provider.name) ??
      modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      // Check if it's a Google provider and the model name looks like it might be incorrect
      if (provider.name === 'Google' && currentModel.includes('2.5')) {
        throw new Error(
          `Model "${currentModel}" not found. Gemini 2.5 Pro doesn't exist. Available Gemini models include: gemini-1.5-pro, gemini-2.0-flash, gemini-1.5-flash. Please select a valid model.`,
        );
      }

      // Fallback to first model with warning
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  const dynamicMaxTokens = modelDetails ? getCompletionTokenLimit(modelDetails) : Math.min(MAX_TOKENS, 16384);

  // Use model-specific limits directly - no artificial cap needed
  const safeMaxTokens = dynamicMaxTokens;

  logger.info(
    `Token limits for model ${modelDetails.name}: maxTokens=${safeMaxTokens}, maxTokenAllowed=${modelDetails.maxTokenAllowed}, maxCompletionTokens=${modelDetails.maxCompletionTokens}`,
  );

  /*
   * Only connection state reaches the prompt. The inherited call passed live
   * database credentials into the system message, which put them into every
   * upstream request and into any transcript the user exported.
   */
  let systemPrompt = getPrompt(promptId, {
    cwd: WORK_DIR,
    allowedHtmlElements: allowedHTMLElements,
    designScheme,
    database: {
      isConnected: options?.supabaseConnection?.isConnected || false,
      hasSelectedProject: options?.supabaseConnection?.hasSelectedProject || false,
    },
  });

  if (chatMode === 'build' && contextFiles && contextOptimization) {
    const codeContext = createFilesContext(contextFiles, true);

    systemPrompt = `${systemPrompt}

    Below is the artifact containing the context loaded into context buffer for you to have knowledge of and might need changes to fullfill current user request.
    CONTEXT BUFFER:
    ---
    ${codeContext}
    ---
    `;

    if (summary) {
      systemPrompt = `${systemPrompt}
      below is the chat history till now
      CHAT SUMMARY:
      ---
      ${props.summary}
      ---
      `;

      if (props.messageSliceId) {
        processedMessages = processedMessages.slice(props.messageSliceId);
      } else {
        const lastMessage = processedMessages.pop();

        if (lastMessage) {
          processedMessages = [lastMessage];
        }
      }
    }
  }

  const effectiveLockedFilePaths = new Set<string>();

  if (files) {
    for (const [filePath, fileDetails] of Object.entries(files)) {
      if (fileDetails?.isLocked) {
        effectiveLockedFilePaths.add(filePath);
      }
    }
  }

  if (effectiveLockedFilePaths.size > 0) {
    const lockedFilesListString = Array.from(effectiveLockedFilePaths)
      .map((filePath) => `- ${filePath}`)
      .join('\n');
    systemPrompt = `${systemPrompt}

    IMPORTANT: The following files are locked and MUST NOT be modified in any way. Do not suggest or make any changes to these files. You can proceed with the request but DO NOT make any changes to these files specifically:
    ${lockedFilesListString}
    ---
    `;
  } else {
    /* Debug: the ordinary case, and it was printed on every request. */
    logger.debug('No locked files for this prompt.');
  }

  logger.info(`Sending llm call to ${provider.name} with model ${modelDetails.name}`);

  /*
   * Whether this request has to be shaped for OpenAI's reasoning API.
   *
   * Not the same question as "does this model reason". OpenAI's own o-series
   * and GPT-5 endpoints reject `temperature` and friends and count output
   * under a different parameter; every other provider — including the ones
   * serving reasoning models over an OpenAI-compatible surface — takes the
   * ordinary parameters.
   *
   * Conflating the two broke NVIDIA's Kimi K3 the moment the registry started
   * reporting it as reasoning, which it is. The request went out with
   * `maxCompletionTokens`, which the AI SDK has no such option for, so it was
   * dropped: no limit, altered parameters, and a turn that came back with
   * sixty-four tokens and no answer.
   */
  const usesOpenAiReasoningApi =
    (provider.name === 'OpenAI' || provider.name === 'Azure OpenAI') && isReasoningModel(modelDetails.name);

  logger.info(
    `Model "${modelDetails.name}" reasons: ${modelDetails.reasoning ?? 'unknown'}; OpenAI reasoning API: ${usesOpenAiReasoningApi}; maxTokens: ${safeMaxTokens}`,
  );

  // Validate token limits before API call
  if (safeMaxTokens > (modelDetails.maxTokenAllowed || 128000)) {
    logger.warn(
      `Token limit warning: requesting ${safeMaxTokens} tokens but model supports max ${modelDetails.maxTokenAllowed || 128000}`,
    );
  }

  /*
   * `maxTokens` is the AI SDK's option, whatever the provider calls it on the
   * wire — the OpenAI adapter translates it to `max_completion_tokens` for the
   * models that want that. Passing the wire name here means passing an option
   * that does not exist, and it is silently ignored.
   */
  const tokenParams = { maxTokens: safeMaxTokens };

  // Parameters OpenAI's reasoning endpoints reject outright.
  const filteredOptions =
    usesOpenAiReasoningApi && options
      ? Object.fromEntries(
          Object.entries(options).filter(
            ([key]) =>
              ![
                'temperature',
                'topP',
                'presencePenalty',
                'frequencyPenalty',
                'logprobs',
                'topLogprobs',
                'logitBias',
              ].includes(key),
          ),
        )
      : options || {};

  /*
   * Key names only, at debug level. The previous version serialized the whole
   * options object at info level on every request, which risks writing request
   * configuration (and anything a caller attached to it) into the logs.
   */
  logger.debug(
    `Stream options for "${modelDetails.name}": openAiReasoningApi=${usesOpenAiReasoningApi} kept=[${Object.keys(filteredOptions).join(',')}]`,
  );

  /*
   * Follow the model, not the request header.
   *
   * The lookup above searches every provider, so a stale cookie or a bare API
   * call can resolve a model owned by a different provider than the one asked
   * for — the fresh-install default was an OpenAI id paired with Anthropic.
   * Sending one vendor's model id through another vendor's client came back as
   * a confusing upstream server error. The owning provider's client is what can
   * actually serve it; without a key for that provider the call still fails,
   * but as an honest key-required error naming the right provider.
   */
  const activeProvider =
    modelDetails.provider !== provider.name
      ? (SERVER_PROVIDER_LIST.find((p) => p.name === modelDetails.provider) ?? provider)
      : provider;

  if (activeProvider !== provider) {
    logger.info(`Model "${modelDetails.name}" belongs to ${activeProvider.name}; sending there.`);
  }

  const streamParams = {
    model: activeProvider.getModelInstance({
      model: modelDetails.name,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
    system:
      chatMode === 'build'
        ? systemPrompt
        : getDiscussPrompt({ hasProject: (contextFiles && Object.keys(contextFiles).length > 0) || false }),
    ...tokenParams,
    messages: convertToCoreMessages(processedMessages as any),
    ...filteredOptions,

    // OpenAI's reasoning endpoints accept only this value.
    ...(usesOpenAiReasoningApi ? { temperature: 1 } : {}),
  };

  logger.debug(
    `Stream params for "${modelDetails.name}": [${Object.keys(streamParams)
      .filter((key) => !['model', 'messages', 'system'].includes(key))
      .join(',')}]`,
  );

  return await _streamText(streamParams);
}
