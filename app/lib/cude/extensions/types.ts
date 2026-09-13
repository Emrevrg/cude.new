/** Provider-neutral contracts for Cude extensions. This module has no runtime dependencies. */
export const EXTENSION_KINDS = [
  'tool',
  'provider',
  'integration',
  'workflow',
  'theme',
  'language',
  'hardware',
] as const;

export type ExtensionKind = (typeof EXTENSION_KINDS)[number];

export const EXTENSION_CAPABILITIES = [
  'ai.inference',
  'code.analyze',
  'code.generate',
  'device.communicate',
  'project.deploy',
  'project.preview',
  'source.control',
  'tool.invoke',
  'ui.contribute',
  'workflow.run',
  'workspace.inspect',
  'workspace.modify',
] as const;

export type ExtensionCapability = (typeof EXTENSION_CAPABILITIES)[number];

export const PERMISSION_NAMES = [
  'workspace.read',
  'workspace.write',
  'network.connect',
  'process.execute',
  'secrets.read',
  'device.access',
  'ui.contribute',
  'telemetry.emit',
] as const;

export type PermissionName = (typeof PERMISSION_NAMES)[number];

export interface ExtensionPermission {
  readonly name: PermissionName;

  /** Permission-specific resource boundaries. Empty is valid only for telemetry.emit. */
  readonly scopes: readonly string[];
  readonly reason: string;
  readonly required?: boolean;
}

export interface ExtensionEntrypoint {
  readonly runtime: 'browser' | 'node' | 'worker';

  /** Package-relative ESM module path. URLs and parent traversal are forbidden. */
  readonly module: string;
}

export interface ExtensionManifest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly publisher: string;
  readonly description?: string;
  readonly homepage?: string;
  readonly license?: string;
  readonly kinds: readonly ExtensionKind[];
  readonly capabilities: readonly ExtensionCapability[];
  readonly permissions: readonly ExtensionPermission[];
  readonly entrypoints: readonly ExtensionEntrypoint[];
}

export interface ExtensionSource {
  readonly type: 'builtin' | 'local' | 'registry';
  readonly locator: string;

  /** Content digest, including algorithm prefix. Registry packages require sha256. */
  readonly integrity?: `sha256-${string}`;
}

export interface ExtensionPackage {
  readonly manifest: ExtensionManifest;
  readonly source: ExtensionSource;
}

export interface ValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };
