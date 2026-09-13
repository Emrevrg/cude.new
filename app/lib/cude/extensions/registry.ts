import { isValidIntegrity, validateExtensionManifest } from './manifest';
import type {
  ExtensionCapability,
  ExtensionManifest,
  ExtensionPackage,
  ExtensionSource,
  ValidationIssue,
} from './types';

export type ExtensionStatus = 'disabled' | 'enabled';

export interface RegisteredExtension {
  readonly manifest: ExtensionManifest;
  readonly source: ExtensionSource;
  readonly status: ExtensionStatus;
  readonly installedAt: number;
}

export type RegistryResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: 'invalid-manifest' | 'invalid-source' | 'already-installed' | 'not-found';
      readonly message: string;
      readonly issues?: readonly ValidationIssue[];
    };

function copyManifest(manifest: ExtensionManifest): ExtensionManifest {
  return Object.freeze({
    ...manifest,
    kinds: Object.freeze([...manifest.kinds]),
    capabilities: Object.freeze([...manifest.capabilities]),
    permissions: Object.freeze(
      manifest.permissions.map((permission) =>
        Object.freeze({ ...permission, scopes: Object.freeze([...permission.scopes]) }),
      ),
    ),
    entrypoints: Object.freeze(manifest.entrypoints.map((entrypoint) => Object.freeze({ ...entrypoint }))),
  });
}

function freezeEntry(entry: RegisteredExtension): RegisteredExtension {
  return Object.freeze({
    ...entry,
    manifest: copyManifest(entry.manifest),
    source: Object.freeze({ ...entry.source }),
  });
}

export class ExtensionRegistry {
  readonly #entries = new Map<string, RegisteredExtension>();
  #revision = 0;

  get revision(): number {
    return this.#revision;
  }

  install(
    extensionPackage: ExtensionPackage,
    options: { readonly enabled?: boolean; readonly installedAt?: number } = {},
  ): RegistryResult<RegisteredExtension> {
    const validation = validateExtensionManifest(extensionPackage.manifest);

    if (!validation.ok) {
      return {
        ok: false,
        code: 'invalid-manifest',
        message: 'Extension manifest validation failed.',
        issues: validation.issues,
      };
    }

    if (this.#entries.has(validation.value.id)) {
      return { ok: false, code: 'already-installed', message: `${validation.value.id} is already installed.` };
    }

    if (!extensionPackage.source.locator.trim()) {
      return { ok: false, code: 'invalid-source', message: 'Extension source locator is required.' };
    }

    if (extensionPackage.source.type === 'registry' && !isValidIntegrity(extensionPackage.source.integrity)) {
      return {
        ok: false,
        code: 'invalid-source',
        message: 'Registry extensions require a valid sha256 integrity digest.',
      };
    }

    const entry = freezeEntry({
      manifest: validation.value,
      source: extensionPackage.source,
      status: options.enabled ? 'enabled' : 'disabled',
      installedAt: options.installedAt ?? Date.now(),
    });
    this.#entries.set(entry.manifest.id, entry);
    this.#revision += 1;

    return { ok: true, value: entry };
  }

  setEnabled(id: string, enabled: boolean): RegistryResult<RegisteredExtension> {
    const current = this.#entries.get(id);

    if (!current) {
      return { ok: false, code: 'not-found', message: `${id} is not installed.` };
    }

    const status: ExtensionStatus = enabled ? 'enabled' : 'disabled';

    if (current.status === status) {
      return { ok: true, value: current };
    }

    const next = freezeEntry({ ...current, status });
    this.#entries.set(id, next);
    this.#revision += 1;

    return { ok: true, value: next };
  }

  remove(id: string): RegistryResult<RegisteredExtension> {
    const current = this.#entries.get(id);

    if (!current) {
      return { ok: false, code: 'not-found', message: `${id} is not installed.` };
    }

    this.#entries.delete(id);
    this.#revision += 1;

    return { ok: true, value: current };
  }

  get(id: string): RegisteredExtension | undefined {
    return this.#entries.get(id);
  }

  list(options: { readonly status?: ExtensionStatus } = {}): readonly RegisteredExtension[] {
    return Object.freeze(
      [...this.#entries.values()]
        .filter((entry) => options.status === undefined || entry.status === options.status)
        .sort((left, right) => left.manifest.id.localeCompare(right.manifest.id)),
    );
  }

  findByCapability(capability: ExtensionCapability): readonly RegisteredExtension[] {
    return Object.freeze(
      this.list({ status: 'enabled' }).filter((entry) => entry.manifest.capabilities.includes(capability)),
    );
  }
}
