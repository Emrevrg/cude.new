import { describe, expect, it } from 'vitest';
import { authorizeExtensionAccess, createPermissionGrant } from './permissions';
import { ExtensionRegistry } from './registry';
import { validateExtensionManifest } from './manifest';
import type { ExtensionManifest, ExtensionPackage } from './types';

const manifest = (overrides: Partial<ExtensionManifest> = {}): ExtensionManifest => ({
  schemaVersion: 1,
  id: 'cude.example-tool',
  name: 'Example Tool',
  version: '1.2.3',
  publisher: 'Cude Community',
  description: 'A provider-neutral example.',
  homepage: 'https://cude.new/extensions/example-tool',
  license: 'MIT',
  kinds: ['tool'],
  capabilities: ['tool.invoke', 'workspace.inspect'],
  permissions: [
    { name: 'workspace.read', scopes: ['src'], reason: 'Analyze source files.', required: true },
    { name: 'network.connect', scopes: ['https://api.example.com'], reason: 'Call the selected service.' },
  ],
  entrypoints: [{ runtime: 'worker', module: 'dist/worker.js' }],
  ...overrides,
});

const extensionPackage = (overrides: Partial<ExtensionPackage> = {}): ExtensionPackage => ({
  manifest: manifest(),
  source: { type: 'registry', locator: 'cude-community/example-tool@1.2.3', integrity: `sha256-${'A'.repeat(43)}=` },
  ...overrides,
});

describe('extension manifest validation', () => {
  it('accepts a valid provider-neutral manifest', () => {
    expect(validateExtensionManifest(manifest())).toEqual({ ok: true, value: manifest() });
  });

  it('reports all relevant validation failures without executing extension code', () => {
    const result = validateExtensionManifest(
      manifest({
        id: 'Not Safe',
        version: 'latest',
        homepage: 'http://example.com',
        permissions: [{ name: 'workspace.write', scopes: ['../outside'], reason: '' }],
        entrypoints: [{ runtime: 'node', module: 'https://evil.example/run.js' }],
      }),
    );
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.issues.map((item) => item.code)).toEqual(
        expect.arrayContaining([
          'invalid_id',
          'invalid_version',
          'invalid_homepage',
          'missing_reason',
          'unsafe_scope',
          'unsafe_module',
        ]),
      );
    }
  });

  it('rejects insecure remote origins while allowing explicit localhost development', () => {
    const remote = validateExtensionManifest(
      manifest({ permissions: [{ name: 'network.connect', scopes: ['http://example.com'], reason: 'Remote call.' }] }),
    );
    const local = validateExtensionManifest(
      manifest({
        permissions: [{ name: 'network.connect', scopes: ['http://localhost:8787'], reason: 'Local development.' }],
      }),
    );
    expect(remote.ok).toBe(false);
    expect(local.ok).toBe(true);
  });
});

describe('permission grants', () => {
  it('requires every required scope and blocks permission escalation', () => {
    expect(createPermissionGrant(manifest(), [])).toMatchObject({ ok: false });
    expect(
      createPermissionGrant(manifest(), [
        { name: 'workspace.read', scopes: ['src'] },
        { name: 'secrets.read', scopes: ['API_TOKEN'] },
      ]),
    ).toMatchObject({ ok: false });
  });

  it('authorizes only the exact extension, permission, scope, and lifetime', () => {
    const result = createPermissionGrant(manifest(), [{ name: 'workspace.read', scopes: ['src'] }], {
      issuedAt: 100,
      expiresAt: 200,
    });
    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(
      authorizeExtensionAccess(
        result.grant,
        { extensionId: 'cude.example-tool', permission: 'workspace.read', scope: 'src' },
        150,
      ),
    ).toEqual({ allowed: true });
    expect(
      authorizeExtensionAccess(
        result.grant,
        { extensionId: 'other.tool', permission: 'workspace.read', scope: 'src' },
        150,
      ),
    ).toMatchObject({ allowed: false, reason: 'extension-mismatch' });
    expect(
      authorizeExtensionAccess(
        result.grant,
        { extensionId: 'cude.example-tool', permission: 'workspace.read', scope: 'src' },
        200,
      ),
    ).toMatchObject({ allowed: false, reason: 'expired' });
    expect(
      authorizeExtensionAccess(
        result.grant,
        { extensionId: 'cude.example-tool', permission: 'workspace.read', scope: 'tests' },
        150,
      ),
    ).toMatchObject({ allowed: false, reason: 'scope-not-granted' });
  });
});

describe('extension registry', () => {
  it('requires integrity for registry packages and rejects duplicate ids', () => {
    const registry = new ExtensionRegistry();
    expect(registry.install(extensionPackage({ source: { type: 'registry', locator: 'example' } }))).toMatchObject({
      ok: false,
      code: 'invalid-source',
    });
    expect(registry.install(extensionPackage(), { enabled: true, installedAt: 42 })).toMatchObject({ ok: true });
    expect(registry.install(extensionPackage())).toMatchObject({ ok: false, code: 'already-installed' });
    expect(registry.revision).toBe(1);
  });

  it('discovers capabilities only from enabled extensions', () => {
    const registry = new ExtensionRegistry();
    registry.install(extensionPackage(), { installedAt: 42 });
    expect(registry.findByCapability('tool.invoke')).toHaveLength(0);
    registry.setEnabled('cude.example-tool', true);
    expect(registry.findByCapability('tool.invoke').map((entry) => entry.manifest.id)).toEqual(['cude.example-tool']);
    expect(registry.findByCapability('project.deploy')).toHaveLength(0);
  });

  it('returns stable sorted snapshots and tracks material changes', () => {
    const registry = new ExtensionRegistry();
    registry.install(
      extensionPackage({ manifest: manifest({ id: 'zeta.tool' }), source: { type: 'local', locator: './zeta' } }),
      { installedAt: 1 },
    );
    registry.install(
      extensionPackage({ manifest: manifest({ id: 'alpha.tool' }), source: { type: 'builtin', locator: 'alpha' } }),
      { installedAt: 2 },
    );
    expect(registry.list().map((entry) => entry.manifest.id)).toEqual(['alpha.tool', 'zeta.tool']);
    expect(registry.revision).toBe(2);
    registry.setEnabled('alpha.tool', false);
    expect(registry.revision).toBe(2);
    registry.remove('alpha.tool');
    expect(registry.revision).toBe(3);
  });

  it('keeps a defensive manifest snapshot after installation', () => {
    const mutableCapabilities = ['tool.invoke'] as ExtensionManifest['capabilities'] as string[];
    const mutableManifest = manifest({ capabilities: mutableCapabilities as ExtensionManifest['capabilities'] });
    const registry = new ExtensionRegistry();

    registry.install(extensionPackage({ manifest: mutableManifest, source: { type: 'local', locator: './tool' } }), {
      enabled: true,
    });
    mutableCapabilities.push('project.deploy');

    expect(registry.findByCapability('tool.invoke')).toHaveLength(1);
    expect(registry.findByCapability('project.deploy')).toHaveLength(0);
    expect(Object.isFrozen(registry.get('cude.example-tool')?.manifest.capabilities)).toBe(true);
  });
});
