/**
 * Email encryption integration types
 *
 * Re-exports encryption types from @happyvertical/encryption package.
 *
 * The encryption package provides the actual implementations.
 */

/**
 * Re-export encryption types from @happyvertical/encryption
 *
 * These types are defined in the encryption package and provide
 * email-specific encryption capabilities.
 */
export type {
  DecryptEmailOptions,
  DecryptedEmail,
  EmailEncryption,
  EncryptEmailOptions,
  SignEmailOptions,
  VerificationResult,
  VerifyEmailOptions,
} from '@happyvertical/encryption';

/**
 * Check if the @happyvertical/encryption package is available
 *
 * @returns true if encryption package is installed
 *
 * @example
 * ```typescript
 * import { hasEncryption } from '@happyvertical/messages/encryption';
 *
 * if (hasEncryption()) {
 *   // Use encryption features
 *   const { getEncryption } = await import('@happyvertical/encryption');
 *   const encryption = await getEncryption({ type: 'pgp', ... });
 * } else {
 *   console.warn('Encryption not available');
 * }
 * ```
 */
export function hasEncryption(): boolean {
  try {
    require.resolve('@happyvertical/encryption');
    return true;
  } catch {
    return false;
  }
}
