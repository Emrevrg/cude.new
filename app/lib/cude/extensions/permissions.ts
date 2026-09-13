import { isValidPermissionScope } from './manifest';
import type { ExtensionManifest, PermissionName } from './types';

export interface PermissionSelection {
  readonly name: PermissionName;
  readonly scopes: readonly string[];
}

export interface PermissionGrant {
  readonly extensionId: string;
  readonly permissions: readonly PermissionSelection[];
  readonly issuedAt: number;
  readonly expiresAt?: number;
}

export type GrantResult =
  | { readonly ok: true; readonly grant: PermissionGrant }
  | { readonly ok: false; readonly reason: string };

export type AccessDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: 'expired' | 'extension-mismatch' | 'not-granted' | 'scope-not-granted' | 'unsafe-scope';
    };

function requestedScopes(manifest: ExtensionManifest, name: PermissionName): readonly string[] | undefined {
  return manifest.permissions.find((permission) => permission.name === name)?.scopes;
}

export function createPermissionGrant(
  manifest: ExtensionManifest,
  selections: readonly PermissionSelection[],
  options: { readonly issuedAt?: number; readonly expiresAt?: number } = {},
): GrantResult {
  const issuedAt = options.issuedAt ?? Date.now();

  if (options.expiresAt !== undefined && options.expiresAt <= issuedAt) {
    return { ok: false, reason: 'Grant expiry must be later than its issue time.' };
  }

  const duplicateNames = selections.map((selection) => selection.name);

  if (new Set(duplicateNames).size !== duplicateNames.length) {
    return { ok: false, reason: 'A permission may appear only once in a grant.' };
  }

  for (const selection of selections) {
    const requested = requestedScopes(manifest, selection.name);

    if (!requested) {
      return { ok: false, reason: `${selection.name} was not requested by ${manifest.id}.` };
    }

    if (new Set(selection.scopes).size !== selection.scopes.length) {
      return { ok: false, reason: `${selection.name} contains duplicate scopes.` };
    }

    for (const scope of selection.scopes) {
      if (!isValidPermissionScope(selection.name, scope)) {
        return { ok: false, reason: `${scope} is not a safe ${selection.name} scope.` };
      }

      if (!requested.includes(scope)) {
        return { ok: false, reason: `${scope} was not requested for ${selection.name}.` };
      }
    }
  }

  for (const permission of manifest.permissions) {
    if (
      permission.required &&
      !selections.some(
        (selection) =>
          selection.name === permission.name && permission.scopes.every((scope) => selection.scopes.includes(scope)),
      )
    ) {
      return { ok: false, reason: `Required permission ${permission.name} was not fully granted.` };
    }
  }

  return {
    ok: true,
    grant: Object.freeze({
      extensionId: manifest.id,
      permissions: Object.freeze(
        selections.map((selection) =>
          Object.freeze({ name: selection.name, scopes: Object.freeze([...selection.scopes]) }),
        ),
      ),
      issuedAt,
      ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
    }),
  };
}

export function authorizeExtensionAccess(
  grant: PermissionGrant,
  request: { readonly extensionId: string; readonly permission: PermissionName; readonly scope?: string },
  now = Date.now(),
): AccessDecision {
  if (grant.extensionId !== request.extensionId) {
    return { allowed: false, reason: 'extension-mismatch' };
  }

  if (grant.expiresAt !== undefined && now >= grant.expiresAt) {
    return { allowed: false, reason: 'expired' };
  }

  const permission = grant.permissions.find((candidate) => candidate.name === request.permission);

  if (!permission) {
    return { allowed: false, reason: 'not-granted' };
  }

  if (request.permission === 'telemetry.emit') {
    return request.scope === undefined ? { allowed: true } : { allowed: false, reason: 'scope-not-granted' };
  }

  if (request.scope === undefined || !isValidPermissionScope(request.permission, request.scope)) {
    return { allowed: false, reason: 'unsafe-scope' };
  }

  return permission.scopes.includes(request.scope)
    ? { allowed: true }
    : { allowed: false, reason: 'scope-not-granted' };
}
