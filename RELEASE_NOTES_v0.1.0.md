# Cude.new v0.1.0 — Release Notes

**Status: v0.1.0 release.**

Cude.new is an open-source AI software engineering environment. You describe a
product; it extracts engineering requirements, chooses a stack per target,
designs a visual system, generates the project, and reports what it did at every
stage.

This document separates what is **implemented**, what is **verified**, what is
**limited**, and what is **not yet verified**. Nothing below claims more than has
actually been run.

---

## Implemented and verified

Verified means an automated script in this repository executes it and asserts the
result. Reproduce everything with the commands in the README.

### Architecture intelligence
- **Engineering requirements extraction** — structured requirements from natural
  language, with position-aware negation ("do not use Rust", "without Electron")
  and comparative de-prioritisation ("startup matters more than development speed").
  Anything unstated stays `unspecified` and carries almost no weight.
- **Adaptive stack intelligence** — candidates carry intrinsic capability scores;
  your priorities control the weights. The same catalog produces Tauri + Rust for
  a low-memory brief and Electron + TypeScript for a ship-fast one.
- **Hard user constraints** — a named language or framework restricts selection
  even where another candidate scores higher; an excluded one is marked rejected,
  scored zero and hidden from the alternatives.
- **Constraint conflicts** — an unsatisfiable request is surfaced with the
  available alternatives rather than silently ignored.
- **Product graph** — multiple targets form one product family with shared auth,
  API, database, sync, contracts, domain and design identity. Services are created
  only when the brief calls for them.
- **`cude.project.json`** — versioned persistence with schema guarding. Credentials
  are stripped on every write, by key shape and by value shape.
- **Add target** — extends an existing product, preserving existing targets and
  reusing existing services.
- **Platform design adaptation** — one identity, genuinely different interaction
  models per platform (touch targets, navigation pattern, density).

*Verified by:* `cude-architecture-verify` — 90 executed checks, and 151 unit tests.

### Generation
- **Web** (React + Vite) — installed, built, broken deliberately, repaired, typechecked.
- **Browser extension** (Manifest V3) — loaded into Chromium, service worker and
  popup asserted live.
- **VS Code extension** — compiled with `tsc` and packaged with `vsce`.
- **Export** — archive contents asserted, including that no `.env` and no
  `node_modules` are included.

*Verified by:* `cude-verify`, `test-extension-runtime`, `test-export`.

### Design
- **Design Director** — generates a product design system from the prompt.
- **Design memory** — a new screen reuses the established system.
- **Visual QA and systemic repair** — injected token drift is detected and repaired.

*Verified by:* `cude-design-verify`.

### Product surface
- Landing page and prompt composer with live platform detection.
- Workbench with tiered controls: workspace modes, engineering inspectors,
  project actions, terminal.
- **Agents** — real pipeline state, per-target branching, real progress
  (completed stages over total; no invented percentages).
- **Architecture** — the actual decision per target with reasons, alternatives,
  tradeoffs, applied user constraints, and a working stack override.
- **Product Graph** — the real graph, with application targets visually distinct
  from shared resources.
- **Theme Studio** — design direction, colour, typography preview, spacing,
  radius, motion, density and per-platform adaptation; raw tokens secondary.
- Deliberate empty states for editor, preview, agents, architecture, graph and theme.
- Responsive down to 390px; one major view dominates at a time on small screens.

### Provider integration

- **Provider-agnostic by construction.** Adapters register with a registry; the
  agent pipeline never imports a concrete adapter or a provider SDK. Enforced by
  test, not convention.
- **OpenAI hardened for this release.** Model discovery now fails with a
  classifiable error instead of an opaque `TypeError`, and non-chat models
  (audio, realtime, image, embedding, moderation) no longer leak into the model
  selector where they would only fail on use.
- **Normalized provider errors.** One shared normalizer maps any provider failure
  to a title, a one-sentence explanation and recovery steps, and decides
  retryability from the failure kind — a bad key or an unsupported model is no
  longer marked retryable.
- **Credential redaction.** Keys are stripped from error details, logs and the
  interface. Verified for OpenAI, Anthropic, Google, GitHub and AWS key shapes.

*Verified by:* 39 deterministic tests in `openai-integration.spec.ts`, using
mocked transports. No live-network provider call was made in this release.

---

## Limited or not yet verified

- **Builder → Tester → Repair → Verified** depends on the selected model's output
  quality and available provider quota. The bounded repair and verification loop
  is exercised by the deterministic harness; a complete e-commerce generation
  was also observed through the live OpenRouter path in this release audit.
- **Live provider traffic.** OpenRouter Explorer and a free-model e-commerce run
  were exercised live. Other provider adapters are covered by deterministic
  transport tests and still require the user's own valid credentials.
- **Android** — project structure is validated; the Gradle APK build was not run.
- **Desktop** — the Windows unpacked application was rebuilt with
  `electron-builder`; its dependency tree, route manifest, home request, health
  endpoint, client asset, window title, and visible composer were verified.
- **iOS** — **experimental**. Stack selection only. No macOS/Xcode toolchain was
  available, so nothing was built. Do not treat iOS as production-verified.
- **Full-stack, PWA, mobile, backend** — generation paths exist and stack
  selection is exercised, but they have no dedicated verification script.

---

## Security

- **Production critical vulnerabilities: 0.**
- High advisories reduced from 18 to 2 by targeted, same-major upgrades
  (`@remix-run/*` 2.17.2 → 2.17.5, plus `undici`, `nanoid`, `rollup`, `immutable`,
  `js-yaml`, `postcss`, `builder-util-runtime`).
- The two remaining highs (`turbo-stream`, `vite`) are build-time only, with
  reachability evidence recorded in [SECURITY.md](SECURITY.md). Neither appears in
  the compiled server output.
- No telemetry, no analytics SDK, no background transmission. Provider calls
  happen only when you initiate them.
- API keys are never written to `cude.project.json` or to exported archives.

---

## Known constraints

- The production build needs a raised Node heap; `pnpm run build` sets
  `--max-old-space-size=8192`.
- The Cloudflare Pages adapter (`functions/[[path]].ts`) imports `build/server`,
  which only exists after a full production build.

---

## License

MIT — see [LICENSE](LICENSE). Third-party notices are collected in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and distributed with the
project.

---

## Verification summary

| Gate | Result |
|---|---|
| Production build | Pass |
| TypeScript (`tsc --noEmit`) | Pass — 0 errors |
| ESLint | Pass — 0 errors |
| Unit tests | Pass — 1,324/1,324 across 88 files |
| Desktop package structure | Pass — 7/7 checks |
| Desktop live window smoke | Pass — home, health, asset and composer |
| Core verification | Pass |
| Design verification | Pass |
| Architecture verification | Pass — 90 checks |
| Export verification | Pass |
| Extension runtime verification | Pass |
| Production critical vulnerabilities | 0 |
