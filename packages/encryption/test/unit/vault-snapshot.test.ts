import { randomBytes } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import nacl from 'tweetnacl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DecryptError,
  FormatError,
  InvalidKeyError,
  KeyNotFoundError,
} from '../../src/index.js';
import {
  openVaultSnapshot,
  sealVaultSnapshot,
} from '../../src/vault-snapshot.js';
import fixture from '../../vault-snapshot-v1-vectors.json';

vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:crypto')>();
  return { ...original, randomBytes: vi.fn(original.randomBytes) };
});

vi.mock('node:zlib', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:zlib')>();
  return { ...original, inflateSync: vi.fn(original.inflateSync) };
});

const key = Buffer.from(fixture.keyHex, 'hex');
const keyId = fixture.keyIdHex;
const snapshot = Buffer.from(fixture.snapshotHex, 'hex');
const context = {
  accountId: fixture.accountId,
  deviceId: fixture.deviceId,
  sequence: BigInt(`0x${fixture.sequenceHex}`),
};
const options = { key, keyId, context };
const plain = Buffer.from(fixture.vectors[0].envelopeHex, 'hex');
const compressed = Buffer.from(fixture.vectors[1].envelopeHex, 'hex');
const resolveKey = vi.fn((id: string): Uint8Array | undefined =>
  id === keyId ? key : undefined,
);
const restore = { context, resolveKey };
const maxSnapshot = 8 * 1024 * 1024;

// Produce authenticated malformed input a key holder could send.
function withCompressedPayload(payload: Uint8Array): Buffer {
  const header = compressed.subarray(0, 47);
  const message = Buffer.concat([
    header,
    Buffer.from(fixture.contextHex, 'hex'),
    payload,
  ]);
  return Buffer.concat([
    header,
    nacl.secretbox(message, header.subarray(23), key),
  ]);
}

describe('vault snapshot envelope', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(
    fixture.vectors,
  )('opens the independent $compression vector', (vector) => {
    expect(
      Buffer.from(
        openVaultSnapshot(Buffer.from(vector.envelopeHex, 'hex'), restore),
      ),
    ).toEqual(snapshot);
    expect(resolveKey).toHaveBeenCalledExactlyOnceWith(keyId);
  });

  it('seals exactly the documented wire bytes given the same nonce and encoded payload', () => {
    vi.mocked(randomBytes).mockImplementationOnce(() =>
      Buffer.from(fixture.vectors[0].nonceHex, 'hex'),
    );
    expect(sealVaultSnapshot(snapshot, options)).toEqual(plain);
  });

  it('uses a fresh nonce and keeps the context and snapshot out of the cleartext frame', () => {
    const first = Buffer.from(sealVaultSnapshot(snapshot, options));
    const second = Buffer.from(sealVaultSnapshot(snapshot, options));
    expect(first.subarray(23, 47)).not.toEqual(second.subarray(23, 47));
    for (const bytes of [
      snapshot,
      Buffer.from(context.accountId),
      Buffer.from(context.deviceId),
    ]) {
      expect(first.includes(bytes)).toBe(false);
    }
    expect(Buffer.from(openVaultSnapshot(first, restore))).toEqual(snapshot);
    expect(Buffer.from(openVaultSnapshot(second, restore))).toEqual(snapshot);
  });

  it.each([
    'none',
    'zlib',
  ] as const)('returns independently backed records and snapshots with %s compression', (compression) => {
    const input = Uint8Array.from([1, 2, 3, 4, 5]);
    const envelope = sealVaultSnapshot(input, { ...options, compression });
    expect(Buffer.isBuffer(envelope)).toBe(true);
    expect(envelope.byteOffset).toBe(0);
    expect(envelope.buffer.byteLength).toBe(envelope.byteLength);

    const opened = openVaultSnapshot(envelope, restore);
    expect(Uint8Array.from(opened)).toEqual(input);
    expect(opened.byteOffset).toBe(0);
    expect(opened.buffer.byteLength).toBe(opened.byteLength);
    expect(input).toEqual(Uint8Array.from([1, 2, 3, 4, 5]));
  });

  it('handles empty snapshots, zero and maximum sequences, and maximum ID byte lengths', () => {
    for (const sequence of [0n, (1n << 64n) - 1n]) {
      const boundary = {
        accountId: `${'é'.repeat(127)}a`,
        deviceId: 'x',
        sequence,
      };
      const empty = new Uint8Array();
      for (const compression of ['none', 'zlib'] as const) {
        const envelope = sealVaultSnapshot(empty, {
          ...options,
          context: boundary,
          compression,
        });
        expect(
          openVaultSnapshot(envelope, { ...restore, context: boundary }),
        ).toHaveLength(0);
      }
    }
  });

  it.each([
    0, 4, 5, 6,
  ])('rejects unsupported header byte at offset %i before key lookup', (offset) => {
    const invalid = Buffer.from(plain);
    invalid[offset] = 0xff;
    expect(() => openVaultSnapshot(invalid, restore)).toThrow(FormatError);
    expect(resolveKey).not.toHaveBeenCalled();
  });

  it.each([23, 47, 63])('rejects tampering at offset %i', (offset) => {
    const invalid = Buffer.from(compressed);
    invalid[offset] ^= 1;
    expect(() => openVaultSnapshot(invalid, restore)).toThrow(DecryptError);
    expect(inflateSync).not.toHaveBeenCalled();
  });

  it('binds valid compression and key ID values even when a lookup returns the same key', () => {
    const remapped = Buffer.from(compressed);
    remapped[7] ^= 1;
    const resolveRemapped = vi.fn(() => key);
    expect(() =>
      openVaultSnapshot(remapped, { ...restore, resolveKey: resolveRemapped }),
    ).toThrow(DecryptError);
    expect(resolveRemapped).toHaveBeenCalledExactlyOnceWith(
      remapped.toString('hex', 7, 23),
    );

    const mode = Buffer.from(compressed);
    mode[6] = 0;
    expect(() => openVaultSnapshot(mode, restore)).toThrow(DecryptError);
    expect(inflateSync).not.toHaveBeenCalled();
  });

  it.each([
    { accountId: 'acct-雨' },
    { deviceId: 'dev-🐻' },
    { sequence: context.sequence - 1n },
  ])('rejects mismatched expected context %o', (wrong) => {
    expect(() =>
      openVaultSnapshot(compressed, {
        ...restore,
        context: { ...context, ...wrong },
      }),
    ).toThrow(DecryptError);
    expect(inflateSync).not.toHaveBeenCalled();
  });

  it('length-prefixes IDs to distinguish the same concatenated strings', () => {
    const envelope = sealVaultSnapshot(snapshot, {
      ...options,
      context: { ...context, accountId: 'ab', deviceId: 'c' },
    });
    expect(() =>
      openVaultSnapshot(envelope, {
        ...restore,
        context: { ...context, accountId: 'a', deviceId: 'bc' },
      }),
    ).toThrow(DecryptError);
  });

  it.each([
    { accountId: '' },
    { deviceId: 'é'.repeat(128) },
    { accountId: '\ud800' },
    { sequence: -1n },
    { sequence: 1n << 64n },
  ])('rejects invalid context %o before seal or lookup', (invalid) => {
    const invalidContext = { ...context, ...invalid };
    expect(() =>
      sealVaultSnapshot(snapshot, { ...options, context: invalidContext }),
    ).toThrow(FormatError);
    expect(() =>
      openVaultSnapshot(plain, { ...restore, context: invalidContext }),
    ).toThrow(FormatError);
    expect(resolveKey).not.toHaveBeenCalled();
  });

  it('rejects a malformed key ID or wrong-length key on seal', () => {
    expect(() =>
      sealVaultSnapshot(snapshot, { ...options, keyId: keyId.toUpperCase() }),
    ).toThrow(FormatError);
    expect(() =>
      sealVaultSnapshot(snapshot, { ...options, key: new Uint8Array(31) }),
    ).toThrow(InvalidKeyError);
  });

  it('fails once on missing, wrong, invalid or unavailable key', () => {
    const unavailable = new Error('key store unavailable');
    for (const [value, error] of [
      [undefined, KeyNotFoundError],
      [new Uint8Array(32), DecryptError],
      [new Uint8Array(31), InvalidKeyError],
    ] as const) {
      resolveKey.mockReturnValueOnce(value);
      expect(() => openVaultSnapshot(plain, restore)).toThrow(error);
      expect(resolveKey).toHaveBeenCalledExactlyOnceWith(keyId);
      resolveKey.mockClear();
    }
    resolveKey.mockImplementationOnce(() => {
      throw unavailable;
    });
    expect(() => openVaultSnapshot(plain, restore)).toThrow(unavailable);
    expect(resolveKey).toHaveBeenCalledExactlyOnceWith(keyId);
  });

  it('uses the same parsed bytes even if key lookup mutates the caller buffer', () => {
    const bytes = Buffer.from(plain);
    const restoreMutating = {
      ...restore,
      resolveKey: () => {
        bytes.fill(0);
        return key;
      },
    };
    expect(Buffer.from(openVaultSnapshot(bytes, restoreMutating))).toEqual(
      snapshot,
    );
  });

  it('rejects short, truncated, appended, and oversized envelopes', () => {
    expect(() => openVaultSnapshot(plain.subarray(0, 47), restore)).toThrow(
      FormatError,
    );
    expect(() =>
      openVaultSnapshot(Buffer.alloc(maxSnapshot + 128 * 1024), restore),
    ).toThrow(FormatError);
    expect(resolveKey).not.toHaveBeenCalled();
    expect(() => openVaultSnapshot(plain.subarray(0, -1), restore)).toThrow(
      DecryptError,
    );
    expect(() =>
      openVaultSnapshot(Buffer.concat([plain, Buffer.of(0)]), restore),
    ).toThrow(DecryptError);
  });

  it('rejects an authenticated message with no context', () => {
    const header = plain.subarray(0, 47);
    const invalid = Buffer.concat([
      header,
      nacl.secretbox(header, header.subarray(23), key),
    ]);
    expect(() => openVaultSnapshot(invalid, restore)).toThrow(FormatError);
    expect(resolveKey).not.toHaveBeenCalled();
  });

  it('accepts an 8 MiB decoded snapshot and refuses larger seal input', () => {
    const limit = new Uint8Array(maxSnapshot);
    const envelope = sealVaultSnapshot(limit, {
      ...options,
      compression: 'zlib',
    });
    expect(openVaultSnapshot(envelope, restore)).toHaveLength(maxSnapshot);
    expect(() =>
      sealVaultSnapshot(new Uint8Array(maxSnapshot + 1), options),
    ).toThrow(FormatError);
  });

  it('rejects bad, truncated, dictionary-based and trailing compressed bytes', () => {
    const stream = deflateSync(snapshot);
    const badChecksum = Buffer.from(stream);
    badChecksum[badChecksum.length - 1] ^= 1;
    for (const payload of [
      Buffer.of(0),
      stream.subarray(0, -1),
      badChecksum,
      deflateSync(snapshot, { dictionary: snapshot }),
      Buffer.concat([stream, Buffer.of(0)]),
      Buffer.concat([stream, stream]),
    ]) {
      expect(() =>
        openVaultSnapshot(withCompressedPayload(payload), restore),
      ).toThrow('Invalid vault snapshot compression payload');
    }
  });

  it('bounds authenticated decompression and rejects an unauthenticated bomb before zlib', () => {
    const bomb = withCompressedPayload(
      deflateSync(Buffer.alloc(maxSnapshot + 1)),
    );
    const tampered = Buffer.from(bomb);
    tampered[47] ^= 1;
    expect(() => openVaultSnapshot(tampered, restore)).toThrow(
      'Vault snapshot authentication failed',
    );
    expect(inflateSync).not.toHaveBeenCalled();
    expect(() => openVaultSnapshot(bomb, restore)).toThrow(
      'Invalid vault snapshot compression payload',
    );
    expect(inflateSync).toHaveBeenCalledTimes(1);
  });
});
