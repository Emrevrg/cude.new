/**
 * Cude.new — the providers Cude can talk to.
 *
 * Built from the definitions. Amazon Bedrock keeps its own adapter because its
 * credentials are a JSON blob rather than a key, and its client is constructed
 * from that — a genuine difference, not a copied one.
 */

import type { BaseProvider } from '~/lib/modules/llm/base-provider';
import AmazonBedrockProvider from '~/lib/modules/llm/providers/amazon-bedrock';
import { defineProvider, type ProviderDefinition } from './defineProvider';
import { PROVIDER_DEFINITIONS } from './definitions';

export { defineProvider } from './defineProvider';
export type { ProviderDefinition } from './defineProvider';

export { PROVIDER_DEFINITIONS } from './definitions';

/** Builds one provider from its definition. */
export function createProvider(definition: ProviderDefinition) {
  const provider = defineProvider(definition);

  return new provider();
}

/** Every provider class, in the order they are offered. */
export const PROVIDER_CLASSES: Array<new () => BaseProvider> = [
  ...PROVIDER_DEFINITIONS.map((definition) => defineProvider(definition)),
  AmazonBedrockProvider,
];
