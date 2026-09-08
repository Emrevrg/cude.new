/**
 * Cude.new - finding where a conversation was deployed.
 *
 * A deployed project is named after the conversation that built it, so the link
 * back to it is a lookup rather than anything stored. That is deliberate: the
 * deployment is the service's fact, not ours, and a stored URL goes stale the
 * moment someone renames or deletes the site.
 *
 * Both services are asked the same way, through the resource listing. The
 * inherited components each ran their own fetch chain, and the Vercel one put
 * the access token in a query string — which is how a token ends up in a server
 * access log.
 */

import { serviceResources, type ServiceResource } from './serviceResources';

export type DeployService = 'netlify' | 'vercel';

/** The name Cude gives a deployment created from a conversation. */
export function deploymentNameFor(conversationId: string): string {
  return `cude-${conversationId}`;
}

/**
 * Matches loosely, because the services append their own suffixes to a
 * requested name when it collides.
 */
export function matchDeployment(items: ServiceResource[], conversationId: string): ServiceResource | undefined {
  const name = deploymentNameFor(conversationId);

  return items.find((item) => item.name.includes(name));
}

/** Looks up the deployment for a conversation, loading the listing if needed. */
export async function findDeployment(
  service: DeployService,
  conversationId: string,
): Promise<ServiceResource | undefined> {
  if (!conversationId) {
    return undefined;
  }

  const items = await serviceResources.loadOnce(service);

  return matchDeployment(items, conversationId);
}
