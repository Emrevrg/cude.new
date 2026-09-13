# Cude clean-room acceptance

“Cude Native” is a release property, not a branding claim. A release may claim
native independence only after every criterion in this document is satisfied.

## Required boundary

The production graph consists of `app/root`, both Remix entry modules, every
module in `app/routes`, and all local modules reachable from those entry points.
That graph must not reach any retired implementation root:

- `app/components/chat`
- `app/components/workbench`
- `app/components/editor`
- `app/lib/stores`
- `app/lib/webcontainer`

Run `node scripts/cude-native-boundary.mjs` from the repository root. The gate
must exit successfully with zero forbidden dependencies and zero unreadable
reachable modules. There is deliberately no baseline or allowlist. Moving a
legacy import behind another module does not satisfy the boundary.

## Acceptance criteria

1. Every user-facing production route is implemented through Cude-owned
   components, state, editor, execution, artifact, and workspace boundaries.
2. Client and server entries do not initialize a retired store or runtime.
3. Static imports, re-exports, side-effect imports, literal dynamic imports,
   and literal CommonJS `require` calls are clear of the forbidden roots.
4. The native-boundary fixture tests pass:
   `node --test scripts/cude-native-boundary.test.mjs`.
5. The full typecheck, test suite, lint, client build, and SSR build pass from a
   clean checkout using the supported Node version.
6. Product capabilities are demonstrated by executable evidence. Mockups,
   renamed modules, templates, or UI-only controls are not implementation proof.
7. Legal notices remain intact while any covered third-party source is still
   distributed. Passing this technical gate alone is not legal provenance proof.

## Release decision

The independence claim is rejected if any criterion fails. The failure report
must be treated as migration work to complete, not suppressed with path aliases,
generated wrappers, ignored files, a baseline, or an allowlist.
