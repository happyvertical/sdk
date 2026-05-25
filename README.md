# HAppy VErtical SDK

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A TypeScript monorepo for building vertical AI agents, published to GitHub Packages as `@happyvertical/*`.

## Architecture

The HAVE SDK is an abstraction layer designed to decouple application logic from volatile infrastructure dependencies. 

In a period of rapid technological churn, committing to a single infrastructure provider guarantees technical debt. This repository isolates fundamental operations—querying a database, reading a file, generating an embedding—behind stable interfaces. Downstream implementations are insulated from provider depreciation, API changes, and shifting pricing models.

This architecture is built on three strategic pillars:

1. **Vendor APIs as commodities.** The AI ecosystem is too volatile for coupling. A model or vector database that is best-in-class today might be eclipsed tomorrow. By abstracting the interaction layer, the HAVE SDK treats providers as interchangeable commodities. Swapping from an expensive managed API to an open-source model running on local hardware requires no code changes.
2. **Disciplined boundaries.** Vendor SDKs naturally leak into application logic. Without an abstraction layer, business logic slowly becomes tightly coupled to a specific vendor's routing or concepts. By forcing all interaction through standard adapter interfaces like `ai.message()`, the downstream application stays clean, testable, and focused on *what* it is doing, not *how* it is doing it.
3. **Solving the "Day 2" problem of scale.** Fast prototyping on Day 1 often requires managed services. But on Day 2, throughput spikes and managed API bills can become unmanageable. With these abstractions in place, migrating a core component (like moving from a managed cloud Redis to a self-hosted instance) transforms from a month-long system refactor into a trivial dependency swap.

Every package exposes a `getX(config)` factory returning a standard interface. State what you need—a database, a translation service, a language model—and the adapter handles the vendor-specific implementation details.

Key design constraints:

- **Adapter pattern by default.** `getAI()`, `getDatabase()`, `getFilesystem()`, `getCache()` all share the same architectural shape. 
- **Environment-variable driven.** Packages read from `HAVE_<PACKAGE>_*` prefixes. Configuration works exactly the same whether it's sitting in a local `.env` or injected by a secrets manager.
- **Modern runtimes only.** ESM is mandatory. Node.js 24+ is expected. There are no CommonJS polyfills here.
- **Pay for what you use.** Third-party vendor SDKs are optional peer dependencies. 
- **LLM-readable.** Each package includes an `AGENT.md` to feed context to an LLM, maximizing the probability that it writes correct code on the first attempt.

### A Practical Example

```typescript
import { getAI } from '@happyvertical/ai';
import { getDatabase } from '@happyvertical/sql';

// Adapters accept explicit config...
const ai = await getAI({ type: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY }); 
const db = await getDatabase({ type: 'postgres', url: process.env.DATABASE_URL });

// ...or auto-configure from HAVE_* environment variables if you prefer less typing
// const ai = await getAI(); 
// const db = await getDatabase(); 

// When project requirements inevitably change, swap providers without touching the business logic.
const summary = await ai.message('Summarize the latest trends in AI agents.');
await db.insert('summaries', { content: summary.content, created_at: new Date() });
```

---

## Packages

### Core Infrastructure

These packages form the foundation everything else builds on.

| Package | Description |
|---------|-------------|
| [**@happyvertical/utils**](./packages/utils/README.md) | ID generation, date parsing, URL handling, string conversion, code sandboxing, and shared error classes used across the SDK. |
| [**@happyvertical/logger**](./packages/logger/README.md) | Structured logging with four severity levels, signal adapter integration for the SMRT framework, and optional Sentry error tracking. |
| [**@happyvertical/json**](./packages/json/README.md) | Drop-in `JSON.parse` / `JSON.stringify` replacements with 2–3× SIMD acceleration via Rust (`sonic-rs`) and automatic JavaScript fallback. |

### Data & Storage

| Package | Description |
|---------|-------------|
| [**@happyvertical/sql**](./packages/sql/README.md) | Unified database interface for SQLite (LibSQL/Turso), PostgreSQL, DuckDB, and a JSON file adapter. Template literal queries, CRUD helpers, transactions, schema sync, and pgvector support. |
| [**@happyvertical/files**](./packages/files/README.md) | Filesystem abstraction for local disk and Google Drive, plus rate-limited HTTP fetch utilities. |
| [**@happyvertical/cache**](./packages/cache/README.md) | Caching layer supporting Memory, File, Redis, and S3 backends with TTL, LRU/LFU eviction, batch operations, and compression. |

### AI & Intelligence

| Package | Description |
|---------|-------------|
| [**@happyvertical/ai**](./packages/ai/README.md) | Multi-provider AI client for OpenAI, Anthropic, Google Gemini, AWS Bedrock, Hugging Face, Claude CLI, and Qwen3-TTS. Chat, streaming, embeddings, image generation, vision, TTS, function calling, and usage tracking in one interface. |
| [**@happyvertical/documents**](./packages/documents/README.md) | Document processing pipeline for PDFs, HTML, and Markdown. Auto-detects document management systems (WordPress, CivicWeb, DocuShare) and extracts structured, hierarchical content. |
| [**@happyvertical/comfyui**](./packages/comfyui/README.md) | WebSocket client for ComfyUI workflow orchestration — queue prompts, track progress, inject dynamic parameters, and download generated images and videos. |

### Identity & Security

| Package | Description |
|---------|-------------|
| [**@happyvertical/auth**](./packages/auth/README.md) | Authentication adapter for Keycloak (OIDC/OAuth2), AWS Cognito, and Nostr decentralized identity. |
| [**@happyvertical/encryption**](./packages/encryption/README.md) | Cryptography operations with PGP/OpenPGP, NaCl/libsodium, and Node.js crypto adapters. Text, file, buffer, and email encryption; digital signing; key management. |
| [**@happyvertical/secrets**](./packages/secrets/README.md) | Envelope encryption for per-tenant secret management. Two-tier key hierarchy (AMK → TDEK → secret value) with database-backed storage and zero-downtime key rotation. |

### Commerce

| Package | Description |
|---------|-------------|
| [**@happyvertical/payments**](./packages/payments/README.md) | Payment backend abstraction with adapters for Base USDC, BTCPay Server, and Stripe Checkout. Quote payment options, status polling, x402 verification, refunds, and payouts. |

### World Knowledge

| Package | Description |
|---------|-------------|
| [**@happyvertical/geo**](./packages/geo/README.md) | Geocoding, reverse geocoding, and static map generation. Supports Google Maps and OpenStreetMap (Nominatim) for lookups; Mapbox and Google Maps for map images. |
| [**@happyvertical/translator**](./packages/translator/README.md) | Translation interface for Google Translate, DeepL, and LibreTranslate with language detection, batch translation, and in-memory caching. |
| [**@happyvertical/weather**](./packages/weather/README.md) | Weather forecast adapter for Environment Canada (free, no key) and OpenWeatherMap (standard and One Call tiers). |

### Content & Publishing

| Package | Description |
|---------|-------------|
| [**@happyvertical/social**](./packages/social/README.md) | Unified publishing interface for YouTube, Threads, X (Twitter), and Bluesky. Publish text, images, and video; cross-post to multiple platforms; retrieve analytics. |
| [**@happyvertical/video**](./packages/video/README.md) | Video composition and transcoding via FFmpeg. Overlay placement, lower-third graphics, thumbnail extraction, and format conversion for social platform delivery. |

### Developer Workflow

| Package | Description |
|---------|-------------|
| [**@happyvertical/repos**](./packages/repos/README.md) | Repository interface for GitHub (with GitLab, Bitbucket, Azure DevOps planned). Issues, PRs, labels, comments, assignments, and search. |
| [**@happyvertical/projects**](./packages/projects/README.md) | Project management adapter for GitHub Projects V2 (with Jira, ZenHub, Linear planned). Add items, update statuses, manage custom fields. |
| [**@happyvertical/github-actions**](./packages/github-actions/README.md) | Reusable GitHub Actions utilities: AI-powered issue triage, implementation planning, Definition of Ready validation, and standardized label management. |
| [**@happyvertical/sdk-mcp**](./packages/sdk-mcp/README.md) | MCP server that routes developer queries to the right package documentation. Exposes `ask`, `list-packages`, and `get-docs` tools; runs as a stdio subprocess. |

---

## Installation

All packages are published to GitHub Packages. You need a GitHub token with `read:packages` scope.

### 1. Configure the registry

Create or update `.npmrc` in your project:

```bash
@happyvertical:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

### 2. Install what you need

```bash
# Pick the packages you want
pnpm add @happyvertical/ai @happyvertical/sql @happyvertical/files

# Core utilities (often pulled in transitively)
pnpm add @happyvertical/utils @happyvertical/logger
```

---

## AI-Assisted Development

Every package ships an `AGENT.md` with full API documentation, common patterns, and known pitfalls — optimized for AI coding assistants. Install context for the packages you're using:

```bash
npx have-ai-context       # @happyvertical/ai
npx have-sql-context      # @happyvertical/sql
npx have-files-context    # @happyvertical/files
npx have-cache-context    # @happyvertical/cache
npx have-utils-context    # @happyvertical/utils
npx have-geo-context      # @happyvertical/geo
npx have-translator-context
npx have-documents-context
```

All commands follow the `have-{pkgname}-context` pattern and copy docs to your project's `.claude/` directory.

Alternatively, use the MCP server to let your AI assistant query the SDK directly:

```bash
npx sdk-mcp
```

---

## Development

We use `pnpm` workspaces and `turborepo` for monorepo management.

```bash
pnpm install                  # install deps (always use pnpm)
npm run build                 # build all packages (turborepo)
npm run build:clean           # clean + rebuild
npm test                      # run all tests (vitest)
npm run lint                  # lint (biome)
npm run format                # format (biome)
npm run typecheck             # typecheck all packages
npm run dev                   # watch mode
npx changeset                 # create changeset for PR
```

### Contribution Rules
- **Branching:** Feature branches only, never push directly to `main`.
- **Commits:** Conventional commits enforced by `commitlint` + `lefthook`.
- **Changesets:** All PRs require a changeset (`npx changeset`) or a `skip-changeset` label.
- **TypeScript:** Pre-push hooks run `typecheck`. Fix all types before pushing.
- **Code Style:** ESM only (no `require()`), use adapter/factory patterns everywhere.

---

## License

MIT — see [LICENSE](./LICENSE) for details.
