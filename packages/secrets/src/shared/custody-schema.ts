import {
  CustodyError,
  type CustodyEvent,
  type CustodyIssuanceCommit,
  type CustodyReceipt,
  redactCredentialText,
} from './custody.js';

type RecordValue = Record<string, unknown>;
function invalid(): never {
  throw new CustodyError(
    'INVALID_CUSTODY_LEDGER_STATE',
    'record',
    'Custody ledger requires non-secret, schema-valid metadata',
  );
}

function object(
  value: unknown,
  required: string[],
  optional: string[] = [],
): RecordValue {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== 'string' ||
        (!required.includes(key) && !optional.includes(key)),
    )
  )
    invalid();
  if (
    Object.values(descriptors).some(
      (entry) => !('value' in entry) || !entry.enumerable,
    )
  )
    invalid();
  if (required.some((key) => !Object.hasOwn(value, key))) invalid();
  return value as RecordValue;
}

function text(value: unknown, allowEmpty = false): asserts value is string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && !value) ||
    value.length > 4096 ||
    redactCredentialText(value) !== value
  )
    invalid();
}
function timestamp(value: unknown): void {
  text(value);
  if (!Number.isFinite(Date.parse(value))) invalid();
}
function strings(record: RecordValue, keys: string[]): void {
  for (const key of keys) text(record[key]);
}
function optional(record: RecordValue, keys: string[]): void {
  for (const key of keys) if (record[key] !== undefined) text(record[key]);
}

function receipt(value: unknown): void {
  const required = [
    'receiptId',
    'mode',
    'credentialId',
    'subject',
    'issuer',
    'verifier',
    'verificationState',
    'issuedAt',
    'verifiedAt',
    'rotationRootReceiptId',
    'attribution',
    'metadata',
    'finalizer',
    'finalizationId',
    'attestation',
  ];
  const row = object(value, required, [
    'verificationId',
    'expiresAt',
    'sink',
    'replacesReceiptId',
  ]);
  strings(row, [
    'receiptId',
    'credentialId',
    'subject',
    'issuer',
    'verifier',
    'rotationRootReceiptId',
    'finalizer',
    'finalizationId',
  ]);
  optional(row, ['verificationId', 'replacesReceiptId']);
  if (
    typeof row.mode !== 'string' ||
    !['ephemeral', 'durable'].includes(row.mode) ||
    row.verificationState !== 'verified'
  )
    invalid();
  timestamp(row.issuedAt);
  timestamp(row.verifiedAt);
  if (row.expiresAt !== undefined) timestamp(row.expiresAt);
  const attribution = object(row.attribution, ['actor', 'runtime', 'session']);
  strings(attribution, ['actor', 'runtime', 'session']);
  const metadata = row.metadata;
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    Object.getPrototypeOf(metadata) !== Object.prototype
  )
    invalid();
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(metadata),
  )) {
    text(key, true);
    if (!('value' in descriptor) || !descriptor.enumerable) invalid();
    text(descriptor.value, true);
  }
  if (Object.getOwnPropertySymbols(metadata).length) invalid();
  const attestation = object(row.attestation, [
    'algorithm',
    'attestor',
    'keyId',
    'signature',
  ]);
  strings(attestation, ['attestor', 'keyId', 'signature']);
  if (
    attestation.algorithm !== 'Ed25519' ||
    !/^[A-Za-z0-9_-]{86}$/.test(attestation.signature as string) ||
    Buffer.from(attestation.signature as string, 'base64url').toString(
      'base64url',
    ) !== attestation.signature
  )
    invalid();
  if (row.sink !== undefined) {
    const sink = object(row.sink, [
      'sinkName',
      'reference',
      'version',
      'storedAt',
    ]);
    strings(sink, ['sinkName', 'reference', 'version']);
    timestamp(sink.storedAt);
  }
}

const EVENT_TYPES = [
  'issued',
  'revoked',
  'expired',
  'replaced',
  'rollback-pending',
  'rollback-complete',
  'finalization-pending',
  'retirement-pending',
  'retirement-complete',
  'orphan-detected',
  'orphan-removed',
];
function event(value: unknown): void {
  const row = object(
    value,
    ['eventId', 'type', 'occurredAt'],
    [
      'receiptId',
      'recoveryId',
      'credentialId',
      'requiresSink',
      'finalizationReceipt',
      'recoveryReceipt',
      'replacementReceiptId',
      'sinkReference',
      'reason',
    ],
  );
  text(row.eventId);
  if (typeof row.type !== 'string' || !EVENT_TYPES.includes(row.type))
    invalid();
  timestamp(row.occurredAt);
  optional(row, [
    'receiptId',
    'recoveryId',
    'credentialId',
    'replacementReceiptId',
    'sinkReference',
    'reason',
  ]);
  if (row.requiresSink !== undefined && typeof row.requiresSink !== 'boolean')
    invalid();
  if (row.finalizationReceipt !== undefined) receipt(row.finalizationReceipt);
  if (row.recoveryReceipt !== undefined) receipt(row.recoveryReceipt);
}

/** Internal serialization boundary: rejects unknown fields and non-data objects. */
export function validateCustodySnapshot(value: unknown): {
  schema: 1;
  receipts: CustodyReceipt[];
  events: CustodyEvent[];
  issuanceCommits: CustodyIssuanceCommit[];
} {
  const row = object(value, [
    'schema',
    'receipts',
    'events',
    'issuanceCommits',
  ]);
  if (
    row.schema !== 1 ||
    !Array.isArray(row.receipts) ||
    !Array.isArray(row.events) ||
    !Array.isArray(row.issuanceCommits)
  )
    invalid();
  for (const entries of [row.receipts, row.events, row.issuanceCommits]) {
    if (
      Object.getPrototypeOf(entries) !== Array.prototype ||
      Reflect.ownKeys(entries).length !== entries.length + 1
    )
      invalid();
    for (let index = 0; index < entries.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(entries, index);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        invalid();
    }
  }
  for (const entry of row.receipts) receipt(entry);
  for (const entry of row.events) event(entry);
  for (const entry of row.issuanceCommits) {
    const binding = object(entry, ['receiptId', 'eventId', 'followupEventId']);
    strings(binding, ['receiptId', 'eventId']);
    if (binding.followupEventId !== null) text(binding.followupEventId);
  }
  if (
    new Set(row.receipts.map((entry) => entry.receiptId)).size !==
      row.receipts.length ||
    new Set(row.events.map((entry) => entry.eventId)).size !==
      row.events.length ||
    new Set(row.issuanceCommits.map((entry) => entry.receiptId)).size !==
      row.issuanceCommits.length ||
    new Set(row.issuanceCommits.map((entry) => entry.eventId)).size !==
      row.issuanceCommits.length
  )
    invalid();
  // Snapshot once: callers cannot mutate inputs while awaiting a transaction.
  return JSON.parse(JSON.stringify(row));
}
