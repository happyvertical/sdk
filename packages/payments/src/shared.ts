import {
  PaymentConfigurationError,
  PaymentProviderError,
  PaymentUnsupportedError,
} from './errors.js';
import type {
  PaymentEvent,
  PaymentStatus,
  PaymentStatusResult,
  WatchPaymentInput,
} from './types.js';

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export const TERMINAL_PAYMENT_STATUSES = new Set<PaymentStatus>([
  'confirmed',
  'failed',
  'expired',
  'refunded',
]);
export const DEFAULT_MAX_STORED_PAYMENT_OPTIONS = 1_000;
const MAX_DECIMAL_PRECISION = 100;
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);
const THREE_DECIMAL_CURRENCIES = new Set([
  'BHD',
  'IQD',
  'JOD',
  'KWD',
  'LYD',
  'OMR',
  'TND',
]);
const TWO_DECIMAL_WHOLE_UNIT_CURRENCIES = new Set(['ISK', 'UGX']);

export function getFetch(fetchLike?: FetchLike): FetchLike {
  const resolved = fetchLike ?? globalThis.fetch;

  if (!resolved) {
    throw new PaymentProviderError(
      'A fetch implementation is required in this runtime.',
    );
  }

  if (typeof resolved !== 'function') {
    throw new PaymentProviderError('Fetch implementation must be a function.');
  }

  return resolved.bind(globalThis) as FetchLike;
}

export function normalizeDate(value: Date | string): Date {
  if (!(value instanceof Date) && typeof value !== 'string') {
    throw new PaymentProviderError(`Invalid date value: ${String(value)}`);
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new PaymentProviderError(`Invalid date value: ${String(value)}`);
  }

  return date;
}

export function normalizeFutureDate(
  value: Date | string,
  context: string,
): Date {
  const date = normalizeDate(value);

  if (date.getTime() <= Date.now()) {
    throw new PaymentProviderError(`${context} is in the past.`);
  }

  return date;
}

export function normalizeAmount(value: string): string {
  if (typeof value !== 'string') {
    throw new PaymentProviderError('Monetary amounts must be decimal strings.');
  }

  const raw = value.trim();

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new PaymentProviderError(`Invalid amount value: ${String(value)}`);
  }

  const [whole, fraction] = raw.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFraction = fraction?.replace(/0+$/, '');

  return normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
}

export function normalizePositiveAmount(
  value: string,
  context: string,
): string {
  const amount = normalizeAmount(value);

  if (amount === '0') {
    throw new PaymentProviderError(`${context} must be greater than zero.`);
  }

  return amount;
}

export function normalizeCurrency(value: string, context: string): string {
  if (typeof value !== 'string') {
    throw new PaymentProviderError(`${context} currency must be a string.`);
  }

  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z0-9]{3,10}$/.test(normalized)) {
    throw new PaymentProviderError(
      `${context} currency must be a currency code, received ${String(value)}.`,
    );
  }

  return normalized;
}

export function normalizeMinorUnitAmount(
  value: number,
  context: string,
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PaymentProviderError(
      `${context} must be a non-negative integer in the smallest currency unit, received ${String(value)}.`,
    );
  }

  return value;
}

export function normalizePositiveMinorUnitAmount(
  value: number,
  context: string,
): number {
  const amount = normalizeMinorUnitAmount(value, context);

  if (amount === 0) {
    throw new PaymentProviderError(`${context} must be greater than zero.`);
  }

  return amount;
}

export function normalizePositivePaymentAmount(
  value: number,
  currency: string,
  context: string,
): number {
  const amount = normalizePositiveMinorUnitAmount(value, context);
  const normalizedCurrency = normalizeCurrency(currency, context);

  if (
    TWO_DECIMAL_WHOLE_UNIT_CURRENCIES.has(normalizedCurrency) &&
    amount % 100 !== 0
  ) {
    throw new PaymentProviderError(
      `${context} for ${normalizedCurrency} must be evenly divisible by 100.`,
    );
  }

  return amount;
}

export function normalizeMaxStoredPaymentOptions(
  value: number | undefined,
  context: string,
): number {
  if (value === undefined) {
    return DEFAULT_MAX_STORED_PAYMENT_OPTIONS;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PaymentConfigurationError(
      `${context} must be a positive safe integer.`,
    );
  }

  return value;
}

export function rememberPaymentOption<TOption>(
  optionsByQuote: Map<string, TOption>,
  quoteId: string,
  option: TOption,
  maxStoredPaymentOptions: number,
): void {
  optionsByQuote.delete(quoteId);
  optionsByQuote.set(quoteId, option);

  while (optionsByQuote.size > maxStoredPaymentOptions) {
    const oldestQuoteId = optionsByQuote.keys().next().value;

    if (oldestQuoteId === undefined) {
      return;
    }

    optionsByQuote.delete(oldestQuoteId);
  }
}

export function normalizeNonEmptyString(
  value: string,
  context: string,
): string {
  if (typeof value !== 'string') {
    throw new PaymentProviderError(`${context} must be a string.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new PaymentProviderError(`${context} must not be empty.`);
  }

  return normalized;
}

export function normalizeUrlString(value: string, context: string): string {
  const normalized = normalizeNonEmptyString(value, context);

  try {
    const url = new URL(normalized);

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new PaymentConfigurationError(`${context} must use http or https.`);
    }
  } catch (error) {
    if (error instanceof PaymentConfigurationError) {
      throw error;
    }

    throw new PaymentConfigurationError(`${context} must be a valid URL.`, {
      cause: error,
    });
  }

  return normalized;
}

export function decimalToAtomicUnits(value: string, decimals: number): string {
  const precision = normalizeDecimalPrecision(decimals);

  const normalized = normalizeAmount(value);
  const [whole, fraction = ''] = normalized.split('.');

  if (fraction.length > precision) {
    throw new PaymentProviderError(
      `Amount ${String(value)} has more than ${precision} decimal places.`,
    );
  }

  const padded = `${fraction}${'0'.repeat(precision)}`.slice(0, precision);
  const combined = `${whole}${padded}`.replace(/^0+(?=\d)/, '');

  return combined || '0';
}

export function atomicUnitsToDecimal(
  value: string | bigint,
  decimals: number,
): string {
  const precision = normalizeDecimalPrecision(decimals);

  if (typeof value !== 'string' && typeof value !== 'bigint') {
    throw new PaymentProviderError(
      `Invalid atomic amount value: ${String(value)}`,
    );
  }

  const raw = typeof value === 'bigint' ? value.toString() : value;

  if (!/^\d+$/.test(raw)) {
    throw new PaymentProviderError(
      `Invalid atomic amount value: ${String(value)}`,
    );
  }

  if (precision === 0) {
    return raw || '0';
  }

  const padded = raw.padStart(precision + 1, '0');
  const whole = padded.slice(0, -precision);
  const fraction = padded.slice(-precision).replace(/0+$/, '');

  return fraction ? `${whole}.${fraction}` : whole;
}

export function amountToMinorUnits(value: string, decimals = 2): string {
  return decimalToAtomicUnits(value, decimals);
}

export function minorUnitsToDecimal(value: number, decimals: number): string {
  return atomicUnitsToDecimal(
    BigInt(normalizeMinorUnitAmount(value, 'Minor-unit')),
    decimals,
  );
}

export function decimalToMinorUnitAmount(
  value: string | bigint,
  decimals: number,
  context: string,
): number {
  const atomic =
    typeof value === 'bigint'
      ? value
      : BigInt(decimalToAtomicUnits(value, decimals));

  if (atomic < 0n) {
    throw new PaymentProviderError(
      `Invalid atomic amount value: ${String(value)}`,
    );
  }

  if (atomic > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PaymentProviderError(
      `${context} amount exceeds JavaScript's safe integer range.`,
    );
  }

  return Number(atomic);
}

export function currencyMinorUnitDecimals(currency: string): number {
  const normalized = normalizeCurrency(currency, 'Payment');

  if (normalized === 'BTC') {
    return 8;
  }

  if (normalized === 'USDC') {
    return 6;
  }

  if (THREE_DECIMAL_CURRENCIES.has(normalized)) {
    return 3;
  }

  return ZERO_DECIMAL_CURRENCIES.has(normalized) ? 0 : 2;
}

export function applyExpiryToPendingStatus(
  status: PaymentStatus,
  expiresAt?: Date,
): PaymentStatus {
  if (!expiresAt || expiresAt >= new Date()) {
    return status;
  }

  return status === 'pending' || status === 'requires_action'
    ? 'expired'
    : status;
}

function normalizeDecimalPrecision(decimals: number): number {
  if (
    !Number.isSafeInteger(decimals) ||
    decimals < 0 ||
    decimals > MAX_DECIMAL_PRECISION
  ) {
    throw new PaymentProviderError(
      `Invalid decimal precision: ${String(decimals)}`,
    );
  }

  return decimals;
}

export function compareDecimalAmounts(left: string, right: string): -1 | 0 | 1 {
  const [leftWhole, leftFraction = ''] = normalizeAmount(left).split('.');
  const [rightWhole, rightFraction = ''] = normalizeAmount(right).split('.');
  const leftWholeValue = BigInt(leftWhole ?? '0');
  const rightWholeValue = BigInt(rightWhole ?? '0');

  if (leftWholeValue > rightWholeValue) {
    return 1;
  }

  if (leftWholeValue < rightWholeValue) {
    return -1;
  }

  const scale = Math.max(leftFraction.length, rightFraction.length);
  const leftFractionValue = BigInt(
    (leftFraction + '0'.repeat(scale)).slice(0, scale) || '0',
  );
  const rightFractionValue = BigInt(
    (rightFraction + '0'.repeat(scale)).slice(0, scale) || '0',
  );

  if (leftFractionValue > rightFractionValue) {
    return 1;
  }

  if (leftFractionValue < rightFractionValue) {
    return -1;
  }

  return 0;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    const handleAbort = (): void => {
      clearTimeout(timeout);
      reject(signal?.reason);
    };
    const handleResolve = (): void => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    };

    timeout = setTimeout(handleResolve, ms);
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

export async function* pollPaymentStatus(
  input: WatchPaymentInput,
  getStatus: () => Promise<PaymentStatusResult>,
): AsyncIterable<PaymentEvent> {
  const startedAt = Date.now();
  const pollIntervalMs = normalizePollIntervalMs(input.pollIntervalMs ?? 5_000);
  const timeoutMs =
    input.timeoutMs === undefined
      ? undefined
      : normalizeTimeoutMs(input.timeoutMs);
  let lastStatus: PaymentStatus | undefined;
  let lastResult: PaymentStatusResult | undefined;

  const remainingTimeoutMs = (): number | undefined =>
    timeoutMs === undefined ? undefined : timeoutMs - (Date.now() - startedAt);

  const yieldTimeoutEvent = async (): Promise<PaymentEvent> => ({
    ...(lastResult ?? (await getStatus())),
    event: 'timeout',
    status: lastResult?.status ?? 'pending',
    updatedAt: new Date(),
  });

  while (!input.signal?.aborted) {
    if ((remainingTimeoutMs() ?? 1) <= 0) {
      yield await yieldTimeoutEvent();
      return;
    }

    const status = await getStatus();
    lastResult = status;

    if (status.status !== lastStatus) {
      const event = toPaymentEvent(status);
      yield event;
      lastStatus = status.status;

      if (TERMINAL_PAYMENT_STATUSES.has(status.status)) {
        return;
      }
    }

    const remaining = remainingTimeoutMs();

    if (remaining !== undefined && remaining <= 0) {
      yield await yieldTimeoutEvent();
      return;
    }

    await sleep(
      remaining === undefined
        ? pollIntervalMs
        : Math.min(pollIntervalMs, remaining),
      input.signal,
    );
  }
}

function normalizePollIntervalMs(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new PaymentProviderError(
      `pollIntervalMs must be a positive integer, received ${String(value)}.`,
    );
  }

  return value;
}

function normalizeTimeoutMs(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new PaymentProviderError(
      `timeoutMs must be a non-negative integer, received ${String(value)}.`,
    );
  }

  return value;
}

export function toPaymentEvent(status: PaymentStatusResult): PaymentEvent {
  if (status.status === 'confirmed') {
    return { ...status, event: 'confirmed' };
  }

  if (status.status === 'failed') {
    return { ...status, event: 'failed' };
  }

  if (status.status === 'expired') {
    return { ...status, event: 'expired' };
  }

  if (status.status === 'refunded') {
    return { ...status, event: 'refunded' };
  }

  return { ...status, event: 'status' };
}

export async function readJsonResponse<T>(
  response: Response,
  context: string,
): Promise<T> {
  const text = await response.text();
  let body: unknown;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch (error) {
      if (response.ok) {
        throw new PaymentProviderError(`${context}: invalid JSON response`, {
          cause: error,
        });
      }

      body = undefined;
    }
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : body &&
            typeof body === 'object' &&
            typeof (body as { error?: unknown }).error === 'string'
          ? String((body as { error: string }).error)
          : body &&
              typeof body === 'object' &&
              'error' in body &&
              typeof (body as { error?: { message?: unknown } }).error
                ?.message === 'string'
            ? (body as { error: { message: string } }).error.message
            : text || response.statusText;

    throw new PaymentProviderError(`${context}: ${message}`, {
      retryable: response.status >= 500,
    });
  }

  if (body === undefined) {
    throw new PaymentProviderError(`${context}: empty response body`);
  }

  return body as T;
}

export function formEncode(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    searchParams.set(key, String(value));
  }

  return searchParams.toString();
}

export function throwUnsupported(message: string): never {
  throw new PaymentUnsupportedError(message);
}
