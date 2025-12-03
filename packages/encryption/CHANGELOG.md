# @happyvertical/encryption

## 0.57.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.57.1
  - @happyvertical/logger@0.57.1

## 0.57.0

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.57.0
  - @happyvertical/logger@0.57.0

## 0.56.18

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.18
  - @happyvertical/logger@0.56.18

## 0.56.17

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.17
  - @happyvertical/logger@0.56.17

## 0.56.16

### Patch Changes

- @happyvertical/logger@0.56.16
- @happyvertical/utils@0.56.16

## 0.56.15

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.15
  - @happyvertical/logger@0.56.15

## 0.56.14

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.14
  - @happyvertical/logger@0.56.14

## 0.56.13

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.13
  - @happyvertical/logger@0.56.13

## 0.56.12

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.12
  - @happyvertical/logger@0.56.12

## 0.56.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.11
  - @happyvertical/logger@0.56.11

## 0.56.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.10
  - @happyvertical/logger@0.56.10

## 0.56.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.9
  - @happyvertical/logger@0.56.9

## 0.56.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.8
  - @happyvertical/logger@0.56.8

## 0.56.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.7
  - @happyvertical/logger@0.56.7

## 0.56.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.6
  - @happyvertical/logger@0.56.6

## 0.56.5

### Patch Changes

- @happyvertical/logger@0.56.5
- @happyvertical/utils@0.56.5

## 0.56.4

### Patch Changes

- @happyvertical/logger@0.56.4
- @happyvertical/utils@0.56.4

## 0.56.3

### Patch Changes

- @happyvertical/logger@0.56.3
- @happyvertical/utils@0.56.3

## 0.56.2

### Patch Changes

- @happyvertical/logger@0.56.2
- @happyvertical/utils@0.56.2

## 0.56.1

### Patch Changes

- @happyvertical/logger@0.56.1
- @happyvertical/utils@0.56.1

## 0.56.0

### Minor Changes

- 96ce5d9: Add unified encryption package with comprehensive cryptography support

  This introduces a new @happyvertical/encryption package providing a unified interface for multiple encryption methods:

  **Features:**

  - Three encryption adapters: PGP/OpenPGP, NaCl/libsodium, Node.js crypto
  - Text, file, and buffer encryption/decryption
  - Email encryption (PGP/MIME format)
  - Digital signatures (RSA, ECDSA, EdDSA)
  - Key generation, import/export, and management
  - Password-based key derivation (PBKDF2)

  **Implementation:**

  - 3,777 lines of production code
  - 3,689 lines of test code
  - 209 tests passing (100% pass rate)
  - Full TypeScript type definitions
  - Comprehensive documentation (README, CLAUDE.md, SECURITY.md)

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

- Updated dependencies [c1b1111]
  - @happyvertical/logger@0.56.0
  - @happyvertical/utils@0.56.0
