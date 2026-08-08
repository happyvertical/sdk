# @happyvertical/repos

Standardized repository interface for GitHub, GitLab, Bitbucket, and Azure DevOps.

## Installation

```bash
pnpm add @happyvertical/repos
```

## Claude Code Context

Install Claude Code context files for AI-assisted development:

```bash
npx have-repos-context
```

This copies the package's `AGENT.md` documentation and `metadata.json` metadata to your project's `.claude/` directory, enabling Claude to provide better assistance when working with this package.

## Usage

```typescript
import { getRepository } from '@happyvertical/repos';

// Create a GitHub repository client
const repo = await getRepository({
  type: 'github',
  owner: 'happyvertical',
  repo: 'sdk',
  token: process.env.GITHUB_TOKEN
});

// Get issue
const issue = await repo.getIssue(352);

// Add labels
await repo.addLabels(352, ['type: feature', 'priority: high', 'size: xl']);

// Post comment
await repo.addComment(352, '## 🤖 AI Triage\n\n**Type**: feature...');

// Search for duplicates
const duplicates = await repo.searchIssues('kanban automation', {
  state: 'open',
  labels: ['type: feature'],
});
```

## Forge integrations

The additive forge surface is provider-neutral at its boundary and keeps the
existing `IRepository` API compatible. Provider operations return both data and
request-scoped metadata, including provider request IDs and rate limits.

### GitHub App installation authority

Create one `GitHubAppAuth` per request or background job. Do not retain it as a
process-global singleton. Installation tokens, in-flight token requests, expiry,
repository authorization, and revocation are isolated inside that instance.

```typescript
import { GitHubAppAuth } from '@happyvertical/repos';

const auth = new GitHubAppAuth({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
});

const installation = await auth.createInstallationContext({
  installationId: '1234',
  owner: 'happyvertical',
  repo: 'sdk',
});

const pullRequest = await installation.forge.getPullRequest(1151);
const check = await installation.forge.createCheckRun({
  name: 'Work authority',
  headSha: pullRequest.data.headSha,
  status: 'completed',
  conclusion: 'success',
  output: {
    title: 'Authorized',
    summary: 'The exact pull-request head satisfies current authority.',
  },
});

console.log(check.metadata.requestId, check.metadata.rateLimit);
```

`createInstallationContext()` fails closed when GitHub rejects the
installation, the token is invalid or expired, or the requested repository is
not accessible to the installation token. Call `revoke()` to revoke
every still-live token issued by this scoped authority and permanently close
the local context. Local authority closes even if GitHub is unavailable;
`revoke()` reports the remote failure and may be retried.

### Signed webhooks

Give the verifier the exact bytes received from the HTTP server. Do not decode,
parse, normalize, or reserialize the body first. `verifyAndNormalize()` verifies
the HMAC-SHA256 signature with constant-time comparisons before decoding JSON.
The first secret is current; later entries permit bounded secret rotation.

```typescript
import { GitHubWebhookVerifier } from '@happyvertical/repos';

const webhooks = new GitHubWebhookVerifier({
  secrets: [process.env.GITHUB_WEBHOOK_SECRET!],
});

// rawBody must be the unchanged Uint8Array from the request.
const event = webhooks.verifyAndNormalize(rawBody, request.headers);

console.log(event.deliveryId, event.observation.kind, event.raw);
```

Normalized observations cover installation/repository changes, pull requests,
reviews, pushes, commit statuses, check runs/suites, merge groups, merges,
deployments, and availability pings while preserving the parsed provider
payload in `raw`. Persist `deliveryId` under a unique constraint before applying
an observation. The exported `createGitHubWebhookFixture()` helper creates exact
deterministic bytes and signatures for duplicate, redelivery, delayed, and
out-of-order integration scenarios.

### Buzz forge relay

`BuzzRelayClient` polls configured Buzz/Nostr relays and normalizes supported
forge kinds into provider-neutral `ForgeEventEnvelope` values. Production
events are verified with `nostr-tools` before normalization; the
`allowUnverifiedFixtures` option is solely for deterministic test fixtures.
When `channelIds` is set, accepted events must have a matching `channel` or
`h` tag. Kind-7 approvals need pull-request metadata or their referenced
kind-1617 patch; pass a kind-39002 members event and `roleFloor` to enforce
channel roles.

```typescript
import { BuzzRelayClient } from '@happyvertical/repos';

const buzz = new BuzzRelayClient({
  relays: ['https://relay.example/buzz'],
  channelIds: ['channel-hv'],
});
const events = await buzz.pollOnce();
```

### Errors and provider metadata

New forge APIs throw `ForgeError`, which exposes `code`, `provider`, `status`,
`requestId`, `rateLimit`, and `retryable`. Authentication and repository-scope
failures are not retryable. Network failures, transient provider failures, and
rate limits are identified explicitly; callers remain responsible for bounded
retry and durable delivery handling.

## Features

- **Platform-agnostic**: Works with GitHub, GitLab, Bitbucket, Azure DevOps
- **Type-safe**: Full TypeScript support
- **Consistent API**: Same interface across all platforms
- **Factory pattern**: Simple `getRepository()` function
- **Comprehensive**: Issues, PRs, labels, comments, assignments, search

## API

### Issues

- `getIssue(number)` - Get issue details
- `createIssue(data)` - Create new issue
- `updateIssue(number, data)` - Update issue
- `closeIssue(number)` - Close issue

### Labels

- `addLabels(issueNumber, labels)` - Add labels to issue
- `removeLabel(issueNumber, label)` - Remove label from issue
- `createLabel(label)` - Create repository label
- `updateLabel(name, label)` - Update existing label
- `listLabels()` - List all repository labels

### Comments

- `addComment(issueNumber, body)` - Add comment to issue
- `updateComment(commentId, body)` - Update existing comment
- `deleteComment(commentId)` - Delete comment
- `listComments(issueNumber)` - List all comments on issue

### Assignments

- `assignIssue(issueNumber, assignees)` - Assign users to issue
- `unassignIssue(issueNumber, assignees)` - Unassign users from issue

### Pull Requests

- `getPullRequest(number)` - Get PR details
- `createPullRequest(data)` - Create new PR
- `mergePullRequest(number, method)` - Merge PR

### Search

- `searchIssues(query, filters)` - Search issues with filters

### Node IDs (for Projects V2)

- `getIssueNodeId(issueNumber)` - Get GraphQL node ID for issue
- `getPRNodeId(prNumber)` - Get GraphQL node ID for PR

### Commit statuses and checks

The GitHub repository implementation also provides additive legacy-interface
extensions:

- `createCommitStatus(input)` and `listCommitStatuses(sha)`
- `createCheckRun(input)`, `updateCheckRun(id, input)`, and
  `listCheckRuns(sha)`

These methods are optional on `IRepository`, preserving third-party adapter
implementations compiled against the existing contract. Prefer
`GitHubForgeProvider` for new provider-neutral integrations and response
metadata. Status and check reads collect every provider page, and check reads
include reruns (`filter=all`); forge response metadata reports the number of
pages and total results observed.

## Supported Platforms

- ✅ **GitHub** - Full support
- ⏳ **GitLab** - Coming soon
- ⏳ **Bitbucket** - Coming soon
- ⏳ **Azure DevOps** - Coming soon

## License

MIT
