# Cude.new - CONTRIBUTING.md
# Contribution Guidelines

Welcome! This guide provides all the details you need to contribute effectively to Cude.new. Thank you for helping us make Cude.new a better tool for developers worldwide.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [How Can I Contribute?](#how-can-i-contribute)
3. [Pull Request Guidelines](#pull-request-guidelines)
4. [Coding Standards](#coding-standards)
5. [Development Setup](#development-setup)
6. [Testing](#testing)
7. [Deployment](#deployment)
8. [Docker Deployment](#docker-deployment)
9. [VS Code Dev Containers Integration](#vs-code-dev-containers-integration)

---

## Code of Conduct

This project is governed by our **Code of Conduct**. By participating, you agree to uphold this code. Report unacceptable behavior to the project maintainers.

---

## How Can I Contribute?

### Reporting Bugs or Feature Requests

- Check the [issue tracker](https://github.com/Emrevrg/cude.new/issues) to avoid duplicates
- Use issue templates (if available)
- Provide detailed, relevant information and steps to reproduce bugs

### Code Contributions

1. Fork the repository
2. Create a feature or fix branch
3. Write and test your code
4. Submit a pull request (PR)

### Join as a Core Contributor

Interested in maintaining and growing the project? Reach out to the maintainers via GitHub Discussions.

---

## Pull Request Guidelines

### PR Checklist

- Branch from the **main** branch
- Update documentation, if needed
- Test all functionality manually
- Focus on one feature/bug per PR
- Ensure tests pass: `pnpm run test`
- Ensure build passes: `pnpm run build`

### Review Process

1. Manual testing by reviewers
2. At least one maintainer review required
3. Address review comments
4. Maintain a clean commit history

---

## Coding Standards

### General Guidelines

- Follow existing code style (ESLint + Prettier)
- Comment complex logic
- Keep functions small and focused
- Use meaningful variable names
- Prefer TypeScript strict mode patterns

### File Organization

- Components in `app/components/`
- Libraries in `app/lib/`
- Routes in `app/routes/`
- Utilities in `app/utils/`
- Styles in `app/styles/`

---

## Development Setup

### Prerequisites

- Node.js ≥ 18.18
- pnpm ≥ 9.14

### 1. Initial Setup

```bash
# Clone the repository
git clone https://github.com/Emrevrg/cude.new.git
cd cude.new

# Install dependencies
pnpm install
```

### 2. Environment Variables

```bash
# Copy example and add your API keys
cp .env.example .env.local

# Add provider keys to .env.local:
# ANTHROPIC_API_KEY=xxx
# OPENAI_API_KEY=xxx
# GOOGLE_GENERATIVE_AI_API_KEY=xxx
# ... etc (see .env.example)
```

### 3. Run Development Server

```bash
pnpm run dev
```

**Tip**: Use **Google Chrome Canary** for best local testing experience.

---

## Testing

Run the test suite with:

```bash
pnpm run test
```

### Test Guidelines

- Write tests for new features
- Ensure all existing tests pass (`corepack pnpm test` → 1,324 passing)
- Keep tests focused and deterministic
- Use Vitest for unit/integration tests

---

## Deployment

### Deploy to Cloudflare Pages

```bash
pnpm run deploy
```

Ensure you have required permissions and Wrangler is configured.

---

## Docker Deployment

### Development

```bash
# Build development image
pnpm run dockerbuild
# or
docker compose --profile development up
```

### Production

```bash
pnpm run dockerbuild:prod
docker compose --profile production up
```

---

## VS Code Dev Containers Integration

The `docker-compose.yaml` is compatible with **VS Code Dev Containers**:

1. Open command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Select **Dev Containers: Reopen in Container**
4. Choose **development** profile
5. VS Code rebuilds and opens the container

---

## Code of Conduct

This project is governed by a Code of Conduct. By participating, you agree to uphold this code. Report unacceptable behavior to the project maintainers.

---

*Thank you for contributing to Cude.new!*
