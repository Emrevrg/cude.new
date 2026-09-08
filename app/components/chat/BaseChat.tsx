import { clearComposer, setComposerText } from '~/lib/cude/state/composer';

// Cude.new - BaseChat.tsx (Cude product surface, 2026)
/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import type { JSONValue, Message } from 'ai';
import React, { type RefCallback, Suspense, useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { Sidebar } from '~/components/cude/sidebar/Sidebar.client';
import { WorkbenchShell } from '~/components/cude/workbench/WorkbenchShell.client';

import { classNames } from '~/utils/classNames';
import { logStore } from '~/lib/cude/state/logStoreAdapter';
import { providers } from '~/lib/cude/state/settings';
import { PROVIDER_LIST } from '~/utils/constants';
import { Messages } from './Messages.client';
import { getApiKeysFromCookies } from './APIKeyManager';
import Cookies from 'js-cookie';
import { toast } from 'react-toastify';
import * as Tooltip from '@radix-ui/react-tooltip';
import styles from './BaseChat.module.scss';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { ExamplePrompts } from '~/components/chat/ExamplePrompts';
import GitCloneButton from './GitCloneButton';
import type { ProviderInfo } from '~/types/model';
import StarterTemplates from './StarterTemplates';
import type { ActionAlert, SupabaseAlert, DeployAlert, LlmErrorAlertType } from '~/types/actions';
import type { ModelInfo } from '~/lib/modules/llm/types';
import ProgressCompilation from './ProgressCompilation';
import { ExecutionStatus } from './ExecutionStatus';
import { workbenchStore } from '~/lib/stores/workbench';
import type { ProgressAnnotation } from '~/types/context';
import { StickToBottom, useStickToBottomContext } from '~/components/cude/ui/StickToBottom';
import { ChatBox } from './ChatBox';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import {
  BuildErrorAlert,
  DatabaseChangeAlert,
  DeploymentAlert,
  ProviderErrorAlert,
} from '~/components/cude/chat/ChatAlerts';

/**
 * Composer height. Tall enough that a real product brief (5-8 lines) is
 * comfortable to write and read back without becoming a giant empty box.
 */
const TEXTAREA_MIN_HEIGHT = 96;

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
  messages?: Message[];
  description?: string;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  providerList?: ProviderInfo[];
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  onInputChanged?: (value: string) => void;
  enhancePrompt?: () => void;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
  exportChat?: () => void;
  uploadedFiles?: File[];
  setUploadedFiles?: (files: File[]) => void;
  imageDataList?: string[];
  setImageDataList?: (dataList: string[]) => void;
  actionAlert?: ActionAlert;
  clearAlert?: () => void;
  supabaseAlert?: SupabaseAlert;
  clearSupabaseAlert?: () => void;
  deployAlert?: DeployAlert;
  clearDeployAlert?: () => void;
  llmErrorAlert?: LlmErrorAlertType;
  clearLlmErrorAlert?: () => void;
  data?: JSONValue[] | undefined;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  append?: (message: Message) => void;
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  selectedElement?: ElementInfo | null;
  setSelectedElement?: (element: ElementInfo | null) => void;
  addToolResult?: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
  onWebSearchResult?: (result: string) => void;
}

/** How often an open tab asks the providers what they have now. */
const MODEL_REFRESH_MS = 60 * 60 * 1000;

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      onStreamingChange,
      model,
      setModel,
      provider,
      setProvider,
      providerList,
      enhancingPrompt,
      onInputChanged,

      // promptEnhanced,
      enhancePrompt,
      sendMessage,
      handleStop,
      importChat,
      exportChat,
      uploadedFiles = [],
      setUploadedFiles,
      imageDataList = [],
      setImageDataList,
      messages,
      actionAlert,
      clearAlert,
      deployAlert,
      clearDeployAlert,
      supabaseAlert,
      clearSupabaseAlert,
      llmErrorAlert,
      clearLlmErrorAlert,
      data,
      chatMode,
      setChatMode,
      append,
      designScheme,
      setDesignScheme,
      selectedElement,
      setSelectedElement,
      addToolResult = () => {
        throw new Error('addToolResult not implemented');
      },
      onWebSearchResult,
    },
    ref,
  ) => {
    /*
     * Keep the composer predictable while activity cards appear above it. A
     * brief can still grow to several lines, but it must never take over the
     * conversation or shove the workspace out of view.
     */
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 240 : 220;
    const workbenchOpen = useStore(workbenchStore.showWorkbench);
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(getApiKeysFromCookies());
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [isModelSettingsCollapsed, setIsModelSettingsCollapsed] = useState(true);
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>('all');
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);

    /*
     * Opens the provider settings when the failure is a missing key.
     *
     * The alert says "open the provider row beneath the composer", but the
     * settings start collapsed — so the row it points at is not on screen and
     * the guidance is dead on arrival. Collapsing stays the user's call
     * afterwards; this only runs on the error, not on every render.
     */
    const missingKeyAlert = llmErrorAlert?.errorType === 'missing_api_key' ? llmErrorAlert : undefined;

    useEffect(() => {
      if (missingKeyAlert) {
        setIsModelSettingsCollapsed(false);
      }
    }, [missingKeyAlert]);

    useEffect(() => {
      if (data) {
        const progressList = data.filter(
          (x) => typeof x === 'object' && (x as any).type === 'progress',
        ) as ProgressAnnotation[];
        setProgressAnnotations(progressList);
      }
    }, [data]);
    useEffect(() => {
      onStreamingChange?.(isStreaming);
    }, [isStreaming, onStreamingChange]);

    useEffect(() => {
      if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0])
            .map((result) => result.transcript)
            .join('');

          setComposerText(transcript);
          onInputChanged?.(transcript);
        };

        recognition.onerror = (event) => {
          logStore.logError('Speech recognition failed', event.error);
          setIsListening(false);

          /*
           * Said out loud, not just logged: a denied microphone otherwise
           * fails with nothing on screen, and the button reads as dead.
           */
          toast.warning('The microphone could not be used. Check the browser permission and try again.');
        };

        setRecognition(recognition);
      }
    }, []);

    useEffect(() => {
      if (typeof window !== 'undefined') {
        let parsedApiKeys: Record<string, string> | undefined = {};

        try {
          parsedApiKeys = getApiKeysFromCookies();
          setApiKeys(parsedApiKeys);
        } catch (error) {
          logStore.logError('Stored API keys could not be read', error);
          Cookies.remove('apiKeys');
        }

        setIsModelLoading('all');
        fetch('/api/models')
          .then((response) => {
            if (!response.ok) {
              // The body of a failed response is not necessarily JSON.
              throw new Error(`The model list could not be loaded (${response.status}).`);
            }

            return response.json();
          })
          .then((data) => {
            const typedData = data as {
              modelList: ModelInfo[];
              configured?: string[];
              providers?: { name: string }[];
              defaultProvider?: { name: string };
            };
            setModelList(typedData.modelList);

            /*
             * First run: turn on the providers this deployment can actually
             * reach, plus the default, so the composer has something to offer.
             * `autoEnable` only touches providers the user has never decided
             * about, so it cannot re-enable one they switched off.
             */
            /*
             * Every provider, not only the ones with a key.
             *
             * A person cannot choose a provider they cannot see, and the whole
             * point of the list is breadth: it should be possible to look at
             * what NVIDIA or Groq currently offer, decide, and then paste a
             * key. Providers without one cost nothing — discovery refuses
             * before it reaches the network, and their models come from the
             * public registry. Switching one off in settings still sticks.
             */
            const candidates = [
              ...(typedData.configured ?? []),
              ...(typedData.providers ?? []).map((entry) => entry.name),
            ];

            if (typedData.defaultProvider?.name) {
              candidates.push(typedData.defaultProvider.name);
            }

            const turnedOn = providers.autoEnable(candidates);

            if (turnedOn.length > 0) {
              logStore.logSystem(`Enabled ${turnedOn.join(', ')} on first run`);
            }

            /*
             * Open on a provider this deployment can actually reach.
             *
             * The first visit selected whatever came first in the list, which
             * is Anthropic — so somebody who had configured OpenRouter and
             * nothing else landed on "Anthropic API key required" and had to
             * work out for themselves that a different provider would have
             * worked. Cude knows which ones have a key; there is no reason to
             * offer one that does not.
             *
             * Only when they have not chosen. A saved choice is a decision,
             * and switching a person's provider under them would be worse than
             * the problem.
             */
            const hasChosen = Boolean(Cookies.get('selectedProvider'));
            const reachable = typedData.configured ?? [];
            const currentIsReachable = provider && reachable.includes(provider.name);

            if (!hasChosen && reachable.length > 0 && !currentIsReachable) {
              const opening = (typedData.providers ?? []).find((entry) => entry.name === reachable[0]);

              if (opening) {
                setProvider?.(opening as ProviderInfo);
              }
            }
          })
          .catch((error) => {
            logStore.logError('Could not load the model list', error);
          })
          .finally(() => {
            setIsModelLoading(undefined);
          });
      }
    }, [providerList, provider]);

    /*
     * Keeps the list current while the tab stays open.
     *
     * Vendors ship models without warning, and the catalogues in the source go
     * stale the same day. Providers are asked again when the tab is brought
     * back into view, and hourly otherwise, so a model released this afternoon
     * shows up without anyone restarting anything. Quiet by design: it does
     * not touch what is selected, and it does nothing while the tab is hidden.
     */
    useEffect(() => {
      let cancelled = false;

      const refresh = () => {
        if (document.visibilityState !== 'visible') {
          return;
        }

        fetch('/api/models')
          .then((response) => (response.ok ? response.json() : null))
          .then((data) => {
            if (cancelled || !data) {
              return;
            }

            const next = (data as { modelList?: ModelInfo[] }).modelList;

            if (next && next.length > 0) {
              setModelList(next);
            }
          })
          .catch(() => undefined);
      };

      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          refresh();
        }
      };

      /*
       * The settings tab's "Refresh models" button asks the server now rather
       * than waiting for the hourly tick, and hands the answer here so the
       * picker updates immediately.
       */
      const onRefreshed = (event: Event) => {
        const next = (event as CustomEvent<ModelInfo[]>).detail;

        if (!cancelled && next && next.length > 0) {
          setModelList(next);
        }
      };

      const timer = window.setInterval(refresh, MODEL_REFRESH_MS);
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('cude:models-updated', onRefreshed);

      return () => {
        cancelled = true;
        window.clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('cude:models-updated', onRefreshed);
      };
    }, []);

    const onApiKeysChange = async (providerName: string, apiKey: string) => {
      const newApiKeys = { ...apiKeys, [providerName]: apiKey };
      setApiKeys(newApiKeys);
      Cookies.set('apiKeys', JSON.stringify(newApiKeys));

      setIsModelLoading(providerName);

      let providerModels: ModelInfo[] = [];

      try {
        const response = await fetch(`/api/models/${encodeURIComponent(providerName)}`);
        const data = await response.json();
        providerModels = (data as { modelList: ModelInfo[] }).modelList;
      } catch (error) {
        logStore.logError(`Models could not be loaded for ${providerName}`, error);
      }

      // Only update models for the specific provider
      setModelList((prevModels) => {
        const otherModels = prevModels.filter((model) => model.provider !== providerName);
        return [...otherModels, ...providerModels];
      });
      setIsModelLoading(undefined);
    };

    const startListening = () => {
      if (recognition) {
        recognition.start();
        setIsListening(true);
      } else {
        // No speech API in this browser: the button must say so, not sit dead.
        toast.warning('Voice input is not available in this browser.');
      }
    };

    const stopListening = () => {
      if (recognition) {
        recognition.stop();
        setIsListening(false);
      }
    };

    const handleSendMessage = (event: React.UIEvent, messageInput?: string) => {
      if (sendMessage) {
        sendMessage(event, messageInput);
        setSelectedElement?.(null);

        if (recognition) {
          recognition.abort();
          setIsListening(false);

          clearComposer();
        }
      }
    };

    /* Stable, so ExamplePrompts is not rebuilt on every keystroke. */
    const sendExamplePrompt = useCallback(
      (event: React.UIEvent, messageInput?: string) => {
        if (isStreaming) {
          handleStop?.();
          return;
        }

        handleSendMessage?.(event, messageInput);
      },
      [isStreaming, handleStop, handleSendMessage],
    );

    const handleFileUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];

        if (file) {
          const reader = new FileReader();

          reader.onload = (e) => {
            const base64Image = e.target?.result as string;
            setUploadedFiles?.([...uploadedFiles, file]);
            setImageDataList?.([...imageDataList, base64Image]);
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();

          if (file) {
            const reader = new FileReader();

            reader.onload = (e) => {
              const base64Image = e.target?.result as string;
              setUploadedFiles?.([...uploadedFiles, file]);
              setImageDataList?.([...imageDataList, base64Image]);
            };
            reader.readAsDataURL(file);
          }

          break;
        }
      }
    };

    const baseChat = (
      <div
        ref={ref}
        className={classNames(styles.BaseChat, 'relative flex h-full w-full overflow-hidden')}
        data-chat-visible={showChat}
      >
        <ClientOnly>{() => <Sidebar />}</ClientOnly>
        <div className="flex min-h-0 flex-col md:flex-row w-full h-full overflow-hidden">
          <div
            className={classNames(
              styles.Chat,
              'flex min-w-0 min-h-0 flex-col flex-grow h-full',
              !chatStarted && 'overflow-y-auto overflow-x-hidden',
            )}
          >
            {!chatStarted && (
              <div id="intro" className="mt-[12vh] max-w-3xl mx-auto text-center px-4 lg:px-0">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cude-borderColor bg-cude-background-depth-2 text-[11px] tracking-widest font-medium text-cude-textSecondary mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-cude-textPrimary animate-pulse" />
                  OPEN-SOURCE · MULTI-MODEL · MULTI-AGENT
                </div>
                <h1 className="text-4xl lg:text-[56px] font-semibold tracking-tight text-cude-textPrimary mb-3 animate-fade-in">
                  Cude.new
                </h1>
                <p className="text-lg lg:text-xl font-light tracking-tight text-cude-textSecondary mb-2 animate-fade-in animation-delay-200">
                  Build software with an AI engineering team.
                </p>
                <p className="text-sm text-cude-textTertiary max-w-xl mx-auto leading-relaxed">
                  Describe software. Cude plans it, architects it, builds it, runs it, tests it, repairs it, reviews it,
                  and prepares it for release.
                </p>
              </div>
            )}
            <StickToBottom
              footer={
                <div
                  className={classNames('flex flex-col gap-2 w-full max-w-chat mx-auto z-prompt mb-6', {
                    'shrink-0 pt-3 pb-2': chatStarted,
                    'my-auto': !chatStarted,
                  })}
                >
                  {chatStarted && <ScrollToBottom />}
                  <div className="flex flex-col gap-2">
                    {deployAlert && (
                      <DeploymentAlert
                        alert={deployAlert}
                        clearAlert={() => clearDeployAlert?.()}
                        postMessage={(message: string | undefined) => {
                          sendMessage?.({} as any, message);
                          clearSupabaseAlert?.();
                        }}
                      />
                    )}
                    {supabaseAlert && (
                      <DatabaseChangeAlert
                        alert={supabaseAlert}
                        clearAlert={() => clearSupabaseAlert?.()}
                        postMessage={(message) => {
                          sendMessage?.({} as any, message);
                          clearSupabaseAlert?.();
                        }}
                      />
                    )}
                    {actionAlert && (
                      <BuildErrorAlert
                        alert={actionAlert}
                        clearAlert={() => clearAlert?.()}
                        postMessage={(message) => {
                          sendMessage?.({} as any, message);
                          clearAlert?.();
                        }}
                      />
                    )}
                    {chatStarted && llmErrorAlert && (
                      <ProviderErrorAlert alert={llmErrorAlert} clearAlert={() => clearLlmErrorAlert?.()} />
                    )}
                  </div>
                  <ChatBox
                    isModelSettingsCollapsed={isModelSettingsCollapsed}
                    setIsModelSettingsCollapsed={setIsModelSettingsCollapsed}
                    provider={provider}
                    setProvider={setProvider}
                    providerList={providerList || (PROVIDER_LIST as ProviderInfo[])}
                    model={model}
                    setModel={setModel}
                    modelList={modelList}
                    apiKeys={apiKeys}
                    isModelLoading={isModelLoading}
                    onApiKeysChange={onApiKeysChange}
                    uploadedFiles={uploadedFiles}
                    setUploadedFiles={setUploadedFiles}
                    imageDataList={imageDataList}
                    setImageDataList={setImageDataList}
                    textareaRef={textareaRef}
                    onInputChanged={onInputChanged}
                    handlePaste={handlePaste}
                    TEXTAREA_MIN_HEIGHT={TEXTAREA_MIN_HEIGHT}
                    TEXTAREA_MAX_HEIGHT={TEXTAREA_MAX_HEIGHT}
                    isStreaming={isStreaming}
                    handleStop={handleStop}
                    handleSendMessage={handleSendMessage}
                    enhancingPrompt={enhancingPrompt}
                    enhancePrompt={enhancePrompt}
                    isListening={isListening}
                    startListening={startListening}
                    stopListening={stopListening}
                    chatStarted={chatStarted}
                    exportChat={exportChat}
                    handleFileUpload={handleFileUpload}
                    chatMode={chatMode}
                    setChatMode={setChatMode}
                    designScheme={designScheme}
                    setDesignScheme={setDesignScheme}
                    selectedElement={selectedElement}
                    setSelectedElement={setSelectedElement}
                    onWebSearchResult={onWebSearchResult}
                  />
                </div>
              }
              scrollable={chatStarted}
              className={classNames('pt-6 px-2 sm:px-6 relative', {
                'h-full flex flex-col modern-scrollbar': chatStarted,
              })}
            >
              <StickToBottom.Content className="flex flex-col gap-4 relative ">
                <ClientOnly>
                  {() => {
                    return chatStarted ? (
                      <Messages
                        className="flex flex-col w-full flex-1 max-w-chat pb-4 mx-auto z-1"
                        messages={messages}
                        isStreaming={isStreaming}
                        append={append}
                        chatMode={chatMode}
                        setChatMode={setChatMode}
                        provider={provider}
                        model={model}
                        addToolResult={addToolResult}
                      />
                    ) : null;
                  }}
                </ClientOnly>
                {chatStarted && (
                  <div className="w-full max-w-chat mx-auto" data-chat-activity="true">
                    <ExecutionStatus planningOnly />
                  </div>
                )}
                {chatStarted && progressAnnotations.length > 0 && (
                  <div className="w-full max-w-chat mx-auto" data-chat-progress="true">
                    <ProgressCompilation data={progressAnnotations} />
                  </div>
                )}
              </StickToBottom.Content>
              {/*
                Centred on the landing screen, pinned to the bottom afterwards.

                `my-auto` was applied in both states. In a flex column that is
                `margin-bottom: auto`, which pushes empty space underneath the
                composer — so once a conversation started it hung in the middle
                of the panel with a gap below it, fighting the `sticky` that
                was supposed to hold it down. `mt-auto` pushes it to the bottom
                and leaves nothing beneath.
              */}
            </StickToBottom>
            <div className="flex flex-col justify-center">
              {!chatStarted && (
                <div className="flex justify-center gap-2 flex-wrap">
                  <ImportButtons importChat={importChat} />
                  <GitCloneButton importChat={importChat} />
                </div>
              )}
              <div className="flex flex-col gap-5">
                {!chatStarted && <ExamplePrompts sendMessage={sendExamplePrompt} />}
                {!chatStarted && <StarterTemplates />}
              </div>
            </div>
          </div>
          {/*
           * The workbench mounts with the first message, not with the page:
           * on the landing screen it fetched the editor and the terminal
           * before anyone had asked for a project.
           */}
          <ClientOnly>
            {() =>
              chatStarted &&
              workbenchOpen && (
                <Suspense fallback={null}>
                  <WorkbenchShell
                    chatStarted={chatStarted}
                    isStreaming={isStreaming}
                    setSelectedElement={setSelectedElement}
                  />
                </Suspense>
              )
            }
          </ClientOnly>
        </div>
      </div>
    );

    return <Tooltip.Provider delayDuration={200}>{baseChat}</Tooltip.Provider>;
  },
);

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <>
        <button
          className="relative z-10 mb-2 rounded-lg px-1.5 py-0.5 flex items-center justify-center mx-auto gap-2 bg-cude-background-depth-2 border border-cude-borderColor text-cude-textPrimary text-sm"
          onClick={() => scrollToBottom()}
        >
          Go to last message
          <span className="i-ph:arrow-down animate-bounce" />
        </button>
      </>
    )
  );
}
