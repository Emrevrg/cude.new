// Cude.new - api.chat.ts (Cude product surface, 2026)
import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createDataStream, generateId } from 'ai';
import { MAX_RESPONSE_SEGMENTS, type FileMap } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/cude/prompt';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import { normalizeProviderError } from '~/lib/modules/llm/provider-errors';
import { getFilePaths, selectContext } from '~/lib/.server/llm/select-context';
import type { ContextAnnotation, ProgressAnnotation } from '~/types/context';
import { WORK_DIR } from '~/utils/constants';
import { ARTIFACT_TAG } from '~/lib/cude/pipeline/artifactProtocol';
import { createSummary } from '~/lib/.server/llm/create-summary';
import { extractPropertiesFromMessage } from '~/lib/.server/llm/utils';
import type { DesignScheme } from '~/types/design-scheme';
import { MCPService } from '~/lib/services/mcpService';
import { StreamRecoveryManager } from '~/lib/.server/llm/stream-recovery';
import { THOUGHT_MARKER } from '~/lib/cude/pipeline/messageMarkers';

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

const logger = createScopedLogger('api.chat');

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest) {
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  /* Set when the provider has accepted the request and gone silent. */
  let streamWentQuiet = false;
  let quietReported = false;

  const streamRecovery = new StreamRecoveryManager({
    /*
     * Two different waits.
     *
     * Before the first token, the provider may be queueing on shared capacity
     * or — for a reasoning model — thinking, which puts nothing on the wire at
     * all. Kimi K3 spends minutes there before writing a line, and a single
     * 120-second allowance cut it off mid-build: the turn ended with every
     * file of the project created and empty.
     *
     * Once tokens are arriving, a two-minute gap really is a stall.
     */
    firstTokenTimeout: 420000,
    timeout: 120000,
    maxRetries: 2,
    onTimeout: () => {
      logger.warn('Stream timeout - attempting recovery');
      streamWentQuiet = true;
    },
  });

  const { messages, files, promptId, contextOptimization, supabase, chatMode, designScheme, maxLLMSteps } =
    await request.json<{
      messages: Messages;
      files: any;
      promptId?: string;
      contextOptimization: boolean;
      chatMode: 'discuss' | 'build';
      designScheme?: DesignScheme;
      supabase?: {
        isConnected: boolean;
        hasSelectedProject: boolean;
        credentials?: {
          anonKey?: string;
          supabaseUrl?: string;
        };
      };
      maxLLMSteps: number;
    }>();

  /*
   * The model the caller asked for, read once so the error messages below can
   * name it. `extractPropertiesFromMessage` reads the [Model:]/[Provider:]
   * header the composer writes onto every message.
   */
  let chosenModel: string | undefined;
  let chosenProvider: string | undefined;

  try {
    const last = [...messages].reverse().find((entry) => entry.role === 'user');

    if (last) {
      const properties = extractPropertiesFromMessage(last);
      chosenModel = properties.model;
      chosenProvider = String((properties as { provider?: unknown }).provider ?? '') || undefined;
    }
  } catch {
    // The header is missing or malformed; the messages below fall back.
  }

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = JSON.parse(parseCookies(cookieHeader || '').apiKeys || '{}');
  const providerSettings: Record<string, IProviderSetting> = JSON.parse(
    parseCookies(cookieHeader || '').providers || '{}',
  );

  const stream = new SwitchableStream();

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };
  const encoder: TextEncoder = new TextEncoder();
  let progressCounter: number = 1;

  try {
    const mcpService = MCPService.getInstance();
    const totalMessageContent = messages.reduce((acc, message) => acc + message.content, '');
    logger.debug(`Total message length: ${totalMessageContent.split(' ').length}, words`);

    let lastChunk: string | undefined = undefined;

    const dataStream = createDataStream({
      async execute(dataStream) {
        streamRecovery.startMonitoring();

        /*
         * A provider that accepts the request and then says nothing.
         *
         * NVIDIA does this: no error, no tokens, for as long as you wait. All
         * that happened was a spinner turning, which reads as the tool being
         * broken rather than the provider being unresponsive. This says which
         * it is, once, when the wait has clearly gone on too long.
         */
        const quietWatch = setInterval(() => {
          if (!streamWentQuiet || quietReported) {
            return;
          }

          quietReported = true;
          dataStream.writeMessageAnnotation({
            type: 'progress',
            label: 'response',
            status: 'complete',
            order: 999,
            message: `${chosenProvider ?? 'The provider'} accepted the request but has sent nothing back. It may be busy, or "${chosenModel ?? 'this model'}" may not be available to your account — try another model.`,
          } satisfies ProgressAnnotation);
        }, 2000);

        const stopQuietWatch = () => clearInterval(quietWatch);

        const filePaths = getFilePaths(files || {});
        let filteredFiles: FileMap | undefined = undefined;
        let summary: string | undefined = undefined;
        let messageSliceId = 0;

        const processedMessages = await mcpService.processToolInvocations(messages, dataStream);

        if (processedMessages.length > 3) {
          messageSliceId = processedMessages.length - 3;
        }

        if (filePaths.length > 0 && contextOptimization) {
          logger.debug('Generating Chat Summary');
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Analysing Request',
          } satisfies ProgressAnnotation);

          // Create a summary of the chat
          logger.debug(`Messages count: ${processedMessages.length}`);

          summary = await createSummary({
            messages: [...processedMessages],
            env: context.cloudflare?.env,
            apiKeys,
            providerSettings,
            promptId,
            contextOptimization,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('createSummary token usage', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
              }
            },
          });
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'complete',
            order: progressCounter++,
            message: 'Analysis Complete',
          } satisfies ProgressAnnotation);

          dataStream.writeMessageAnnotation({
            type: 'chatSummary',
            summary,
            chatId: processedMessages.slice(-1)?.[0]?.id,
          } as ContextAnnotation);

          // Update context buffer
          logger.debug('Updating Context Buffer');
          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Determining Files to Read',
          } satisfies ProgressAnnotation);

          // Select context files
          logger.debug(`Messages count: ${processedMessages.length}`);
          filteredFiles = await selectContext({
            messages: [...processedMessages],
            env: context.cloudflare?.env,
            apiKeys,
            files,
            providerSettings,
            promptId,
            contextOptimization,
            summary,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('selectContext token usage', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
              }
            },
          });

          if (filteredFiles) {
            logger.debug(`files in context : ${JSON.stringify(Object.keys(filteredFiles))}`);
          }

          dataStream.writeMessageAnnotation({
            type: 'codeContext',
            files: Object.keys(filteredFiles).map((key) => {
              let path = key;

              if (path.startsWith(WORK_DIR)) {
                path = path.replace(WORK_DIR, '');
              }

              return path;
            }),
          } as ContextAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'complete',
            order: progressCounter++,
            message: 'Code Files Selected',
          } satisfies ProgressAnnotation);

          // logger.debug('Code Files Selected');
        }

        const options: StreamingOptions = {
          supabaseConnection: supabase,
          toolChoice: 'auto',
          tools: mcpService.toolsWithoutExecute,
          maxSteps: maxLLMSteps,
          onStepFinish: ({ toolCalls }) => {
            // add tool call annotations for frontend processing
            toolCalls.forEach((toolCall) => {
              mcpService.processToolCall(toolCall, dataStream);
            });
          },
          onFinish: async ({ text: content, finishReason, usage }) => {
            logger.debug('usage', JSON.stringify(usage));

            if (usage) {
              cumulativeUsage.completionTokens += usage.completionTokens || 0;
              cumulativeUsage.promptTokens += usage.promptTokens || 0;
              cumulativeUsage.totalTokens += usage.totalTokens || 0;
            }

            if (finishReason !== 'length') {
              dataStream.writeMessageAnnotation({
                type: 'usage',
                value: {
                  completionTokens: cumulativeUsage.completionTokens,
                  promptTokens: cumulativeUsage.promptTokens,
                  totalTokens: cumulativeUsage.totalTokens,
                },
              });

              /*
               * A build turn that wrote nothing is not a finished build.
               *
               * "Response Generated" was written whenever the model stopped for
               * any reason other than running out of room — including a reply
               * that explained a change in detail and never emitted the file.
               * That happened: a follow-up asking for a longer timer came back
               * with nine thousand tokens of engineering rationale, the page
               * unchanged, and a green tick. The person is then looking at a
               * completed build and an old product, with nothing connecting the
               * two.
               *
               * Discussing is a different mode and says nothing about files.
               */
              const wroteSomething = chatMode !== 'build' || content.includes(`<${ARTIFACT_TAG}`);

              dataStream.writeData({
                type: 'progress',
                label: 'response',

                /*
                 * The turn did complete — what did not happen is a file
                 * change, and that belongs in the words rather than in a
                 * status the rest of the interface reads as an error.
                 */
                status: 'complete',
                order: progressCounter++,
                message: wroteSomething ? 'Response Generated' : 'Replied without changing any files',
              } satisfies ProgressAnnotation);
              await new Promise((resolve) => setTimeout(resolve, 0));

              // stream.close();
              return;
            }

            if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
              throw Error('Cannot continue message: Maximum segments reached');
            }

            const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

            /*
             * `MAX_TOKENS` is the ceiling of the constant, not of this request.
             * The reply that hit the limit had been given 4096 by its model's
             * own reported output cap, and the log said 128000 — so the one
             * number that would have explained the truncation was the one
             * number not printed.
             */
            logger.info(`The reply ran out of room: continuing it (${switchesLeft} continuations left)`);

            const lastUserMessage = processedMessages.filter((x) => x.role == 'user').slice(-1)[0];
            const { model, provider } = extractPropertiesFromMessage(lastUserMessage);
            processedMessages.push({ id: generateId(), role: 'assistant', content });
            processedMessages.push({
              id: generateId(),
              role: 'user',
              content: `[Model: ${model}]\n\n[Provider: ${provider}]\n\n${CONTINUE_PROMPT}`,
            });

            const result = await streamText({
              messages: [...processedMessages],
              env: context.cloudflare?.env,
              options,
              apiKeys,
              files,
              providerSettings,
              promptId,
              contextOptimization,
              contextFiles: filteredFiles,
              chatMode,
              designScheme,
              summary,
              messageSliceId,
            });

            result.mergeIntoDataStream(dataStream);

            (async () => {
              for await (const part of result.fullStream) {
                if (part.type === 'error') {
                  const error: any = part.error;
                  logger.error(`${error}`);

                  return;
                }
              }
            })();

            return;
          },
        };

        dataStream.writeData({
          type: 'progress',
          label: 'response',
          status: 'in-progress',
          order: progressCounter++,
          message: 'Generating Response',
        } satisfies ProgressAnnotation);

        const result = await streamText({
          messages: [...processedMessages],
          env: context.cloudflare?.env,
          options,
          apiKeys,
          files,
          providerSettings,
          promptId,
          contextOptimization,
          contextFiles: filteredFiles,
          chatMode,
          designScheme,
          summary,
          messageSliceId,
        });

        (async () => {
          for await (const part of result.fullStream) {
            streamRecovery.updateActivity();

            if (part.type === 'error') {
              const error: any = part.error;
              logger.error('Streaming error:', error);
              streamRecovery.stop();

              // Enhanced error handling for common streaming issues
              if (error.message?.includes('Invalid JSON response')) {
                logger.error('Invalid JSON response detected - likely malformed API response');
              } else if (error.message?.includes('token')) {
                logger.error('Token-related error detected - possible token limit exceeded');
              }

              return;
            }
          }
          streamRecovery.stop();
          stopQuietWatch();
        })();
        result.mergeIntoDataStream(dataStream);
      },
      onError: (error: any) => {
        /*
         * Logged with the stack: the string returned below is all the client
         * ever sees, so without this an unfamiliar failure leaves no trace of
         * where it came from. The scoped logger stringifies its arguments, so
         * the stack is passed explicitly rather than as part of the error.
         */
        logger.error('Chat stream failed:', error instanceof Error ? (error.stack ?? error.message) : error);

        // Provide more specific error messages for common issues
        const errorMessage = error.message || 'Unknown error';
        const status = error?.statusCode ?? error?.status;

        /*
         * A provider's own status, said plainly.
         *
         * NVIDIA answers 404 for a model your account cannot reach and 410 for
         * one it has retired — both arrived here as "Custom error: Not Found",
         * which tells a person nothing they can act on. The model is named,
         * because the next thing anybody does is pick a different one.
         */
        if (status === 404) {
          return `Custom error: ${chosenProvider ?? 'The provider'} does not have "${chosenModel ?? 'this model'}" available to this account. Pick another model from the list.`;
        }

        if (status === 410) {
          return `Custom error: ${chosenProvider ?? 'The provider'} has retired "${chosenModel ?? 'this model'}". Pick a current model from the list.`;
        }

        /*
         * Out of credit, which is not something trying again will fix.
         *
         * OpenRouter answers 402 when the key has no funds for the chosen
         * model. It arrived here as "Request failed — try again", advice that
         * could only ever waste the person's time: the request will fail the
         * same way every time until they add credit or pick a model that costs
         * nothing.
         */
        if (status === 402) {
          return `Custom error: this ${chosenProvider ?? 'provider'} account has no credit for "${chosenModel ?? 'this model'}". Add credit, or pick a free model — trying again will not help.`;
        }

        /*
         * Said as unauthorized, not as missing. The generic API-key branch
         * below matches on the phrase "missing API key", which would tell a
         * person with a wrong key to go and add one — they have one, it is
         * just not accepted.
         */
        if (status === 401) {
          return `Custom error: Unauthorized. ${chosenProvider ?? 'The provider'} rejected the API key. Check the key and try again.`;
        }

        if (errorMessage.includes('model') && errorMessage.includes('not found')) {
          return 'Custom error: Invalid model selected. Please check that the model name is correct and available.';
        }

        if (errorMessage.includes('Invalid JSON response')) {
          return 'Custom error: The AI service returned an invalid response. This may be due to an invalid model name, API rate limiting, or server issues. Try selecting a different model or check your API key.';
        }

        if (
          errorMessage.includes('API key') ||
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('authentication')
        ) {
          return 'Custom error: Invalid or missing API key. Please check your API key configuration.';
        }

        if (errorMessage.includes('token') && errorMessage.includes('limit')) {
          return 'Custom error: Token limit exceeded. The conversation is too long for the selected model. Try using a model with larger context window or start a new conversation.';
        }

        if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
          return 'Custom error: API rate limit exceeded. Please wait a moment before trying again.';
        }

        if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
          return 'Custom error: Network error. Please check your internet connection and try again.';
        }

        return `Custom error: ${errorMessage}`;
      },
    }).pipeThrough(
      new TransformStream({
        transform: (chunk, controller) => {
          if (!lastChunk) {
            lastChunk = ' ';
          }

          if (typeof chunk === 'string') {
            if (chunk.startsWith('g') && !lastChunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "<div class=\\"${THOUGHT_MARKER}\\">"\n`));
            }

            if (lastChunk.startsWith('g') && !chunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "</div>\\n"\n`));
            }
          }

          lastChunk = chunk;

          let transformedChunk = chunk;

          if (typeof chunk === 'string' && chunk.startsWith('g')) {
            let content = chunk.split(':').slice(1).join(':');

            if (content.endsWith('\n')) {
              content = content.slice(0, content.length - 1);
            }

            transformedChunk = `0:${content}\n`;
          }

          // Convert the string stream to a byte stream
          const str = typeof transformedChunk === 'string' ? transformedChunk : JSON.stringify(transformedChunk);
          controller.enqueue(encoder.encode(str));
        },
      }),
    );

    return new Response(dataStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'Text-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    /*
     * Normalize before doing anything else. This decides retryability from the
     * failure kind instead of defaulting everything to retryable, and redacts
     * the message so a provider error carrying an Authorization header or a key
     * cannot reach the log or the client.
     */
    const normalized = normalizeProviderError(error, error?.provider);

    logger.error(`${normalized.kind}: ${normalized.title}`, {
      statusCode: normalized.statusCode,
      retryable: normalized.retryable,
      detail: normalized.detail,
    });

    const errorResponse = {
      error: true,
      kind: normalized.kind,
      message: normalized.message,
      title: normalized.title,
      actions: normalized.actions,
      detail: normalized.detail,
      statusCode: normalized.statusCode ?? 500,
      isRetryable: normalized.retryable,
      provider: error?.provider || 'unknown',
    };

    return new Response(JSON.stringify(errorResponse), {
      status: errorResponse.statusCode,
      headers: { 'Content-Type': 'application/json' },
      statusText: 'Error',
    });
  }
}
