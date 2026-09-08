/**
 * Cude.new — the alerts that appear above the composer.
 *
 * Four things can interrupt a conversation: a build or preview error, a
 * database change waiting to be applied, a deployment finishing, and a provider
 * refusing a request. Each was its own component, and they had drifted in
 * layout, in button order, and in whether the detail was shown at all.
 *
 * They are the same card. What differs is the wording and what you can do next,
 * so that is all these adapters supply.
 */

import { memo } from 'react';
import type { ActionAlert, DeployAlert, LlmErrorAlertType, SupabaseAlert } from '~/types/actions';
import { Alert } from './Alert';

export interface AlertProps<T> {
  alert: T;
  clearAlert: () => void;
  postMessage: (message: string) => void;
}

/** A build or preview failure. Offers to hand the output back to Cude. */
export const BuildErrorAlert = memo(({ alert, clearAlert, postMessage }: AlertProps<ActionAlert>) => {
  const fromPreview = alert.source === 'preview';
  const title = alert.title || (fromPreview ? 'The preview failed' : 'A command failed');
  const language = fromPreview ? 'js' : 'sh';

  return (
    <Alert
      title={title}
      description={
        alert.title === 'Could not write a file'
          ? 'The model returned a file without a usable path. Cude can ask it to rewrite that file correctly.'
          : fromPreview
            ? 'Something went wrong while running the preview. Cude can read the error and fix it.'
            : 'A terminal command exited with an error. Cude can read the output and fix it.'
      }
      detail={alert.description}
      actions={[
        {
          label: 'Ask Cude to fix it',
          icon: 'i-ph:chat-circle-duotone',
          primary: true,
          onClick: () =>
            postMessage(
              `*Fix this ${fromPreview ? 'preview' : 'terminal'} error*\n\`\`\`${language}\n${alert.content}\n\`\`\`\n`,
            ),
        },
      ]}
      onDismiss={clearAlert}
    />
  );
});

BuildErrorAlert.displayName = 'BuildErrorAlert';

/** A schema change the model wrote, waiting for the user to allow it. */
export const DatabaseChangeAlert = memo(({ alert, clearAlert, postMessage }: AlertProps<SupabaseAlert>) => (
  <Alert
    tone="warning"
    title={alert.title || 'A database change is ready'}
    description={
      alert.description || 'Cude has written a change to your database schema. Nothing is applied until you say so.'
    }
    detail={alert.content}
    actions={[
      {
        label: 'Apply it',
        icon: 'i-ph:database-duotone',
        primary: true,
        onClick: () => postMessage(`*Apply this database change*\n\`\`\`sql\n${alert.content}\n\`\`\`\n`),
      },
    ]}
    onDismiss={clearAlert}
    dismissLabel="Not now"
  />
));

DatabaseChangeAlert.displayName = 'DatabaseChangeAlert';

/** A deployment that finished, or did not. */
export const DeploymentAlert = memo(({ alert, clearAlert, postMessage }: AlertProps<DeployAlert>) => {
  const failed = alert.type === 'error';

  return (
    <Alert
      tone={failed ? 'error' : 'info'}
      title={alert.title}
      description={alert.description}
      detail={failed ? alert.content : undefined}
      actions={
        failed
          ? [
              {
                label: 'Ask Cude to fix it',
                icon: 'i-ph:chat-circle-duotone',
                primary: true,
                onClick: () => postMessage(`*Fix this deployment failure*\n\`\`\`\n${alert.content ?? ''}\n\`\`\`\n`),
              },
            ]
          : alert.url
            ? [
                {
                  label: 'Open it',
                  icon: 'i-ph:arrow-square-out',
                  primary: true,
                  onClick: () => window.open(alert.url, '_blank', 'noopener'),
                },
              ]
            : []
      }
      onDismiss={clearAlert}
    />
  );
});

DeploymentAlert.displayName = 'DeploymentAlert';

/**
 * A provider refusing a request.
 *
 * The recovery steps come from the provider-error normalizer, which knows the
 * difference between a missing key, a rate limit and an unreachable host.
 */
export const ProviderErrorAlert = memo(
  ({ alert, clearAlert }: { alert: LlmErrorAlertType; clearAlert: () => void }) => (
    <Alert
      tone={alert.type === 'warning' ? 'warning' : 'error'}
      title={alert.title}
      description={alert.description}
      detail={
        alert.actions?.length ? alert.actions.map((step, index) => `${index + 1}. ${step}`).join('\n') : alert.content
      }
      actions={[]}
      onDismiss={clearAlert}
    />
  ),
);

ProviderErrorAlert.displayName = 'ProviderErrorAlert';
