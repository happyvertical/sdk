# HAVE SDK

TypeScript monorepo for building vertical AI agents. Packages published to GitHub Packages as `@happyvertical/*`.

## Packages

| Package | Purpose |
|---------|---------|
| **ai** | Multi-provider AI client (OpenAI, Anthropic, Google, AWS Bedrock, HuggingFace) |
| **sql** | Database interface (SQLite, PostgreSQL, DuckDB) |
| **files** | File system operations (local, S3, WebDAV) |
| **utils** | ID generation, date parsing, URL handling, string conversion, errors |
| **logger** | Structured logging with signal adapter |
| **json** | High-performance JSON with Rust SIMD acceleration and JS fallback |
| **cache** | Caching (Memory, File, Redis) |
| **geo** | Geographic services (Google Maps, OpenStreetMap) |
| **translator** | Translation (Google Translate, DeepL, LibreTranslate) |
| **weather** | Weather data providers |
| **documents** | Multi-part document processing (PDF, HTML, Markdown) |
| **email** | Low-level email protocol operations |
| **messages** | Multi-channel messaging (Slack, Twitter, Email) |
| **auth** | Authentication (Keycloak, AWS Cognito, Nostr) |
| **encryption** | Encryption and cryptography operations |
| **images** | Image processing with adapter pattern |
| **jobs** | Job queue abstraction (SQLite, PostgreSQL, Bull, SQS) |
| **accounting** | AR/AP sync (QuickBooks and more) |
| **analytics** | Analytics (Google Analytics 4, Plausible) |
| **directory** | Directory services (Kanidm, Stalwart, PostgreSQL, AWS) |
| **projects** | Project management (GitHub Projects V2; Jira/ZenHub/Linear stubbed) |
| **repos** | Repository interface (GitHub, GitLab, Bitbucket, Azure DevOps) |
| **secrets** | Envelope encryption for per-tenant secret management |
| **graphql** | GitHub GraphQL client |
| **sdk-mcp** | MCP server routing queries to package CLAUDE.md files |
| **github-actions** | Reusable GitHub Actions for triage and CI |
| **comfyui** | ComfyUI API client for workflow orchestration |
| **social** | Social platform publishing (YouTube, Threads, X, Bluesky) |
| **video** | Video composition and transcoding |

Key directories: `notes/workflow/` (SOPs, branching, kanban), `.claude/agents/` (sub-agent definitions).

## Commands

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

## Rules

- ESM only — no CommonJS, no `require()`
- All packages use adapter/factory pattern: `getX(config) → IXProvider`
- `pnpm` for package management, `workspace:*` for internal deps
- Conventional commits enforced by commitlint + lefthook (see `commitlint.config.js` for valid scopes)
- PRs require a changeset (`npx changeset`) or `skip-changeset` label
- Never push directly to `main` — feature branches only
- `dist/` is gitignored — built by Vite, not `tsc` directly
- New packages: add to `tsconfig.json` references, `commitlint.config.js` scopes, and `sdk-mcp` registry
- Pre-push hook runs typecheck — fix type errors before pushing
- Node.js 24+, pnpm 9+
