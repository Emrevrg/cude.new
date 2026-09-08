// Cude.new - Chat.client.tsx (Cude product surface, 2026)
import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clearComposer, prependToComposer, readComposerText, setComposerText } from '~/lib/cude/state/composer';
import { toast } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '~/lib/hooks';
import {
  conversationDescription as description,
  useConversationHistory as useChatHistory,
} from '~/lib/cude/state/useConversationHistory';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { cudeEventLog } from '~/lib/cude/state/eventLog';
import { SELECTED_ELEMENT_MARKER } from '~/lib/cude/pipeline/messageMarkers';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROMPT_COOKIE_KEY, PROVIDER_LIST } from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import Cookies from 'js-cookie';
import { debounce } from '~/utils/debounce';
import { useSettings } from '~/lib/hooks/useSettings';
import type { ProviderInfo } from '~/types/model';
import { useSearchParams } from '@remix-run/react';
import { createSampler } from '~/utils/sampler';
import { getTemplates, selectStarterTemplate } from '~/utils/selectStarterTemplate';
import { logStore } from '~/lib/cude/state/logStoreAdapter';
import { normalizeProviderError } from '~/lib/modules/llm/provider-errors';
import { streamingState } from '~/lib/stores/streaming';
import { filesToArtifacts } from '~/utils/fileUtils';
import { supabaseProject } from '~/lib/cude/state/supabaseProject';
import { serviceConnections } from '~/lib/cude/state/serviceConnections';
import { defaultDesignScheme, type DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import type { TextUIPart, FileUIPart, Attachment } from '@ai-sdk/ui-utils';
import { useMCPStore } from '~/lib/stores/mcp';
import type { LlmErrorAlertType } from '~/types/actions';
import {
  startCudePipeline,
  completeBuilderIfFilesExist,
  reportBuildResult,
  bindPipelineToWorkbench,
} from '~/lib/cude/orchestrator';
import { setPipelineStatus, updateAgentStatus } from '~/lib/stores/cude';

const logger = createScopedLogger('Chat');

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);
  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
  }, [initialMessages]);

  return (
    <>
      {ready && (
        <ChatImpl
          description={title}
          initialMessages={initialMessages}
          exportChat={exportChat}
          storeMessageHistory={storeMessageHistory}
          importChat={importChat}
        />
      )}
    </>
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    storeMessageHistory: (messages: Message[]) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory } = options;
    parseMessages(messages, isLoading);

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  },
  50,
);

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

export const ChatImpl = memo(
  ({ description, initialMessages, storeMessageHistory, importChat, exportChat }: ChatProps) => {
    useShortcuts();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();

    /*
     * True while Cude is choosing a starter template, before the chat request
     * begins. `useChat`'s own loading flag does not cover that, and it is real
     * work — the previous name for this was `fakeLoading`.
     */
    const [preparing, setPreparing] = useState(false);
    const files = useStore(workbenchStore.files);
    const [designScheme, setDesignScheme] = useState<DesignScheme>(defaultDesignScheme);
    const actionAlert = useStore(workbenchStore.alert);
    const deployAlert = useStore(workbenchStore.deployAlert);
    const supabaseState = useStore(supabaseProject.state);
    const supabaseStatuses = useStore(serviceConnections.statuses);
    const supabaseAlert = useStore(workbenchStore.supabaseAlert);
    const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled } = useSettings();
    const [llmErrorAlert, setLlmErrorAlert] = useState<LlmErrorAlertType | undefined>(undefined);
    const requestFailureRef = useRef<{ message: string } | null>(null);
    const [model, setModel] = useState(() => {
      const savedModel = Cookies.get('selectedModel');

      if (savedModel) {
        return savedModel;
      }

      /*
       * A fresh install has no saved model, so the default must belong to the
       * default provider. Pairing the global default model (an OpenAI id) with
       * the default provider (Anthropic) sent another vendor's model id to the
       * wrong API and came back as a confusing server error on the first send.
       */
      const savedProvider = Cookies.get('selectedProvider');
      const initialProvider = PROVIDER_LIST.find((p) => p.name === savedProvider) || DEFAULT_PROVIDER;

      return initialProvider.staticModels?.[0]?.name || DEFAULT_MODEL;
    });
    const [provider, setProvider] = useState(() => {
      const savedProvider = Cookies.get('selectedProvider');
      return (PROVIDER_LIST.find((p) => p.name === savedProvider) || DEFAULT_PROVIDER) as ProviderInfo;
    });
    const { showChat, started } = useStore(chatStore);
    const [animationScope, animate] = useAnimate();

    /*
     * chatStore.started is the authoritative signal that a session is underway.
     * Keep the local flag in step with it so anything that starts a session
     * through the store mounts the workbench too.
     */
    useEffect(() => {
      if (started) {
        setChatStarted(true);
      }
    }, [started]);

    // Bind orchestrator to real workbench events once
    useEffect(() => {
      bindPipelineToWorkbench();

      // Expose for e2e harness / manual verification
      (window as any).__cudeReportBuild = reportBuildResult;
      (window as any).__cudeCompleteBuilder = completeBuilderIfFilesExist;
    }, []);

    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
    const [chatMode, setChatMode] = useState<'discuss' | 'build'>('build');
    const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
    const mcpSettings = useMCPStore((state) => state.settings);

    const {
      messages,
      isLoading,
      stop,
      append,
      setMessages,
      reload,
      error,
      data: chatData,
      setData,
      addToolResult,
    } = useChat({
      api: '/api/chat',
      body: {
        apiKeys,
        files,
        promptId,
        contextOptimization: contextOptimizationEnabled,
        chatMode,
        designScheme,
        supabase: {
          isConnected: supabaseStatuses.supabase?.status === 'connected',
          hasSelectedProject: Boolean(supabaseState.projectId),
          credentials: {
            supabaseUrl: supabaseState.credentials?.supabaseUrl,
            anonKey: supabaseState.credentials?.anonKey,
          },
        },
        maxLLMSteps: mcpSettings.maxLLMSteps,
      },
      sendExtraMessageFields: true,
      onError: (e) => {
        setPreparing(false);
        handleError(e, 'chat');
      },
      onFinish: (message, response) => {
        const usage = response.usage;
        setData(undefined);

        if (usage) {
          logStore.logProvider('Chat response completed', {
            component: 'Chat',
            action: 'response',
            model,
            provider: provider.name,
            usage,
            messageLength: message.content.length,
          });
        }

        logger.debug('Finished streaming');
      },
      initialMessages,
      initialInput: Cookies.get(PROMPT_COOKIE_KEY) || '',
    });
    useEffect(() => {
      const prompt = searchParams.get('prompt');

      // console.log(prompt, searchParams, model, provider);

      if (prompt) {
        setSearchParams({});
        runAnimation();
        append({
          role: 'user',
          content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${prompt}`,
        });
      }
    }, [model, provider, searchParams]);

    const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages } = useMessageParser();

    useEffect(() => {
      chatStore.setKey('started', initialMessages.length > 0);
    }, []);

    useEffect(() => {
      processSampledMessages({
        messages,
        initialMessages,
        isLoading,
        parseMessages,
        storeMessageHistory,
      });
    }, [messages, isLoading, parseMessages]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      stop();
      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: provider.name,
      });
    };

    const handleError = useCallback(
      (error: any, context: 'chat' | 'template' | 'llmcall' = 'chat') => {
        logger.error(`${context} request failed`, error);

        stop();
        setPreparing(false);

        let errorInfo: {
          message: string;
          isRetryable: boolean;
          statusCode?: number;
          provider: string;
          type: 'unknown';
          retryDelay: number;
        } = {
          message: 'An unexpected error occurred',
          isRetryable: true,

          /*
           * No status until something supplies one. This used to default to
           * 500, which made the classifier report every unclassified failure
           * as a provider outage — "NVIDIA is unavailable, wait and retry" —
           * when the real problem was a missing key or an unknown model. The
           * message heuristics below can only do their job on an unknown
           * status.
           */
          statusCode: undefined,
          provider: provider.name,
          type: 'unknown' as const,
          retryDelay: 0,
        };

        if (error.message) {
          try {
            const parsed = JSON.parse(error.message);

            if (parsed.error || parsed.message) {
              errorInfo = { ...errorInfo, ...parsed };
            } else {
              errorInfo.message = error.message;
            }
          } catch {
            errorInfo.message = error.message;
          }
        }

        /*
         * One normalizer for every provider, shared with the server route. The
         * client previously repeated this classification inline, which meant two
         * places to keep in step. It also redacts, so nothing credential-shaped
         * reaches the log or the alert.
         */
        const normalized = normalizeProviderError(
          { message: errorInfo.message, statusCode: errorInfo.statusCode },
          provider.name,
        );

        /*
         * A failed provider request ends the active build. Keeping the header
         * on "Building" after the stream has stopped makes the product look
         * frozen and prevents the user from understanding what to do next.
         */
        setPipelineStatus('needs_user_action');
        updateAgentStatus('builder', 'failed', normalized.message);
        requestFailureRef.current = { message: normalized.message };

        logStore.logError(`${context} request failed`, error, {
          component: 'Chat',
          action: 'request',
          error: normalized.detail,
          context,
          retryable: normalized.retryable,
          errorType: normalized.kind,
          provider: provider.name,
        });

        setLlmErrorAlert({
          /*
           * Amber, not red, when nothing is broken: a missing or rejected key
           * and an unavailable model are instructions, not outages, and a red
           * alarm box for the default state of a fresh install reads as a
           * crash. Anything else keeps the red tone.
           */
          type:
            normalized.kind === 'missing_api_key' ||
            normalized.kind === 'authentication' ||
            normalized.kind === 'model_unavailable'
              ? 'warning'
              : 'error',
          title: normalized.title,
          description: normalized.message,
          actions: normalized.actions,
          detail: normalized.detail,
          provider: provider.name,
          errorType: normalized.kind,
        });
        setData([]);
      },
      [provider.name, stop],
    );

    const clearApiErrorAlert = useCallback(() => {
      setLlmErrorAlert(undefined);
    }, []);

    const runAnimation = async () => {
      if (chatStarted) {
        return;
      }

      /*
       * The view changes first, then it animates.
       *
       * This used to await both animations before setting `started`, so the
       * whole transition hung on two promises resolving. While the pipeline
       * was running its first phase, a person sat looking at the landing page
       * with a status badge and no sign of the message they had just sent —
       * no bubble, no composer moving down, nothing. Whether an animation
       * finishes is not something the app's state should depend on.
       */
      chatStore.setKey('started', true);
      setChatStarted(true);

      /*
       * Keep the first response in one readable conversation. The workbench
       * is still mounted and remains one click away from an artifact, but it
       * must not cover the chat as soon as the model starts writing files.
       * This also removes the expensive editor/terminal paint from the first
       * send on lower-memory machines.
       */
      workbenchStore.showWorkbench.set(true);

      await Promise.all([
        animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
        animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
      ]).catch(() => undefined);
    };

    // Helper function to create message parts array from text and images
    const createMessageParts = (text: string, images: string[] = []): Array<TextUIPart | FileUIPart> => {
      // Create an array of properly typed message parts
      const parts: Array<TextUIPart | FileUIPart> = [
        {
          type: 'text',
          text,
        },
      ];

      // Add image parts if any
      images.forEach((imageData) => {
        // Extract correct MIME type from the data URL
        const mimeType = imageData.split(';')[0].split(':')[1] || 'image/jpeg';

        // Create file part according to AI SDK format
        parts.push({
          type: 'file',
          mimeType,
          data: imageData.replace(/^data:image\/[^;]+;base64,/, ''),
        });
      });

      return parts;
    };

    // Helper function to convert File[] to Attachment[] for AI SDK
    const filesToAttachments = async (files: File[]): Promise<Attachment[] | undefined> => {
      if (files.length === 0) {
        return undefined;
      }

      const attachments = await Promise.all(
        files.map(
          (file) =>
            new Promise<Attachment>((resolve) => {
              const reader = new FileReader();

              reader.onloadend = () => {
                resolve({
                  name: file.name,
                  contentType: file.type,
                  url: reader.result as string,
                });
              };
              reader.readAsDataURL(file);
            }),
        ),
      );

      return attachments;
    };

    const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
      const messageContent = messageInput || readComposerText();

      if (!messageContent?.trim()) {
        return;
      }

      if (isLoading) {
        abort();
        return;
      }

      let finalMessageContent = messageContent;

      if (selectedElement) {
        const elementInfo = `<div class="${SELECTED_ELEMENT_MARKER}" data-element='${JSON.stringify(selectedElement)}'>${JSON.stringify(`${selectedElement.displayText}`)}</div>`;
        finalMessageContent = messageContent + elementInfo;
      }

      /*
       * The composer is emptied now, not once the send finishes.
       *
       * Everything below — the pipeline, the starter-template choice, the
       * repository download — takes seconds, and until this moved up the text
       * sat in the box the whole time, reading as if Enter had done nothing.
       * The message was already captured above, so there is nothing to lose.
       */
      clearComposer();
      Cookies.remove(PROMPT_COOKIE_KEY);
      requestFailureRef.current = null;

      runAnimation();

      /*
       * The pipeline runs alongside the message rather than in front of it.
       * Awaiting it here meant the send waited on a design review that talks
       * to a model — seconds, sometimes more — before anything appeared.
       */
      startCudePipeline(finalMessageContent)
        .catch((error) => {
          cudeEventLog.error('pipeline', 'The engineering pipeline could not be started', error);
        })
        .finally(() => {
          const failure = requestFailureRef.current;

          if (failure) {
            setPipelineStatus('needs_user_action');
            updateAgentStatus('builder', 'failed', failure.message);
          }
        });

      if (!chatStarted) {
        setPreparing(true);

        /*
         * Show what was typed, straight away.
         *
         * What follows — choosing a starter template, then downloading it —
         * is a model call and a repository fetch, and until this was moved up
         * the message only appeared once both had finished. A person hit
         * enter and watched an unchanged screen for several seconds, with no
         * evidence their message had been sent at all.
         */
        const typedMessage = `[Model: ${model}]

[Provider: ${provider.name}]

${finalMessageContent}`;

        setMessages([
          {
            id: `sent-${Date.now()}`,
            role: 'user',
            content: typedMessage,
            parts: createMessageParts(typedMessage, imageDataList),
          },
        ]);

        if (autoSelectTemplate) {
          const { template, title } = await selectStarterTemplate({
            message: finalMessageContent,
            model,
            provider,
          });

          if (template !== 'blank') {
            const temResp = await getTemplates(template, title).catch((e) => {
              if (e.message.includes('rate limit')) {
                toast.warning('Rate limit exceeded. Skipping starter template\n Continuing with blank template');
              } else {
                toast.warning('Failed to import starter template\n Continuing with blank template');
              }

              return null;
            });

            if (temResp) {
              const { assistantMessage, userMessage } = temResp;
              const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;

              setMessages([
                {
                  id: `1-${new Date().getTime()}`,
                  role: 'user',
                  content: userMessageText,
                  parts: createMessageParts(userMessageText, imageDataList),
                },
                {
                  id: `2-${new Date().getTime()}`,
                  role: 'assistant',
                  content: assistantMessage,
                },
                {
                  id: `3-${new Date().getTime()}`,
                  role: 'user',
                  content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userMessage}`,
                  annotations: ['hidden'],
                },
              ]);

              const reloadOptions =
                uploadedFiles.length > 0
                  ? { experimental_attachments: await filesToAttachments(uploadedFiles) }
                  : undefined;

              reload(reloadOptions);
              clearComposer();
              Cookies.remove(PROMPT_COOKIE_KEY);

              setUploadedFiles([]);
              setImageDataList([]);

              resetEnhancer();

              textareaRef.current?.blur();
              setPreparing(false);

              return;
            }
          }
        }

        // If autoSelectTemplate is disabled or template selection failed, proceed with normal message
        const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;
        const attachments = uploadedFiles.length > 0 ? await filesToAttachments(uploadedFiles) : undefined;

        setMessages([
          {
            id: `${new Date().getTime()}`,
            role: 'user',
            content: userMessageText,
            parts: createMessageParts(userMessageText, imageDataList),
            experimental_attachments: attachments,
          },
        ]);
        reload(attachments ? { experimental_attachments: attachments } : undefined);
        setPreparing(false);
        clearComposer();
        Cookies.remove(PROMPT_COOKIE_KEY);

        setUploadedFiles([]);
        setImageDataList([]);

        resetEnhancer();

        textareaRef.current?.blur();

        return;
      }

      if (error != null) {
        setMessages(messages.slice(0, -1));
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();

      chatStore.setKey('aborted', false);

      if (modifiedFiles !== undefined) {
        const userUpdateArtifact = filesToArtifacts(modifiedFiles, `${Date.now()}`);
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userUpdateArtifact}${finalMessageContent}`;

        const attachmentOptions =
          uploadedFiles.length > 0 ? { experimental_attachments: await filesToAttachments(uploadedFiles) } : undefined;

        append(
          {
            role: 'user',
            content: messageText,
            parts: createMessageParts(messageText, imageDataList),
          },
          attachmentOptions,
        );

        workbenchStore.resetAllFileModifications();
      } else {
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;

        const attachmentOptions =
          uploadedFiles.length > 0 ? { experimental_attachments: await filesToAttachments(uploadedFiles) } : undefined;

        append(
          {
            role: 'user',
            content: messageText,
            parts: createMessageParts(messageText, imageDataList),
          },
          attachmentOptions,
        );
      }

      clearComposer();
      Cookies.remove(PROMPT_COOKIE_KEY);

      setUploadedFiles([]);
      setImageDataList([]);

      resetEnhancer();

      textareaRef.current?.blur();
    };

    /**
     * Handles the change event for the textarea and updates the input state.
     * @param event - The change event from the textarea.
     */
    /*
     * The assistant's rendered text, rebuilt only when a message or its parse
     * changes.
     *
     * This used to be an inline `messages.map` in the JSX, so every keystroke
     * in the composer re-projected the whole conversation and handed BaseChat
     * a brand-new array — the longer the chat, the slower the typing.
     */
    const renderedMessages = useMemo(
      () =>
        messages.map((message, i) => {
          if (message.role === 'user') {
            return message;
          }

          return { ...message, content: parsedMessages[i] || '' };
        }),
      [messages, parsedMessages],
    );

    /**
     * Debounced function to cache the prompt in cookies.
     * Caches the trimmed value of the textarea input after a delay to optimize performance.
     */
    const debouncedCachePrompt = useCallback(
      debounce((value: string) => {
        Cookies.set(PROMPT_COOKIE_KEY, value.trim(), { expires: 30 });
      }, 1000),
      [],
    );

    /*
     * Typing is handled inside the chat box now; this is only the work that has
     * to happen alongside it, and it is deliberately cheap.
     */
    const onComposerChanged = useCallback(
      (value: string) => {
        debouncedCachePrompt(value);
      },
      [debouncedCachePrompt],
    );

    useEffect(() => {
      const storedApiKeys = Cookies.get('apiKeys');

      if (storedApiKeys) {
        setApiKeys(JSON.parse(storedApiKeys));
      }
    }, []);

    const handleModelChange = (newModel: string) => {
      setModel(newModel);
      Cookies.set('selectedModel', newModel, { expires: 30 });
    };

    const handleProviderChange = (newProvider: ProviderInfo) => {
      setProvider(newProvider);
      Cookies.set('selectedProvider', newProvider.name, { expires: 30 });
    };

    const handleWebSearchResult = useCallback((result: string) => {
      prependToComposer(result);
    }, []);

    return (
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        showChat={showChat}
        chatStarted={chatStarted}
        isStreaming={isLoading || preparing}
        onStreamingChange={(streaming) => {
          streamingState.set(streaming);
        }}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        sendMessage={sendMessage}
        model={model}
        setModel={handleModelChange}
        provider={provider}
        setProvider={handleProviderChange}
        providerList={activeProviders}
        onInputChanged={onComposerChanged}
        handleStop={abort}
        description={description}
        importChat={importChat}
        exportChat={exportChat}
        messages={renderedMessages}
        enhancePrompt={() => {
          enhancePrompt(
            readComposerText(),
            (enhanced) => {
              setComposerText(enhanced);
              scrollTextArea();
            },
            model,
            provider,
            apiKeys,
          );
        }}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
        actionAlert={actionAlert}
        clearAlert={() => workbenchStore.clearAlert()}
        supabaseAlert={supabaseAlert}
        clearSupabaseAlert={() => workbenchStore.clearSupabaseAlert()}
        deployAlert={deployAlert}
        clearDeployAlert={() => workbenchStore.clearDeployAlert()}
        llmErrorAlert={llmErrorAlert}
        clearLlmErrorAlert={clearApiErrorAlert}
        data={chatData}
        chatMode={chatMode}
        setChatMode={setChatMode}
        append={append}
        designScheme={designScheme}
        setDesignScheme={setDesignScheme}
        selectedElement={selectedElement}
        setSelectedElement={setSelectedElement}
        addToolResult={addToolResult}
        onWebSearchResult={handleWebSearchResult}
      />
    );
  },
);
