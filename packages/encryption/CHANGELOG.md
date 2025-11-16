# @happyvertical/encryption

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
