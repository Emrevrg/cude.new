# Cude.new v0.2.2

This maintenance release aligns the public repository with the current v0.2 product and makes its verification and community policies explicit.

## Highlights

- Removes the last palette-guard violation from the public home surface.
- Adds a Code of Conduct, support policy, roadmap, and pull-request template.
- Updates public verification claims to match the audited repository state.

## Verification

The following gates passed on Windows against the release candidate:

- TypeScript: pass
- ESLint: pass
- Unit and behavior suite: 1,377/1,377 tests across 98 files
- Production web build: pass

These are point-in-time results for this source tree, not a claim that every provider, operating system, or generated project has been independently tested.

## Known constraints

- Provider availability and model lists can change outside the repository.
- Native packaging depends on platform toolchains and signing credentials.
- The project is early and does not claim established adoption or production-scale reliability.
