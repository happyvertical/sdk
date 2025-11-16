# @happyvertical/encryption

## 0.2.0

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
