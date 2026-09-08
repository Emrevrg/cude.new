// Cude.new - ChatBox.tsx (Cude product surface, 2026)
import React, { useEffect, useMemo, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST } from '~/utils/constants';
import { ModelPicker } from '~/components/cude/chat/ModelPicker';
import { APIKeyManager } from './APIKeyManager';
import { LOCAL_PROVIDERS } from '~/lib/cude/state/settings';
import FilePreview from './FilePreview';
import { ScreenshotStateManager } from './ScreenshotStateManager';
import { SendButton } from './SendButton.client';
import { IconButton } from '~/components/ui/IconButton';
import { toast } from 'react-toastify';
import { SpeechRecognitionButton } from '~/components/chat/SpeechRecognition';
import { DatabaseControl } from '~/components/cude/chat/DatabaseControl';
import styles from './BaseChat.module.scss';
import type { ProviderInfo } from '~/types/model';
import { ColorSchemeDialog } from '~/components/ui/ColorSchemeDialog';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import { McpTools } from './MCPTools';
import { composerText, setComposerText } from '~/lib/cude/state/composer';
import { CloneButton } from '~/components/cude/CloneButton';
import { InspireButton } from '~/components/cude/InspireButton';
import { WebSearch } from './WebSearch.client';
import { PlatformSelector } from '~/components/cude/PlatformSelector';
import { useStore } from '@nanostores/react';
import { platformStore, setPlatform } from '~/lib/stores/cude';
import { detectProjectType } from '~/lib/cude/detector';

interface ChatBoxProps {
  isModelSettingsCollapsed: boolean;
  setIsModelSettingsCollapsed: (collapsed: boolean) => void;
  provider: any;
  providerList: any[];
  modelList: any[];
  apiKeys: Record<string, string>;
  isModelLoading: string | undefined;
  onApiKeysChange: (providerName: string, apiKey: string) => void;
  uploadedFiles: File[];
  imageDataList: string[];
  textareaRef: React.RefObject<HTMLTextAreaElement> | undefined;
  handlePaste: (e: React.ClipboardEvent) => void;
  TEXTAREA_MIN_HEIGHT: number;
  TEXTAREA_MAX_HEIGHT: number;
  isStreaming: boolean;
  handleSendMessage: (event: React.UIEvent, messageInput?: string) => void;
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  chatStarted: boolean;
  exportChat?: () => void;
  handleFileUpload: () => void;
  setProvider?: ((provider: ProviderInfo) => void) | undefined;
  model?: string | undefined;
  setModel?: ((model: string) => void) | undefined;
  setUploadedFiles?: ((files: File[]) => void) | undefined;
  setImageDataList?: ((dataList: string[]) => void) | undefined;

  /** Told after each keystroke, for side effects such as caching the draft. */
  onInputChanged?: (value: string) => void;
  handleStop?: (() => void) | undefined;
  enhancingPrompt?: boolean | undefined;
  enhancePrompt?: (() => void | Promise<boolean>) | undefined;
  onWebSearchResult?: (result: string) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  selectedElement?: ElementInfo | null;
  setSelectedElement?: ((element: ElementInfo | null) => void) | undefined;
}

export const ChatBox: React.FC<ChatBoxProps> = (props) => {
  const cudePlatform = useStore(platformStore);

  /*
   * The draft lives in a store rather than in a prop from the chat page, so a
   * keystroke re-renders this box and nothing above it.
   */
  const input = useStore(composerText);

  /*
   * The platform hint under the composer.
   *
   * The detector sweeps a few dozen regexes, and it used to run inline in the
   * JSX — once per keystroke, whether or not the hint was even shown.
   */
  /*
   * The box grows with what is in it. This lives here, beside the value it
   * measures: from the chat page it fired on a prop that no longer changes
   * while typing, so the box stopped growing.
   */
  useEffect(() => {
    const textarea = props.textareaRef?.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';

    const wanted = textarea.scrollHeight;

    textarea.style.height = `${Math.min(wanted, props.TEXTAREA_MAX_HEIGHT)}px`;
    textarea.style.overflowY = wanted > props.TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
  }, [input, props.textareaRef, props.TEXTAREA_MAX_HEIGHT]);

  /* Lights the border while the box has focus — see BaseChat.module.scss. */
  const [focused, setFocused] = useState(false);

  const detectedPlatform = useMemo(() => (input.length > 8 ? detectProjectType(input).toUpperCase() : null), [input]);

  /*
   * The chip says what the model is called, not what it is addressed as.
   *
   * `props.model` is the id the API wants — `minimax/minimax-m3:free`,
   * `moonshotai/kimi-k3` — and showing it raw made the composer read like a
   * config file. The picker one click away already shows "MiniMax M3 (free)";
   * these are the same choice and should read the same. The id stays on hover,
   * which is where you want it when a model misbehaves.
   */
  const selectedModelLabel = useMemo(() => {
    const match = props.modelList?.find(
      (entry) => entry?.name === props.model && entry?.provider === props.provider?.name,
    );

    return match?.label || props.model;
  }, [props.modelList, props.model, props.provider?.name]);

  return (
    <div
      className={classNames(
        'relative bg-cude-background-depth-2 backdrop-blur p-3 rounded-lg border border-cude-borderColor relative w-full max-w-chat mx-auto z-prompt',
        { [styles.PromptFocused]: focused },

        /*
         * {
         *   'sticky bottom-2': chatStarted,
         * },
         */
      )}
    >
      <svg className={classNames(styles.PromptEffectContainer)}>
        <defs>
          <linearGradient
            id="line-gradient"
            x1="20%"
            y1="0%"
            x2="-14%"
            y2="10%"
            gradientUnits="userSpaceOnUse"
            gradientTransform="rotate(-45)"
          >
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0%"></stop>
            <stop offset="40%" stopColor="#ffffff" stopOpacity="20%"></stop>
            <stop offset="50%" stopColor="#ffffff" stopOpacity="20%"></stop>
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0%"></stop>
          </linearGradient>
          <linearGradient id="shine-gradient">
            <stop offset="0%" stopColor="white" stopOpacity="0%"></stop>
            <stop offset="40%" stopColor="#ffffff" stopOpacity="80%"></stop>
            <stop offset="50%" stopColor="#ffffff" stopOpacity="80%"></stop>
            <stop offset="100%" stopColor="white" stopOpacity="0%"></stop>
          </linearGradient>
        </defs>
        <rect className={classNames(styles.PromptEffectLine)} pathLength="100" strokeLinecap="round"></rect>
        <rect className={classNames(styles.PromptEffectTrail)} pathLength="100" strokeLinecap="round"></rect>
        <rect className={classNames(styles.PromptShine)} x="48" y="24" width="70" height="1"></rect>
      </svg>
      <div>
        <ClientOnly>
          {() => (
            <div className={props.isModelSettingsCollapsed ? 'hidden' : ''}>
              {/*
               * First-run orientation. Appears only while the selected provider
               * has no credentials, and states the whole path in one line so a
               * new user does not need a wizard or the documentation.
               */}
              {props.chatStarted !== true &&
                props.provider &&
                !LOCAL_PROVIDERS.includes(props.provider.name) &&
                !props.apiKeys[props.provider.name] && (
                  <p className="px-1 pb-2 text-[11px] leading-4 text-cude-textTertiary">
                    <span className="text-cude-textSecondary">Getting started:</span> choose a provider and model, add
                    its API key below, then describe the product you want engineered.
                  </p>
                )}
              <ModelPicker
                model={props.model}
                setModel={props.setModel}
                modelList={props.modelList}
                provider={props.provider}
                setProvider={props.setProvider}
                providerList={props.providerList || (PROVIDER_LIST as ProviderInfo[])}
                modelLoading={props.isModelLoading}
              />
              {(props.providerList || []).length > 0 &&
                props.provider &&
                !LOCAL_PROVIDERS.includes(props.provider.name) && (
                  <APIKeyManager
                    provider={props.provider}
                    apiKey={props.apiKeys[props.provider.name] || ''}
                    setApiKey={(key) => {
                      props.onApiKeysChange(props.provider.name, key);
                    }}
                  />
                )}
            </div>
          )}
        </ClientOnly>
      </div>
      <FilePreview
        files={props.uploadedFiles}
        imageDataList={props.imageDataList}
        onRemove={(index) => {
          props.setUploadedFiles?.(props.uploadedFiles.filter((_, i) => i !== index));
          props.setImageDataList?.(props.imageDataList.filter((_, i) => i !== index));
        }}
      />
      <ClientOnly>
        {() => (
          <ScreenshotStateManager
            setUploadedFiles={props.setUploadedFiles}
            setImageDataList={props.setImageDataList}
            uploadedFiles={props.uploadedFiles}
            imageDataList={props.imageDataList}
          />
        )}
      </ClientOnly>
      {props.selectedElement && (
        <div className="flex mx-1.5 gap-2 items-center justify-between rounded-lg rounded-b-none border border-b-none border-cude-borderColor text-cude-textPrimary flex py-1 px-2.5 font-medium text-xs bg-cude-background-depth-1">
          <div className="flex gap-2 items-center lowercase">
            <code className="bg-cude-background-depth-3 border border-cude-borderColor rounded-4px px-1.5 py-1 mr-0.5 text-cude-textPrimary">
              {props?.selectedElement?.tagName}
            </code>
            selected for inspection
          </div>
          <button
            className="px-2 py-1 rounded bg-cude-background-depth-2 border border-cude-borderColor text-cude-textSecondary hover:text-cude-textPrimary hover:bg-cude-background-depth-3 text-xs"
            onClick={() => props.setSelectedElement?.(null)}
          >
            Clear
          </button>
        </div>
      )}
      <div className={classNames('relative shadow-xs border border-cude-borderColor backdrop-blur rounded-lg')}>
        <textarea
          ref={props.textareaRef}
          className={classNames(
            'w-full pl-4 pt-4 pr-16 outline-none resize-none text-cude-textPrimary placeholder-cude-textTertiary bg-transparent text-sm',
            'transition-all duration-200',
            'hover:border-cude-focus',
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '2px solid #1488fc';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '2px solid #1488fc';
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '1px solid var(--cude-borderColor)';
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '1px solid var(--cude-borderColor)';

            const files = Array.from(e.dataTransfer.files);
            files.forEach((file) => {
              if (file.type.startsWith('image/')) {
                const reader = new FileReader();

                reader.onload = (e) => {
                  const base64Image = e.target?.result as string;
                  props.setUploadedFiles?.([...props.uploadedFiles, file]);
                  props.setImageDataList?.([...props.imageDataList, base64Image]);
                };
                reader.readAsDataURL(file);
              }
            });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              if (event.shiftKey) {
                return;
              }

              event.preventDefault();

              if (props.isStreaming) {
                props.handleStop?.();
                return;
              }

              // ignore if using input method engine
              if (event.nativeEvent.isComposing) {
                return;
              }

              props.handleSendMessage?.(event);
            }
          }}
          value={input}
          onChange={(event) => {
            setComposerText(event.target.value);
            props.onInputChanged?.(event.target.value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={props.handlePaste}
          style={{
            minHeight: props.TEXTAREA_MIN_HEIGHT,
            maxHeight: props.TEXTAREA_MAX_HEIGHT,
          }}
          placeholder={props.chatMode === 'build' ? 'What do you want to build?' : 'What would you like to discuss?'}
          translate="no"
        />
        <ClientOnly>
          {() => (
            <SendButton
              show={input.length > 0 || props.isStreaming || props.uploadedFiles.length > 0}
              isStreaming={props.isStreaming}
              disabled={!props.providerList || props.providerList.length === 0}
              onClick={(event) => {
                if (props.isStreaming) {
                  props.handleStop?.();
                  return;
                }

                if (input.length > 0 || props.uploadedFiles.length > 0) {
                  props.handleSendMessage?.(event);
                }
              }}
            />
          )}
        </ClientOnly>
        {/*
         * The platform choice belongs to the first message: it steers stack
         * selection, and re-deciding it under every follow-up is noise. Once
         * the conversation is underway the row hides — platforms are still
         * added properly through the PRODUCT inspector, not by re-tapping a
         * chip mid-chat.
         */}
        {!props.chatStarted && (
          <div className="flex items-center gap-2 px-3 py-2.5 mt-2 border-t border-cude-borderColor">
            <span className="text-[10px] tracking-widest font-semibold text-cude-textTertiary shrink-0">PLATFORM</span>
            <div className="flex-1 min-w-0">
              <PlatformSelector value={cudePlatform} onChange={setPlatform} compact />
            </div>
            {cudePlatform === 'auto' && detectedPlatform && (
              <span className="text-[11px] text-cude-textTertiary shrink-0">→ {detectedPlatform}</span>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-between items-center gap-2 text-sm p-3 pt-2">
          {/* Wrap controls on narrow composers so model selection remains reachable. */}
          <div className="flex flex-wrap gap-1 items-center min-w-0">
            <ColorSchemeDialog designScheme={props.designScheme} setDesignScheme={props.setDesignScheme} />
            <McpTools />
            <CloneButton
              disabled={props.isStreaming}
              onClone={(message) => props.handleSendMessage?.({} as React.UIEvent, message)}
            />
            <InspireButton
              disabled={props.isStreaming}
              onInspire={(message) => props.handleSendMessage?.({} as React.UIEvent, message)}
            />
            <IconButton
              title="Write a README for this project"
              disabled={props.isStreaming}
              className="transition-all"
              onClick={() =>
                props.handleSendMessage?.(
                  {} as React.UIEvent,
                  'Write a README.md for this project: what it does, how to install and run it, the available scripts, and the project structure. Save it as README.md in the workspace root. Use the Cude conventions (cudeArtifact / cudeAction).',
                )
              }
            >
              <div className="i-ph:file-text text-xl"></div>
            </IconButton>
            <IconButton title="Upload file" className="transition-all" onClick={() => props.handleFileUpload()}>
              <div className="i-ph:paperclip text-xl"></div>
            </IconButton>
            <WebSearch onSearchResult={(result) => props.onWebSearchResult?.(result)} disabled={props.isStreaming} />
            <IconButton
              title="Enhance prompt"
              disabled={input.length === 0 || props.enhancingPrompt}
              className={classNames('transition-all', props.enhancingPrompt ? 'opacity-100' : '')}
              onClick={async () => {
                /*
                 * Toasted on completion, not on click: the old code cheered
                 * the moment the button was pressed, before the model had
                 * answered — and stayed cheerful when it failed.
                 */
                const ok = await props.enhancePrompt?.();

                if (ok === false) {
                  toast.error('The prompt could not be enhanced. Your text is unchanged.');
                } else if (ok === true) {
                  toast.success('Prompt enhanced!');
                }
              }}
            >
              {props.enhancingPrompt ? (
                <div className="i-svg-spinners:90-ring-with-bg text-cude-loader-progress text-xl animate-spin"></div>
              ) : (
                <div className="i-cude:stars text-xl"></div>
              )}
            </IconButton>

            <SpeechRecognitionButton
              isListening={props.isListening}
              onStart={props.startListening}
              onStop={props.stopListening}
              disabled={props.isStreaming}
            />
            {props.chatStarted && (
              <IconButton
                title="Discuss"
                className={classNames(
                  'transition-all flex items-center gap-1 px-1.5',
                  props.chatMode === 'discuss'
                    ? '!bg-cude-item-backgroundAccent !text-cude-item-contentAccent'
                    : 'bg-cude-item-backgroundDefault text-cude-item-contentDefault',
                )}
                onClick={() => {
                  props.setChatMode?.(props.chatMode === 'discuss' ? 'build' : 'discuss');
                }}
              >
                <div className={`i-ph:chats text-xl`} />
                {props.chatMode === 'discuss' ? <span>Discuss</span> : <span />}
              </IconButton>
            )}
            <IconButton
              title="Model Settings"
              className={classNames('transition-all flex items-center gap-1', {
                'bg-cude-item-backgroundAccent text-cude-item-contentAccent': props.isModelSettingsCollapsed,
                'bg-cude-item-backgroundDefault text-cude-item-contentDefault': !props.isModelSettingsCollapsed,
              })}
              onClick={() => props.setIsModelSettingsCollapsed(!props.isModelSettingsCollapsed)}
              disabled={!props.providerList || props.providerList.length === 0}
            >
              <div className={`i-ph:caret-${props.isModelSettingsCollapsed ? 'right' : 'down'} text-lg`} />
              {/*
                Truncated on one line: a routed model id such as
                `minimax/minimax-m2.7:free` is long enough to wrap the chip onto
                two lines and shove the whole toolbar out of alignment. The full
                id stays available on hover.
              */}
              {props.isModelSettingsCollapsed ? (
                <span className="max-w-[8rem] truncate whitespace-nowrap text-xs" title={props.model}>
                  {selectedModelLabel}
                </span>
              ) : (
                <span />
              )}
            </IconButton>
          </div>
          {/*
            The hint gives way rather than fighting for room.
            
            It sits between the icon row and the database control, both of
            which are controls and must stay whole. `whitespace-nowrap` keeps
            it off a one-word-per-line column; `min-w-0` with `overflow-hidden`
            lets it be clipped instead of pushing into the icons, which is what
            it did — the words were drawn across the toolbar at any composer
            width narrower than the viewport suggested. The `lg` breakpoint
            reads the window, and the thing that actually runs out of room is
            the composer.
          */}
          {input.length > 3 ? (
            <div className="hidden lg:block min-w-0 overflow-hidden whitespace-nowrap text-xs text-cude-textTertiary">
              Use <kbd className="kdb px-1.5 py-0.5 rounded bg-cude-background-depth-2">Shift</kbd> +{' '}
              <kbd className="kdb px-1.5 py-0.5 rounded bg-cude-background-depth-2">Return</kbd> for a new line
            </div>
          ) : null}
          {/* Never squeezed out: it is how a person sees what the app is wired to. */}
          <div className="shrink-0">
            <DatabaseControl />
          </div>
        </div>
      </div>
    </div>
  );
};
