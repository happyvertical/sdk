# @happyvertical/graphql

## 0.80.0

## 0.79.0

## 0.78.3

## 0.78.2

## 0.78.1

## 0.78.0

## 0.77.0

## 0.76.2

## 0.76.1

## 0.76.0

## 0.75.0

## 0.74.11

## 0.74.10

## 0.74.9

## 0.74.8

## 0.74.7

## 0.74.6

## 0.74.5

## 0.74.4

## 0.74.3

## 0.74.2

## 0.74.1

## 0.74.0

## 0.73.4

## 0.73.3

## 0.73.2

## 0.73.1

## 0.73.0

## 0.72.3

## 0.72.2

## 0.72.1

## 0.72.0

## 0.71.34

## 0.71.33

## 0.71.32

## 0.71.31

## 0.71.30

## 0.71.29

## 0.71.28

## 0.71.27

## 0.71.26

## 0.71.25

## 0.71.24

## 0.71.23

## 0.71.22

## 0.71.20

## 0.71.19

## 0.71.18

## 0.71.17

## 0.71.16

## 0.71.15

## 0.71.14

## 0.71.13

## 0.71.12

## 0.71.11

## 0.71.10

## 0.71.9

## 0.71.8

## 0.71.7

## 0.71.6

## 0.71.5

## 0.71.4

## 0.71.3

## 0.71.2

### Patch Changes

- 8202b19: Add CLAUDE.md agentic instructions and fix stale scope references in package documentation

## 0.71.1

## 0.71.0

## 0.70.7

## 0.70.6

## 0.70.5

## 0.70.4

## 0.70.3

## 0.70.2

## 0.70.1

## 0.70.0

## 0.69.9

## 0.69.8

## 0.69.7

## 0.69.6

## 0.69.5

## 0.69.4

## 0.69.3

## 0.69.2

## 0.69.1

## 0.69.0

## 0.68.13

## 0.68.12

## 0.68.11

## 0.68.10

## 0.68.9

## 0.68.8

## 0.68.7

## 0.68.6

## 0.68.5

## 0.68.4

## 0.68.3

## 0.68.2

## 0.68.1

## 0.68.0

## 0.67.9

## 0.67.8

## 0.67.7

## 0.67.6

## 0.67.5

## 0.67.4

## 0.67.3

## 0.67.2

## 0.67.1

## 0.67.0

### Minor Changes

- 9fef9e5: Add Claude Code context installation CLI for each package

  Each SDK package now ships with Claude Code context files that can be installed into downstream projects:

  - **CLI command**: Run `npx have-{pkgname}-context` (e.g., `npx have-ai-context`)
  - **CLAUDE.md**: Full documentation for AI-assisted development
  - **.claude-meta.json**: Concise metadata with key exports, patterns, and pitfalls

  Files are installed to the downstream project's `.claude/` directory as `have-{pkgname}.md` and `have-{pkgname}.meta.json`.

## 0.66.11

## 0.66.10

## 0.66.9

## 0.66.8

## 0.66.7

## 0.66.6

## 0.66.5

## 0.66.4

## 0.66.3

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
