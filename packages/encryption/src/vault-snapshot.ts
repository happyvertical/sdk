import { randomBytes, timingSafeEqual } from 'node:crypto';
import { deflateSync, type Inflate, inflateSync } from 'node:zlib';
import nacl from 'tweetnacl';
import {
  DecryptError,
  FormatError,
  InvalidKeyError,
  KeyNotFoundError,
} from './shared/errors.js';

const MAGIC = Buffer.from('HVSE');
const VERSION = 1;
const ALGORITHM = 1; // XSalsa20-Poly1305 secretbox
const KEY_ID_OFFSET = 7;
const NONCE_OFFSET = KEY_ID_OFFSET + 16;
const HEADER_BYTES = NONCE_OFFSET + nacl.secretbox.nonceLength;
const MAX_ID_BYTES = 255;
const MIN_CONTEXT_BYTES = 12; // two length bytes, two nonempty IDs, uint64 sequence
const MAX_CONTEXT_BYTES = 2 + 2 * MAX_ID_BYTES + 8;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const MAX_ENCODED_BYTES = MAX_SNAPSHOT_BYTES + 64 * 1024;
const MAX_ENVELOPE_BYTES =
  2 * HEADER_BYTES +
  nacl.secretbox.overheadLength +
  MAX_CONTEXT_BYTES +
  MAX_ENCODED_BYTES;
const MAX_SEQUENCE = (1n << 64n) - 1n;

export interface VaultSnapshotContext {
  accountId: string;
  deviceId: string;
  sequence: bigint;
}

export interface SealVaultSnapshotOptions {
  key: Uint8Array;
  /** Opaque 16-byte identifier represented by 32 lowercase hex digits. */
  keyId: string;
  context: VaultSnapshotContext;
  compression?: 'none' | 'zlib';
}

export interface OpenVaultSnapshotOptions {
  /** Trusted restore context, supplied independently of the envelope. */
  context: VaultSnapshotContext;
  /** Called once with the untrusted key ID, scoped by the caller to this account. */
  resolveKey: (keyId: string) => Uint8Array | undefined;
}

function encodeId(id: string): Buffer {
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_BYTES) {
    throw new FormatError('Invalid vault snapshot context ID');
  }
  const bytes = Buffer.from(id, 'utf8');
  if (bytes.length > MAX_ID_BYTES || bytes.toString('utf8') !== id) {
    throw new FormatError('Invalid vault snapshot context ID');
  }
  return bytes;
}

function encodeContext(context: VaultSnapshotContext): Buffer {
  const { accountId, deviceId, sequence } = context;
  const account = encodeId(accountId);
  const device = encodeId(deviceId);
  if (
    typeof sequence !== 'bigint' ||
    sequence < 0n ||
    sequence > MAX_SEQUENCE
  ) {
    throw new FormatError('Invalid vault snapshot sequence');
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(sequence);
  return Buffer.concat([
    Buffer.of(account.length),
    account,
    Buffer.of(device.length),
    device,
    counter,
  ]);
}

function checkKey(key: Uint8Array): void {
  if (!(key instanceof Uint8Array) || key.length !== nacl.secretbox.keyLength) {
    throw new InvalidKeyError('Vault snapshot key must be 32 bytes');
  }
}

/** Seal a bounded snapshot with a fresh cryptographically random nonce. */
export function sealVaultSnapshot(
  snapshot: Uint8Array,
  options: SealVaultSnapshotOptions,
): Uint8Array {
  const { key, keyId, context, compression = 'none' } = options;
  checkKey(key);
  if (
    !(snapshot instanceof Uint8Array) ||
    snapshot.length > MAX_SNAPSHOT_BYTES
  ) {
    throw new FormatError('Invalid vault snapshot size');
  }
  if (
    typeof keyId !== 'string' ||
    keyId.length !== 32 ||
    /[^0-9a-f]/.test(keyId)
  ) {
    throw new FormatError('Invalid vault snapshot key ID');
  }
  if (compression !== 'none' && compression !== 'zlib') {
    throw new FormatError('Unsupported vault snapshot compression');
  }
  const contextBytes = encodeContext(context);
  const nonce = randomBytes(nacl.secretbox.nonceLength);
  const header = Buffer.concat([
    MAGIC,
    Buffer.of(VERSION, ALGORITHM, compression === 'zlib' ? 1 : 0),
    Buffer.from(keyId, 'hex'),
    nonce,
  ]);
  const payload =
    compression === 'zlib'
      ? deflateSync(snapshot, { maxOutputLength: MAX_ENCODED_BYTES })
      : snapshot;
  // Secretbox has no AAD. Its authenticated plaintext starts with an exact
  // copy of the wire header followed by the private context.
  const message = Buffer.concat([header, contextBytes, payload]);
  const ciphertext = nacl.secretbox(message, nonce, key);
  const envelope = Buffer.alloc(header.length + ciphertext.length);
  header.copy(envelope);
  envelope.set(ciphertext, header.length);
  return envelope;
}

/** Authenticate the header and context before decoding any snapshot bytes. */
export function openVaultSnapshot(
  envelope: Uint8Array,
  { context, resolveKey }: OpenVaultSnapshotOptions,
): Uint8Array {
  const minBytes =
    2 * HEADER_BYTES + MIN_CONTEXT_BYTES + nacl.secretbox.overheadLength;
  if (
    !(envelope instanceof Uint8Array) ||
    envelope.length < minBytes ||
    envelope.length > MAX_ENVELOPE_BYTES
  ) {
    throw new FormatError('Invalid vault snapshot envelope size');
  }
  // Keep the same bytes across the caller's lookup, even if it mutates the input.
  const bytes = Buffer.from(envelope);
  if (
    !bytes.subarray(0, MAGIC.length).equals(MAGIC) ||
    bytes[4] !== VERSION ||
    bytes[5] !== ALGORITHM ||
    (bytes[6] !== 0 && bytes[6] !== 1)
  ) {
    throw new FormatError('Unsupported vault snapshot header');
  }

  const prefix = Buffer.concat([
    bytes.subarray(0, HEADER_BYTES),
    encodeContext(context),
  ]);
  const payloadLength =
    bytes.length - HEADER_BYTES - nacl.secretbox.overheadLength - prefix.length;
  const compressed = bytes[6] === 1;
  if (
    payloadLength < 0 ||
    payloadLength > (compressed ? MAX_ENCODED_BYTES : MAX_SNAPSHOT_BYTES)
  ) {
    throw new FormatError('Invalid vault snapshot payload size');
  }

  const keyId = bytes.toString('hex', KEY_ID_OFFSET, NONCE_OFFSET);
  const key = resolveKey(keyId);
  if (key === undefined) {
    throw new KeyNotFoundError('Vault snapshot key not found', keyId);
  }
  checkKey(key);
  const nonce = bytes.subarray(NONCE_OFFSET, HEADER_BYTES);
  const message = nacl.secretbox.open(bytes.subarray(HEADER_BYTES), nonce, key);
  if (
    !message ||
    !timingSafeEqual(prefix, message.subarray(0, prefix.length))
  ) {
    throw new DecryptError('Vault snapshot authentication failed');
  }

  const payload = message.subarray(prefix.length);
  if (!compressed) {
    return payload.slice();
  }
  try {
    // Node returns the engine when info is true, but its types omit that overload.
    const result = inflateSync(payload, {
      info: true,
      maxOutputLength: MAX_SNAPSHOT_BYTES,
    }) as unknown as { buffer: Buffer; engine: Inflate };
    if (result.engine.bytesWritten === payload.length) {
      const snapshot = Buffer.alloc(result.buffer.length);
      result.buffer.copy(snapshot);
      return snapshot;
    }
  } catch {
    // Treat all zlib failures, including the output cap, as invalid payloads.
  }
  throw new DecryptError('Invalid vault snapshot compression payload');
}
