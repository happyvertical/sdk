import { SignatureInputError, SignatureProviderError } from './errors.js';

export type SignatureFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function getSignatureFetch(fetchLike?: SignatureFetch): SignatureFetch {
  const resolved = fetchLike ?? globalThis.fetch;

  if (typeof resolved !== 'function') {
    throw new SignatureProviderError(
      'A fetch implementation is required in this runtime.',
    );
  }

  return resolved.bind(globalThis) as SignatureFetch;
}

export function requireNonEmptyString(value: unknown, context: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new SignatureInputError(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

export function requireRecord(
  value: unknown,
  context: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SignatureProviderError(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

export function readString(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const item = value?.[key];

  return typeof item === 'string' ? item : undefined;
}

export function readNumber(
  value: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const item = value?.[key];

  return typeof item === 'number' && Number.isFinite(item) ? item : undefined;
}

export function readBoolean(
  value: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const item = value?.[key];

  return typeof item === 'boolean' ? item : undefined;
}

export function readRecord(
  value: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const item = value?.[key];

  return item && typeof item === 'object' && !Array.isArray(item)
    ? (item as Record<string, unknown>)
    : undefined;
}

export function readRecords(
  value: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown>[] {
  const item = value?.[key];

  return Array.isArray(item)
    ? item.filter(
        (candidate): candidate is Record<string, unknown> =>
          Boolean(candidate) &&
          typeof candidate === 'object' &&
          !Array.isArray(candidate),
      )
    : [];
}

export function normalizeDate(value: Date | string, context: string): Date {
  if (!(value instanceof Date) && typeof value !== 'string') {
    throw new SignatureInputError(`${context} must be a Date or ISO string.`);
  }

  const date = value instanceof Date ? new Date(value) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new SignatureInputError(`${context} must be a valid date.`);
  }

  return date;
}

export function parseOptionalEpochSeconds(value: unknown): Date | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1_000)
    : undefined;
}
