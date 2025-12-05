---
"@happyvertical/email": minor
"@happyvertical/graphql": minor
"@happyvertical/repos": minor
"@happyvertical/sdk-mcp": patch
---

feat(messages): split @happyvertical/messages into @happyvertical/email

- Create new @happyvertical/email package for low-level email protocol operations
- Rename Mailbox → EmailClient, getMailbox() → getEmailClient()
- Update environment variable prefix from HAVE_MESSAGES_* to HAVE_EMAIL_*
- Add email keywords to SDK MCP server registry

feat(graphql): add new @happyvertical/graphql package

- Add GraphQL client adapter with Octokit GitHub integration
- Support for queries and mutations

feat(repos): add GitHubRepoClient improvements

- Add enhanced repository operations
