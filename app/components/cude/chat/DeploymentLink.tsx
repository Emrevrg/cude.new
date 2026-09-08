/**
 * Cude.new - a link to where this conversation is deployed.
 *
 * One component for both hosts. The two it replaces were the same component
 * twice, except one resolved the URL from a cached listing and the other ran a
 * four-request chain that ended by putting the access token in a query string.
 *
 * Renders nothing until a deployment is actually found, so it costs nothing on
 * a conversation that has never been deployed.
 */

import { useEffect, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { classNames } from '~/utils/classNames';
import { findDeployment, type DeployService } from '~/lib/cude/state/deployments';

export interface DeploymentLinkProps {
  service: DeployService;
  conversationId: string;
}

export function DeploymentLink({ service, conversationId }: DeploymentLinkProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!conversationId) {
      setUrl(null);
      return undefined;
    }

    setLoading(true);

    findDeployment(service, conversationId)
      .then((deployment) => {
        if (!cancelled) {
          setUrl(deployment?.url ?? null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    // The listing can resolve after the conversation has moved on.
    return () => {
      cancelled = true;
    };
  }, [service, conversationId]);

  if (!url) {
    return null;
  }

  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the deployed site"
            className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-cude-item-backgroundActive text-cude-textSecondary hover:text-cude-textPrimary z-50"
            onClick={(event) => {
              // The link sits inside a menu item; the menu should not also act.
              event.stopPropagation();
            }}
          >
            <div className={classNames('i-ph:link w-4 h-4', loading && 'animate-pulse')} />
          </a>
        </Tooltip.Trigger>

        <Tooltip.Portal>
          <Tooltip.Content
            className="px-3 py-2 rounded bg-cude-background-depth-3 text-cude-textPrimary text-xs z-50"
            sideOffset={5}
          >
            {url}
            <Tooltip.Arrow className="fill-cude-background-depth-3" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
