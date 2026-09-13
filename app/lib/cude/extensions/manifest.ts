import {
  EXTENSION_CAPABILITIES,
  EXTENSION_KINDS,
  PERMISSION_NAMES,
  type ExtensionCapability,
  type ExtensionEntrypoint,
  type ExtensionKind,
  type ExtensionManifest,
  type ExtensionPermission,
  type PermissionName,
  type ValidationIssue,
  type ValidationResult,
} from './types';

const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const DIGEST_PATTERN = /^sha256-[A-Za-z0-9+/]{43}=$/;
const SECRET_PATTERN = /^[A-Z][A-Z0-9_]{1,127}$/;
const COMMAND_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DEVICE_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;
const UI_SLOTS = new Set(['activity-bar', 'command-palette', 'editor', 'inspector', 'status-bar', 'toolbar']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function issue(issues: ValidationIssue[], code: string, path: string, message: string): void {
  issues.push({ code, path, message });
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export function isSafeModulePath(value: string): boolean {
  const normalized = value.replaceAll('\\', '/');
  return (
    normalized.length > 0 &&
    !normalized.startsWith('/') &&
    !/^[A-Za-z]:\//.test(normalized) &&
    !normalized.includes('://') &&
    !normalized.split('/').includes('..') &&
    (normalized.endsWith('.js') || normalized.endsWith('.mjs'))
  );
}

export function isValidPermissionScope(permission: PermissionName, scope: string): boolean {
  if (!asNonEmptyString(scope)) {
    return false;
  }

  if (permission === 'workspace.read' || permission === 'workspace.write') {
    const normalized = scope.replaceAll('\\', '/');
    return !normalized.startsWith('/') && !/^[A-Za-z]:\//.test(normalized) && !normalized.split('/').includes('..');
  }

  if (permission === 'network.connect') {
    try {
      const url = new URL(scope);
      const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';

      return (
        url.origin === scope &&
        (url.protocol === 'https:' || url.protocol === 'wss:' || (local && url.protocol === 'http:'))
      );
    } catch {
      return false;
    }
  }

  if (permission === 'process.execute') {
    return COMMAND_PATTERN.test(scope);
  }

  if (permission === 'secrets.read') {
    return SECRET_PATTERN.test(scope);
  }

  if (permission === 'device.access') {
    return DEVICE_PATTERN.test(scope);
  }

  if (permission === 'ui.contribute') {
    return UI_SLOTS.has(scope);
  }

  return false;
}

function validatePermission(value: unknown, index: number, issues: ValidationIssue[]): value is ExtensionPermission {
  const path = `permissions[${index}]`;

  if (!isRecord(value)) {
    issue(issues, 'invalid_type', path, 'Permission must be an object.');
    return false;
  }

  const name = value.name;

  if (typeof name !== 'string' || !PERMISSION_NAMES.includes(name as PermissionName)) {
    issue(issues, 'unknown_permission', `${path}.name`, 'Permission name is not supported.');
    return false;
  }

  const permissionName = name as PermissionName;

  if (!asNonEmptyString(value.reason)) {
    issue(issues, 'missing_reason', `${path}.reason`, 'A user-facing reason is required.');
  }

  if (!Array.isArray(value.scopes) || !value.scopes.every(asNonEmptyString)) {
    issue(issues, 'invalid_scopes', `${path}.scopes`, 'Scopes must be an array of non-empty strings.');
    return false;
  }

  if (permissionName === 'telemetry.emit' ? value.scopes.length !== 0 : value.scopes.length === 0) {
    issue(issues, 'invalid_scopes', `${path}.scopes`, `${permissionName} has an invalid scope count.`);
  }

  value.scopes.forEach((scope, scopeIndex) => {
    if (!isValidPermissionScope(permissionName, scope)) {
      issue(issues, 'unsafe_scope', `${path}.scopes[${scopeIndex}]`, `Scope is not safe for ${permissionName}.`);
    }
  });

  if (hasDuplicates(value.scopes)) {
    issue(issues, 'duplicate_scope', `${path}.scopes`, 'Permission scopes must be unique.');
  }

  if (value.required !== undefined && typeof value.required !== 'boolean') {
    issue(issues, 'invalid_type', `${path}.required`, 'Required must be a boolean.');
  }

  return true;
}

function validateEntrypoint(value: unknown, index: number, issues: ValidationIssue[]): value is ExtensionEntrypoint {
  const path = `entrypoints[${index}]`;

  if (!isRecord(value)) {
    issue(issues, 'invalid_type', path, 'Entrypoint must be an object.');
    return false;
  }

  if (!['browser', 'node', 'worker'].includes(String(value.runtime))) {
    issue(issues, 'invalid_runtime', `${path}.runtime`, 'Runtime must be browser, node, or worker.');
  }

  if (!asNonEmptyString(value.module) || !isSafeModulePath(value.module)) {
    issue(issues, 'unsafe_module', `${path}.module`, 'Module must be a package-relative .js or .mjs path.');
  }

  return true;
}

export function validateExtensionManifest(input: unknown): ValidationResult<ExtensionManifest> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return { ok: false, issues: [{ code: 'invalid_type', path: '$', message: 'Manifest must be an object.' }] };
  }

  if (input.schemaVersion !== 1) {
    issue(issues, 'unsupported_schema', 'schemaVersion', 'Only schema version 1 is supported.');
  }

  if (!asNonEmptyString(input.id) || !ID_PATTERN.test(input.id)) {
    issue(issues, 'invalid_id', 'id', 'Use a lowercase, namespaced extension id.');
  }

  if (!asNonEmptyString(input.name) || input.name.length > 80) {
    issue(issues, 'invalid_name', 'name', 'Name must contain 1–80 characters.');
  }

  if (!asNonEmptyString(input.version) || !VERSION_PATTERN.test(input.version)) {
    issue(issues, 'invalid_version', 'version', 'Version must use semantic versioning.');
  }

  if (!asNonEmptyString(input.publisher) || input.publisher.length > 80) {
    issue(issues, 'invalid_publisher', 'publisher', 'Publisher must contain 1–80 characters.');
  }

  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 500)) {
    issue(issues, 'invalid_description', 'description', 'Description must not exceed 500 characters.');
  }

  if (input.homepage !== undefined) {
    try {
      const url = new URL(String(input.homepage));

      if (url.protocol !== 'https:') {
        throw new Error('HTTPS required');
      }
    } catch {
      issue(issues, 'invalid_homepage', 'homepage', 'Homepage must be an HTTPS URL.');
    }
  }

  const kinds = Array.isArray(input.kinds) ? input.kinds : [];

  if (kinds.length === 0 || !kinds.every((kind) => EXTENSION_KINDS.includes(kind as ExtensionKind))) {
    issue(issues, 'invalid_kinds', 'kinds', 'Declare at least one supported extension kind.');
  }

  if (kinds.every((kind) => typeof kind === 'string') && hasDuplicates(kinds)) {
    issue(issues, 'duplicate_kind', 'kinds', 'Kinds must be unique.');
  }

  const capabilities = Array.isArray(input.capabilities) ? input.capabilities : [];

  if (!capabilities.every((item) => EXTENSION_CAPABILITIES.includes(item as ExtensionCapability))) {
    issue(issues, 'invalid_capabilities', 'capabilities', 'One or more capabilities are unsupported.');
  }

  if (capabilities.every((item) => typeof item === 'string') && hasDuplicates(capabilities)) {
    issue(issues, 'duplicate_capability', 'capabilities', 'Capabilities must be unique.');
  }

  if (!Array.isArray(input.permissions)) {
    issue(issues, 'invalid_type', 'permissions', 'Permissions must be an array.');
  } else {
    input.permissions.forEach((permission, index) => validatePermission(permission, index, issues));

    const names = input.permissions.flatMap((permission) =>
      isRecord(permission) && typeof permission.name === 'string' ? [permission.name] : [],
    );

    if (hasDuplicates(names)) {
      issue(issues, 'duplicate_permission', 'permissions', 'Combine scopes under one entry per permission.');
    }
  }

  if (!Array.isArray(input.entrypoints) || input.entrypoints.length === 0) {
    issue(issues, 'invalid_entrypoints', 'entrypoints', 'Declare at least one entrypoint.');
  } else {
    input.entrypoints.forEach((entrypoint, index) => validateEntrypoint(entrypoint, index, issues));

    const runtimes = input.entrypoints.flatMap((entrypoint) =>
      isRecord(entrypoint) && typeof entrypoint.runtime === 'string' ? [entrypoint.runtime] : [],
    );

    if (hasDuplicates(runtimes)) {
      issue(issues, 'duplicate_runtime', 'entrypoints', 'Declare at most one entrypoint per runtime.');
    }
  }

  return issues.length === 0 ? { ok: true, value: input as unknown as ExtensionManifest } : { ok: false, issues };
}

export function isValidIntegrity(value: string | undefined): value is `sha256-${string}` {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}
