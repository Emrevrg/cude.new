# Cude.new v0.2.0 — Native Core Migration

**Status: tested migration release.**

This release makes Cude's product direction visible in the shipped application: an original landing surface, a
persistent Product Run, an evidence-gated delivery protocol, safer hardware planning, and the first provider-neutral
extension kernel.

## What changed

- A Cude-native landing page now starts from product outcome, existing code, or a physical prototype.
- `/chat/new` opens a Product Run with explicit Brief, Architecture, Design, Build, and Evidence stages.
- Product Run state is validated and persisted locally. A run reaches Evidence only after the real build pipeline
  reports verification.
- The working Build Studio remains available from the same surface; missing provider credentials are reported as an
  actionable requirement instead of a fabricated build result.
- Hardware intent detection now distinguishes explicit firmware/device work from ordinary apps that merely mention
  sensor data.
- Arduino/ESP32-style work produces a build packet with firmware, BOM, pin map, wiring, and flash guidance. Starter
  firmware does not drive an unconfirmed GPIO pin.
- Capability labels distinguish browser-ready, local-validation, device-required, and planning-only delivery.
- The new extension kernel validates namespaced manifests, safe entrypoints, semantic versions, permissions, exact
  scopes, time-limited grants, HTTPS registry sources, and SHA-256 integrity.

## Verification

- 94 test files and 1,350 tests pass.
- TypeScript and ESLint pass.
- Client and SSR production builds pass.
- The provenance guard reports no reintroduced upstream product branding or endpoints.
- Browser QA covers the landing page and Product Run → Build Studio transition.

## Independence boundary

v0.2.0 is a **native-core migration**, not a claim that every inherited implementation has been replaced. The active
Build Studio still contains attributed MIT-licensed legacy chat, workbench, editor, deployment, and WebContainer
integration code. `LICENSE` and `THIRD-PARTY-NOTICES.md` therefore remain intact.

Full source independence will be declared only when the production dependency graph contains no imported legacy
implementation, the local/self-hosted runtime can operate without required StackBlitz services, similarity and license
audits pass, and the complete functional/E2E release gate is green.
