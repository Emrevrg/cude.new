// Cude.new - ConnectionForm.tsx (Cude product surface, 2026)
import React from 'react';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';

interface TokenTypeOption {
  value: string;
  label: string;
  description?: string;
}

interface ConnectionFormProps {
  isConnected: boolean;
  isConnecting: boolean;
  token: string;
  onTokenChange: (token: string) => void;
  onConnect: (e: React.FormEvent) => void;
  onDisconnect: () => void;
  error?: string;
  serviceName: string;
  tokenLabel?: string;
  tokenPlaceholder?: string;
  getTokenUrl: string;
  environmentVariable?: string;
  tokenTypes?: TokenTypeOption[];
  selectedTokenType?: string;
  onTokenTypeChange?: (type: string) => void;
  connectedMessage?: string;
  children?: React.ReactNode; // For additional form fields
}

export function ConnectionForm({
  isConnected,
  isConnecting,
  token,
  onTokenChange,
  onConnect,
  onDisconnect,
  error,
  serviceName,
  tokenLabel = 'Access Token',
  tokenPlaceholder,
  getTokenUrl,
  environmentVariable,
  tokenTypes,
  selectedTokenType,
  onTokenTypeChange,
  connectedMessage = `Connected to ${serviceName}`,
  children,
}: ConnectionFormProps) {
  return (
    <motion.div
      className="bg-cude-background-depth-1 border border-cude-borderColor rounded-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="p-6 space-y-6">
        {!isConnected ? (
          <div className="space-y-4">
            {environmentVariable && (
              <div className="text-xs text-cude-textSecondary bg-cude-background-depth-2 p-3 rounded-lg mb-4 border border-cude-borderColor">
                <p className="flex items-center gap-1 mb-1">
                  <span className="i-ph:lightbulb w-3.5 h-3.5 text-cude-icon-success" />
                  <span className="font-medium">Tip:</span> You can also set the{' '}
                  <code className="px-1 py-0.5 bg-cude-background-depth-3 rounded border border-cude-borderColor">
                    {environmentVariable}
                  </code>{' '}
                  environment variable to connect automatically.
                </p>
              </div>
            )}

            <form onSubmit={onConnect} className="space-y-4">
              {tokenTypes && tokenTypes.length > 1 && onTokenTypeChange && (
                <div>
                  <label className="block text-sm text-cude-textSecondary mb-2">Token Type</label>
                  <select
                    value={selectedTokenType}
                    onChange={(e) => onTokenTypeChange(e.target.value)}
                    disabled={isConnecting}
                    className={classNames(
                      'w-full px-3 py-2 rounded-lg text-sm',
                      'bg-cude-background-depth-1',
                      'border border-cude-borderColor',
                      'text-cude-textPrimary',
                      'focus:outline-none focus:ring-1 focus:ring-cude-item-contentAccent',
                      'disabled:opacity-50',
                    )}
                  >
                    {tokenTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  {selectedTokenType && tokenTypes.find((t) => t.value === selectedTokenType)?.description && (
                    <p className="mt-1 text-xs text-cude-textTertiary">
                      {tokenTypes.find((t) => t.value === selectedTokenType)?.description}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm text-cude-textSecondary mb-2">{tokenLabel}</label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => onTokenChange(e.target.value)}
                  disabled={isConnecting}
                  placeholder={tokenPlaceholder || `Enter your ${serviceName} access token`}
                  className={classNames(
                    'w-full px-3 py-2 rounded-lg text-sm',
                    'bg-cude-background-depth-1',
                    'border border-cude-borderColor',
                    'text-cude-textPrimary placeholder-cude-textTertiary',
                    'focus:outline-none focus:ring-1 focus:ring-cude-borderColorActive',
                    'disabled:opacity-50',
                  )}
                />
                <div className="mt-2 text-sm text-cude-textSecondary">
                  <a
                    href={getTokenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cude-borderColorActive hover:underline inline-flex items-center gap-1"
                  >
                    Get your token
                    <div className="i-ph:arrow-square-out w-4 h-4" />
                  </a>
                </div>
              </div>

              {children}

              {error && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-700">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isConnecting || !token.trim()}
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm flex items-center gap-2 border border-transparent',
                  'bg-cude-button-primary-background text-cude-button-primary-text',
                  'hover:bg-cude-button-primary-backgroundHover',
                  'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200',
                  'transform active:scale-95',
                )}
              >
                {isConnecting ? (
                  <>
                    <div className="i-ph:spinner-gap animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <div className="i-ph:plug-charging w-4 h-4" />
                    Connect
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onDisconnect}
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                  'bg-cude-item-contentDanger text-white',
                  'hover:bg-red-600',
                )}
              >
                <div className="i-ph:plug w-4 h-4" />
                Disconnect
              </button>
              <span className="text-sm text-cude-textSecondary flex items-center gap-1">
                <div className="i-ph:check-circle w-4 h-4 text-cude-icon-success" />
                {connectedMessage}
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
