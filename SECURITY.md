# Security Policy

## Supported Versions

We release security updates for the latest minor version of Cude.new.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

We take the security of Cude.new seriously. If you believe you have found a security vulnerability, please report it to us through GitHub's Private Vulnerability Reporting (Security Advisories) mechanism.

**Do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

### How to Report

1. Navigate to the [Security Advisories](https://github.com/Emrevrg/cude.new/security/advisories) page of this repository
2. Click "Report a vulnerability"
3. Fill in the details of the vulnerability:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (if available)

### What to Expect

- We will acknowledge receipt of your report within 3 business days
- We will provide an initial assessment within 7 business days
- We will keep you informed of our progress
- If the vulnerability is confirmed, we will work on a fix and coordinate disclosure

## Scope

This security policy applies to:

- The Cude.new application (core, Electron, web)
- Generated projects (only vulnerabilities in the generation infrastructure itself)
- Build and packaging pipelines

The following are **out of scope**:

- Vulnerabilities in user-generated code
- Vulnerabilities in third-party dependencies (report to the respective maintainers)
- Issues requiring physical access to the user's machine
- Social engineering or phishing attacks

## Security Best Practices for Users

- Keep your API keys in `.env.local` (never commit them)
- Use fine-grained GitHub/GitLab tokens with minimal scopes
- Regularly update Cude.new to the latest version
- Review generated code before running it
- Run Cude.new in a sandboxed environment when processing untrusted prompts

## Security Architecture

Cude.new implements several security measures:

- **Sandboxed Execution**: Code execution runs in WebContainer (browser) or isolated Electron processes
- **Context Isolation**: Electron renderer processes use `contextIsolation: true` (default)
- **Preload Scripts**: Only safe APIs exposed via `contextBridge`
- **No `nodeIntegration` in Renderer**: Default Electron security
- **Sandboxed File System**: WebContainer provides virtualized file system
- **Dependency Validation**: Package scripts use `npm run build` with locked `pnpm-lock.yaml`

## Dependency Audit Status — v0.1.0

Run `pnpm audit --prod` to reproduce.

| Severity | Count |
|---|---|
| Critical | **0** |
| High | **2** (both build-time only — evidence below) |
| Moderate | 15 |
| Low | 13 |

### Resolved for this release

Targeted upgrades, no framework rewrite:

- `@remix-run/*` 2.17.2 → **2.17.5** — fixes the `@remix-run/router` XSS-via-open-redirect
  (GHSA-2w69-qvjg-hvjx), the protocol-relative open redirect (GHSA-2j2x-hqr9-3h42),
  the `__manifest` DoS (GHSA-8x6r-g9mw-2r78) and the action CSRF issue (GHSA-h5cw-625j-3rxh).
- `undici` pinned at 6.24.0 → **^6.28.0** — the previous pin was itself holding the
  vulnerable version. Clears the WebSocket DoS (GHSA-vxpw-j846-p89q) and five
  header/cookie issues.
- `nanoid` → **^3.3.18**, `rollup` → **^4.59.0**, `immutable` → **^5.1.8**,
  `js-yaml` → **^4.3.1**, `postcss` → **^8.5.18**, `builder-util-runtime` → **^9.7.0**
  — all patch-level within the same major.

Full regression after the upgrade: production build, `tsc --noEmit`, 1,324 tests and
all five verification harnesses pass.

### Remaining high advisories — reachability evidence

Neither is reachable from the deployed application. Both would require a major
version change to a core build dependency, which is disproportionate risk for
this release.

**1. `turbo-stream` 2.4.1 — DoS via reflected input in single-fetch (GHSA-rxv8-25v2-qmq8)**
Patched in 3.0.0; Remix 2.x pins the 2.x API.

*Not reachable:*
- The vulnerability lives in Remix's single-fetch data path. This application
  runs with `v3_singleFetch: false` — confirmed in the compiled server bundle.
- `turbo-stream` appears **0 times** in the built server output
  (`grep -c turbo-stream build/server/assets/server-build-*.js` → `0`), so the
  server never encodes or decodes a turbo-stream payload.

**2. `vite` 5.4.19 — `server.fs.deny` bypass on Windows alternate paths**
Patched in 6.4.3, which is a major upgrade of the build toolchain.

*Not reachable:*
- The advisory affects the Vite **dev server**'s file-serving guard. It is a
  development-time concern, not part of any production artefact.
- `vite` is not present in the deployed bundle; the production build is static
  output served by the host.
- Developers running `pnpm run dev` on Windows should not expose the dev server
  beyond `localhost`.

### Build-time versus runtime

`pnpm audit --prod` reports build tooling under the production tree because those
packages are direct dependencies of the build. When assessing reachability we
check the compiled output in `build/`, not the dependency graph alone.

## Responsible Disclosure Timeline

We aim to follow this timeline:

1. **Day 0**: Report received
2. **Day 1-3**: Acknowledgment sent
3. **Day 1-7**: Initial triage and severity assessment
4. **Day 7-30**: Fix development and testing
5. **Day 30-60**: Patch release and advisory publication
5. **Day 60+**: Public disclosure (coordinated with reporter)

## Contact

For security-related questions that are not vulnerability reports, please open a GitHub Discussion with the "security" label.

---

*This policy is adapted from common open-source security practices. Third-party notices: see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).*
