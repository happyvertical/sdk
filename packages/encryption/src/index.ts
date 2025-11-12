/**
 * @happyvertical/encryption
 *
 * Unified encryption and cryptography operations with adapter-based architecture.
 *
 * Supports multiple encryption methods (PGP, NaCl, Node crypto) and various use cases
 * (text, files, buffers, streams, email).
 *
 * @packageDocumentation
 */

// Base adapter class (for custom adapters)
export { BaseEncryption } from './shared/base.js';
// Error classes
export {
  AlgorithmError,
  DecryptError,
  EncryptError,
  EncryptionError,
  FormatError,
  InvalidKeyError,
  KeyError,
  KeyNotFoundError,
  PassphraseError,
  SignatureError,
  VerificationError,
} from './shared/errors.js';
// Factory function and type guards
export {
  getEncryption,
  isNaClOptions,
  isNodeCryptoOptions,
  isPGPOptions,
} from './shared/factory.js';

// Types and interfaces
export type {
  AdapterType,
  Attachment,
  DecryptEmailOptions,
  DecryptedEmail,
  DecryptOptions,
  EmailAddress,
  EmailMessage,
  EncryptEmailOptions,
  Encryption,
  EncryptionCapabilities,
  EncryptionConfig,
  EncryptOptions,
  ExportKeyOptions,
  GetEncryptionOptions,
  ImportKeyOptions,
  Key,
  KeyPair,
  KeyPairOptions,
  NaClOptions,
  NodeCryptoOptions,
  PGPOptions,
  SignEmailOptions,
  SignOptions,
  VerificationResult,
  VerifyEmailOptions,
  VerifyOptions,
} from './shared/types.js';
