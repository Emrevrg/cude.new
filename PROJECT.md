# Cude.new - PROJECT.md
# Project management

## How work is tracked

Work is organised as **epics** (a capability that takes several changes to land)
and **features** (a single shippable change). Pull requests are the change log:
each PR describes the user-visible effect, not just the diff.

## Definition of done

A change is done when all of the following hold — not when the code compiles:

- `pnpm run build` succeeds
- `tsc --noEmit` reports zero errors
- `pnpm run lint` is clean
- `pnpm test` is green, and new behaviour has a test that fails without the fix
- the relevant verifier passes (`scripts/cude-*-verify.mjs`)
- no secret, key or token is written to disk, logs, exports or the project
  manifest

## Verifiers

The `scripts/` directory contains executable verifiers rather than checklists.
They run the real modules and assert on real output, so a passing run is
evidence:

| Verifier | Covers |
| --- | --- |
| `cude-verify.mjs` | core pipeline |
| `cude-architecture-verify.mjs` | architecture layer |
| `cude-design-approval-verify.mjs` | design contract and approval gate |
| `capture-branding-verify.mjs` | brand assets, theming, side panel behaviour |
| `test-export.mjs` | export archives contain no secrets |

## Releases

Version numbers follow semver. A release is cut only after the full gate above
passes on a clean tree.
