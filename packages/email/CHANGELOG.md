# @happyvertical/email

## 0.59.0

### Minor Changes

- c49482d: feat(messages): split @happyvertical/messages into @happyvertical/email

  - Create new @happyvertical/email package for low-level email protocol operations
  - Rename Mailbox → EmailClient, getMailbox() → getEmailClient()
  - Update environment variable prefix from HAVE*MESSAGES*_ to HAVE*EMAIL*_
  - Add email keywords to SDK MCP server registry

  feat(graphql): add new @happyvertical/graphql package

  - Add GraphQL client adapter with Octokit GitHub integration
  - Support for queries and mutations

  feat(repos): add GitHubRepoClient improvements

  - Add enhanced repository operations

### Patch Changes

- @happyvertical/logger@0.59.0
- @happyvertical/utils@0.59.0
