# @happyvertical/messages

## 0.56.17

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.17
  - @happyvertical/logger@0.56.17
  - @happyvertical/sql@0.56.17

## 0.56.16

### Patch Changes

- Updated dependencies [9ef2c67]
  - @happyvertical/sql@0.56.16
  - @happyvertical/logger@0.56.16
  - @happyvertical/utils@0.56.16

## 0.56.15

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.15
  - @happyvertical/logger@0.56.15
  - @happyvertical/sql@0.56.15

## 0.56.14

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.14
  - @happyvertical/logger@0.56.14
  - @happyvertical/sql@0.56.14

## 0.56.13

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.13
  - @happyvertical/logger@0.56.13
  - @happyvertical/sql@0.56.13

## 0.56.12

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.12
  - @happyvertical/logger@0.56.12
  - @happyvertical/sql@0.56.12

## 0.56.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.11
  - @happyvertical/logger@0.56.11
  - @happyvertical/sql@0.56.11

## 0.56.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.10
  - @happyvertical/logger@0.56.10
  - @happyvertical/sql@0.56.10

## 0.56.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.9
  - @happyvertical/logger@0.56.9
  - @happyvertical/sql@0.56.9

## 0.56.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.8
  - @happyvertical/logger@0.56.8
  - @happyvertical/sql@0.56.8

## 0.56.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.7
  - @happyvertical/logger@0.56.7
  - @happyvertical/sql@0.56.7

## 0.56.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.6
  - @happyvertical/logger@0.56.6
  - @happyvertical/sql@0.56.6

## 0.56.5

### Patch Changes

- @happyvertical/logger@0.56.5
- @happyvertical/sql@0.56.5
- @happyvertical/utils@0.56.5

## 0.56.4

### Patch Changes

- @happyvertical/logger@0.56.4
- @happyvertical/sql@0.56.4
- @happyvertical/utils@0.56.4

## 0.56.3

### Patch Changes

- @happyvertical/logger@0.56.3
- @happyvertical/sql@0.56.3
- @happyvertical/utils@0.56.3

## 0.56.2

### Patch Changes

- @happyvertical/logger@0.56.2
- @happyvertical/sql@0.56.2
- @happyvertical/utils@0.56.2

## 0.56.1

### Patch Changes

- @happyvertical/logger@0.56.1
- @happyvertical/sql@0.56.1
- @happyvertical/utils@0.56.1

## 0.56.0

### Minor Changes

- 7351dbd: Add Gmail OAuth2 integration tests and fix adapter initialization

  - Fix Gmail adapter to properly initialize OAuth2 client with clientId and clientSecret
  - Add comprehensive Gmail integration tests covering connections, folders, messages, search, and operations
  - Include Gmail token generator script for easy OAuth2 setup
  - Adjust tests for Gmail-specific behavior (labels vs flags)
  - All 17 Gmail integration tests pass with real credentials

- 7351dbd: Add new @happyvertical/messages package for unified email operations

  New package providing adapter-based email operations with support for multiple protocols:

  **Features:**

  - SMTP adapter for sending email (nodemailer)
  - IMAP adapter for receiving email (imapflow)
  - Unified Mailbox interface for consistent API
  - Factory pattern with environment variable support
  - Comprehensive error handling with specific error types
  - Full TypeScript support with strict typing
  - Database synchronization support (optional)
  - OAuth2 authentication support

  **SMTP Capabilities:**

  - Plain text and HTML email
  - File and inline attachments
  - Multiple recipients (To, CC, BCC)
  - Connection pooling
  - Custom headers and options

  **IMAP Capabilities:**

  - Fetch messages with filters
  - Folder operations (list, create, delete)
  - Message operations (mark read, move, copy, delete)
  - Search functionality
  - OAuth2 authentication

  **Future Enhancements:**

  - POP3 adapter (mailpop3)
  - Gmail API adapter (googleapis)
  - Optional encryption (PGP/S/MIME) when @happyvertical/encryption is available

### Patch Changes

- c1b1111: Enable fixed versioning for all @happyvertical packages

  All packages in the SDK monorepo now share the same version number. This simplifies version management and makes it easier to understand which packages work together.

  **Changes:**

  - Updated `.changeset/config.json` to enable fixed versioning for all `@happyvertical/*` packages
  - All packages will now be bumped together to the same version
  - Future changesets will automatically synchronize versions across all packages

  **Migration:**

  - All packages will be synchronized to the same version on the next release
  - The root `package.json` version will be kept in sync with all packages

- 7351dbd: Fix Gmail adapter attachment handling - buildRFC2822Message now properly encodes email attachments using MIME multipart/mixed format with base64 encoding
- Updated dependencies [c1b1111]
  - @happyvertical/logger@0.56.0
  - @happyvertical/sql@0.56.0
  - @happyvertical/utils@0.56.0
