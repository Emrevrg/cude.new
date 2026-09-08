# Cude.new - changelog.md
# Changelog

## v0.1.0

First release of Cude.new.

### Product

- Monochrome design system with a single source of colour tokens; a palette
  guard test fails the build if a non-palette accent is reintroduced
- Brand mark and lockup rendered per theme, so the logo stays legible in both
  light and dark
- Side panel behaves as a modal surface: it covers the page while open and
  restores it on close

### Engineering

- Architecture pipeline: engineering requirements → stack intelligence →
  product graph → design contract → design preview → project manifest
- Design approval gate before any code is generated
- Executable verifiers under `scripts/` that run the real modules and assert on
  real output

### Providers

- Model discovery is authoritative: static lists are a pre-key fallback, and the
  model list refreshes from the provider once a key is present
- Model filtering is a denylist, so newly released model families appear without
  a code change
- Discovered model lists expire, so a long-running process picks up new models
- Provider errors are normalised and secrets are redacted before logging

### Security

- BYOK credentials stay in the browser; they are never written to the project
  manifest, export archives, or logs
