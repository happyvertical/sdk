# @happyvertical/email

## 0.60.6

### Patch Changes

- @happyvertical/logger@0.60.6
- @happyvertical/utils@0.60.6

## 0.60.5

### Patch Changes

- @happyvertical/logger@0.60.5
- @happyvertical/utils@0.60.5

## 0.60.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.4
  - @happyvertical/logger@0.60.4

## 0.60.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.3
  - @happyvertical/logger@0.60.3

## 0.60.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.2
  - @happyvertical/logger@0.60.2

## 0.60.1

### Patch Changes

- @happyvertical/logger@0.60.1
- @happyvertical/utils@0.60.1

## 0.60.0

### Patch Changes

- @happyvertical/logger@0.60.0
- @happyvertical/utils@0.60.0

## 0.59.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.6
  - @happyvertical/logger@0.59.6

## 0.59.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.5
  - @happyvertical/logger@0.59.5

## 0.59.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.4
  - @happyvertical/logger@0.59.4

## 0.59.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.3
  - @happyvertical/logger@0.59.3

## 0.59.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.2
  - @happyvertical/logger@0.59.2

## 0.59.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.1
  - @happyvertical/logger@0.59.1

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
