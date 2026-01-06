# @happyvertical/graphql

## 0.66.2

## 0.66.1

## 0.66.0

## 0.65.1

## 0.65.0

## 0.64.0

## 0.63.0

## 0.62.0

## 0.61.4

## 0.61.3

## 0.61.2

## 0.61.1

## 0.61.0

## 0.60.9

## 0.60.8

## 0.60.7

## 0.60.6

## 0.60.5

## 0.60.4

## 0.60.3

## 0.60.2

## 0.60.1

## 0.60.0

## 0.59.6

## 0.59.5

## 0.59.4

## 0.59.3

## 0.59.2

## 0.59.1

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
