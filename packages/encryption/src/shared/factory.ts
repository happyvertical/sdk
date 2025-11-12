import type {
  Encryption,
  GetEncryptionOptions,
  NaClOptions,
  NodeCryptoOptions,
  PGPOptions,
} from './types.js';

/**
 * Type guard to check if options are PGP options
 */
export function isPGPOptions(opts: GetEncryptionOptions): opts is PGPOptions {
  return opts.type === 'pgp';
}

/**
 * Type guard to check if options are NaCl options
 */
export function isNaClOptions(opts: GetEncryptionOptions): opts is NaClOptions {
  return opts.type === 'nacl';
}

/**
 * Type guard to check if options are Node crypto options
 */
export function isNodeCryptoOptions(
  opts: GetEncryptionOptions,
): opts is NodeCryptoOptions {
  return opts.type === 'node';
}

/**
 * Validate common options
 */
function validateCommonOptions(options: GetEncryptionOptions): void {
  if (!options.type) {
    throw new Error('Encryption adapter type is required');
  }

  const validTypes = ['pgp', 'nacl', 'node'];
  if (!validTypes.includes(options.type)) {
    throw new Error(
      `Invalid encryption adapter type: ${options.type}. Must be one of: ${validTypes.join(', ')}`,
    );
  }
}

/**
 * Validate PGP-specific options
 */
function validatePGPOptions(options: PGPOptions): void {
  // Validate armor option if provided
  if (options.armor !== undefined && typeof options.armor !== 'boolean') {
    throw new Error('PGP armor option must be a boolean');
  }

  // Validate compression option if provided
  if (
    options.compression !== undefined &&
    typeof options.compression !== 'boolean'
  ) {
    throw new Error('PGP compression option must be a boolean');
  }

  // PGP requires at least one public key or private key for initialization
  // (keys can also be provided per-operation)
  // Keys are optional - adapter can be created without them (e.g., for key generation)
}

/**
 * Validate NaCl-specific options
 */
function validateNaClOptions(options: NaClOptions): void {
  // Validate encoding option if provided
  if (options.encoding) {
    const validEncodings = ['base64', 'hex', 'utf8'];
    if (!validEncodings.includes(options.encoding)) {
      throw new Error(
        `Invalid NaCl encoding: ${options.encoding}. Must be one of: ${validEncodings.join(', ')}`,
      );
    }
  }

  // Validate key formats if provided as strings
  if (typeof options.secretKey === 'string' && options.secretKey.length === 0) {
    throw new Error('NaCl secret key cannot be empty string');
  }

  if (typeof options.publicKey === 'string' && options.publicKey.length === 0) {
    throw new Error('NaCl public key cannot be empty string');
  }

  // NaCl requires at least a secret key or public key
  // Keys are optional - adapter can be created without them (e.g., for key generation)
}

/**
 * Validate Node crypto-specific options
 */
function validateNodeCryptoOptions(options: NodeCryptoOptions): void {
  // Algorithm is required
  if (!options.algorithm) {
    throw new Error('Node crypto algorithm is required');
  }

  // Validate encoding option if provided
  if (options.encoding) {
    const validEncodings = ['hex', 'base64', 'utf8'];
    if (!validEncodings.includes(options.encoding)) {
      throw new Error(
        `Invalid Node crypto encoding: ${options.encoding}. Must be one of: ${validEncodings.join(', ')}`,
      );
    }
  }

  // Validate key derivation options if provided
  if (options.keyDerivation) {
    if (
      !options.keyDerivation.password ||
      options.keyDerivation.password.trim().length === 0
    ) {
      throw new Error('Key derivation password is required');
    }

    if (
      options.keyDerivation.iterations !== undefined &&
      options.keyDerivation.iterations < 1000
    ) {
      throw new Error(
        'Key derivation iterations must be at least 1000 for security',
      );
    }

    if (
      options.keyDerivation.keyLength !== undefined &&
      options.keyDerivation.keyLength < 16
    ) {
      throw new Error('Key derivation key length must be at least 16 bytes');
    }
  }

  // Validate symmetric vs asymmetric algorithm requirements
  const symmetricAlgorithms = [
    'aes-256-gcm',
    'aes-256-cbc',
    'aes-128-gcm',
    'aes-128-cbc',
  ];
  const asymmetricAlgorithms = ['rsa', 'rsa-oaep', 'rsa-pss', 'ecdh', 'ecdsa'];

  if (symmetricAlgorithms.includes(options.algorithm)) {
    // Symmetric algorithms need a key or key derivation for encryption/decryption
    // Keys are optional - adapter can be created without them (e.g., for key generation)
  } else if (asymmetricAlgorithms.includes(options.algorithm)) {
    // Asymmetric algorithms need public/private keys for encryption/decryption
    // Keys are optional - adapter can be created without them (e.g., for key generation)
  }
}

/**
 * Factory function to create encryption adapter instances
 *
 * @example
 * ```typescript
 * // PGP
 * const pgp = await getEncryption({
 *   type: 'pgp',
 *   publicKey: recipientPublicKey,
 *   privateKey: myPrivateKey,
 *   passphrase: 'my-passphrase'
 * });
 *
 * // NaCl
 * const nacl = await getEncryption({
 *   type: 'nacl',
 *   secretKey: mySecretKey
 * });
 *
 * // Node crypto
 * const crypto = await getEncryption({
 *   type: 'node',
 *   algorithm: 'aes-256-gcm',
 *   key: encryptionKey
 * });
 * ```
 */
export async function getEncryption(
  options: GetEncryptionOptions,
): Promise<Encryption> {
  // Validate common options
  validateCommonOptions(options);

  // Validate and create adapter based on type
  if (isPGPOptions(options)) {
    validatePGPOptions(options);

    // Lazy load PGP adapter (reduces initial bundle size)
    const { PGPEncryption } = await import('../adapters/pgp.js');
    return new PGPEncryption(options);
  }

  if (isNaClOptions(options)) {
    validateNaClOptions(options);

    // Lazy load NaCl adapter
    const { NaClEncryption } = await import('../adapters/nacl.js');
    return new NaClEncryption(options);
  }

  if (isNodeCryptoOptions(options)) {
    validateNodeCryptoOptions(options);

    // Lazy load Node crypto adapter
    const { NodeCryptoEncryption } = await import('../adapters/node.js');
    return new NodeCryptoEncryption(options);
  }

  // This should never happen due to validateCommonOptions, but TypeScript needs it
  throw new Error(
    `Unsupported encryption adapter type: ${(options as GetEncryptionOptions).type}`,
  );
}
