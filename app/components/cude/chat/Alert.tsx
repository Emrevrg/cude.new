/**
 * Cude.new — something needs your attention.
 *
 * One card: what happened, what it was, and what you can do about it. The three
 * it replaces — a build error, a provider failure, a database change waiting to
 * be applied — were the same layout written three times, and had drifted in
 * spacing, in button order and in how the detail was shown.
 *
 * Actions are supplied by the caller, because what to offer is the only thing
 * that genuinely differs between them.
 */

import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';

export type AlertTone = 'error' | 'warning' | 'info';

export interface AlertAction {
  label: string;
  onClick: () => void;

  /** The one thing the reader is most likely to want. At most one. */
  primary?: boolean;

  /** Shown instead of the label while the action is running. */
  busyLabel?: string;
  busy?: boolean;
  icon?: string;
}

export interface AlertProps {
  title: string;
  description: string;

  /** Verbatim output — an error message, a stack, a query. Rendered as code. */
  detail?: string;
  tone?: AlertTone;
  actions: AlertAction[];

  /** Dismiss control. Omitted when the alert must be answered. */
  onDismiss?: () => void;
  dismissLabel?: string;
}

const TONE_ICON: Record<AlertTone, string> = {
  error: 'i-ph:warning-duotone',
  warning: 'i-ph:warning-circle-duotone',
  info: 'i-ph:info-duotone',
};

const TONE_COLOR: Record<AlertTone, string> = {
  error: 'text-cude-item-contentDanger',
  warning: 'text-amber-500',
  info: 'text-cude-textSecondary',
};

export const Alert = memo(
  ({ title, description, detail, tone = 'error', actions, onDismiss, dismissLabel = 'Dismiss' }: AlertProps) => (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        role="alert"
        className="mb-2 rounded-lg border border-cude-borderColor bg-cude-background-depth-2 p-4"
      >
        <div className="flex items-start gap-3">
          <div
            className={classNames(TONE_ICON[tone], 'mt-0.5 shrink-0 text-xl', TONE_COLOR[tone])}
            aria-hidden="true"
          />

          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-cude-textPrimary">{title}</h3>
            <p className="mt-1 text-sm text-cude-textSecondary">{description}</p>

            {detail && (
              <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-cude-background-depth-3 p-2 text-xs text-cude-textSecondary">
                {detail}
              </pre>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {actions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  disabled={action.busy}
                  className={classNames(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                    'focus:outline-none focus:ring-1 focus:ring-cude-borderColorActive',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    action.primary
                      ? 'bg-cude-button-primary-background text-cude-button-primary-text hover:bg-cude-button-primary-backgroundHover'
                      : 'bg-cude-button-secondary-background text-cude-button-secondary-text hover:bg-cude-button-secondary-backgroundHover',
                  )}
                >
                  {action.icon && <div className={classNames(action.icon, action.busy && 'animate-spin')} />}
                  {action.busy && action.busyLabel ? action.busyLabel : action.label}
                </button>
              ))}

              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="rounded-md bg-cude-button-secondary-background px-2.5 py-1.5 text-sm font-medium text-cude-button-secondary-text transition-colors hover:bg-cude-button-secondary-backgroundHover"
                >
                  {dismissLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  ),
);

Alert.displayName = 'Alert';
