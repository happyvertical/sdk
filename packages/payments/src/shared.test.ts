import { describe, expect, it, vi } from 'vitest';
import { PaymentConfigurationError, PaymentProviderError } from './errors.js';
import {
  amountToMinorUnits,
  atomicUnitsToDecimal,
  compareDecimalAmounts,
  currencyMinorUnitDecimals,
  decimalToAtomicUnits,
  decimalToMinorUnitAmount,
  getFetch,
  minorUnitsToDecimal,
  normalizeAmount,
  normalizeDate,
  normalizeMaxStoredPaymentOptions,
  normalizeNonEmptyString,
  normalizePositiveAmount,
  normalizePositiveMinorUnitAmount,
  normalizePositivePaymentAmount,
  normalizeUrlString,
  pollPaymentStatus,
  readJsonResponse,
  rememberPaymentOption,
  sleep,
  toPaymentEvent,
} from './shared.js';

describe('payment amount helpers', () => {
  it('normalizes leading and trailing zeroes without losing significant cents', () => {
    expect(normalizeAmount('001.2300')).toBe('1.23');
    expect(normalizeAmount('0.000000')).toBe('0');
    expect(decimalToAtomicUnits('1.23', 6)).toBe('1230000');
    expect(atomicUnitsToDecimal('123', 0)).toBe('123');
    expect(amountToMinorUnits('10.99', 2)).toBe('1099');
  });

  it('rejects amounts with more precision than the target currency supports', () => {
    expect(() => amountToMinorUnits('10.999', 2)).toThrow(
      'more than 2 decimal places',
    );
    expect(() => decimalToAtomicUnits('0.0000009', 6)).toThrow(
      'more than 6 decimal places',
    );
    expect(() => atomicUnitsToDecimal('not-digits', 6)).toThrow(
      'Invalid atomic amount value',
    );
    expect(() => atomicUnitsToDecimal(123 as never, 6)).toThrow(
      'Invalid atomic amount value',
    );
    expect(() => atomicUnitsToDecimal(-1n, 6)).toThrow(
      'Invalid atomic amount value',
    );
    expect(() => atomicUnitsToDecimal('123', -1)).toThrow(
      'Invalid decimal precision',
    );
    expect(() => decimalToAtomicUnits('1', 101)).toThrow(
      'Invalid decimal precision',
    );
    expect(() => atomicUnitsToDecimal('1', Number.MAX_SAFE_INTEGER)).toThrow(
      'Invalid decimal precision',
    );
  });

  it('rejects numeric inputs for internal decimal helpers at runtime', () => {
    expect(() => normalizeAmount(1 as never)).toThrow(
      'Monetary amounts must be decimal strings',
    );
  });

  it('uses Stripe-style integer amounts at public boundaries', () => {
    expect(normalizePositiveMinorUnitAmount(1099, 'Amount')).toBe(1099);
    expect(minorUnitsToDecimal(1099, 2)).toBe('10.99');
    expect(minorUnitsToDecimal(42_000, 8)).toBe('0.00042');
    expect(currencyMinorUnitDecimals('USD')).toBe(2);
    expect(currencyMinorUnitDecimals(' jpy ')).toBe(0);
    expect(currencyMinorUnitDecimals('kwd')).toBe(3);
    expect(currencyMinorUnitDecimals('BTC')).toBe(8);
    expect(currencyMinorUnitDecimals('USDC')).toBe(6);
    expect(currencyMinorUnitDecimals('UGX')).toBe(2);
    expect(minorUnitsToDecimal(1234, currencyMinorUnitDecimals('KWD'))).toBe(
      '1.234',
    );
    expect(() => normalizePositiveMinorUnitAmount(10.99, 'Amount')).toThrow(
      'Amount must be a non-negative integer in the smallest currency unit',
    );
    expect(() =>
      decimalToMinorUnitAmount('9007199254740992', 0, 'Amount'),
    ).toThrow("exceeds JavaScript's safe integer range");
    expect(() => decimalToMinorUnitAmount(-1n, 0, 'Amount')).toThrow(
      'Invalid atomic amount value',
    );
    expect(normalizePositivePaymentAmount(500, 'UGX', 'Amount')).toBe(500);
    expect(() => normalizePositivePaymentAmount(501, 'UGX', 'Amount')).toThrow(
      'Amount for UGX must be evenly divisible by 100',
    );
    expect(() => normalizePositivePaymentAmount(501, 'ISK', 'Amount')).toThrow(
      'Amount for ISK must be evenly divisible by 100',
    );
  });

  it('rejects zero when an amount must be positive', () => {
    expect(normalizePositiveAmount('001.2300', 'Amount')).toBe('1.23');
    expect(() => normalizePositiveAmount('0.0000', 'Amount')).toThrow(
      'Amount must be greater than zero',
    );
  });

  it('bounds stored payment option caches by configured capacity', () => {
    const optionsByQuote = new Map<string, { quoteId: string }>();

    expect(normalizeMaxStoredPaymentOptions(undefined, 'Cache size')).toBe(
      1_000,
    );
    expect(() => normalizeMaxStoredPaymentOptions(0, 'Cache size')).toThrow(
      PaymentConfigurationError,
    );

    rememberPaymentOption(optionsByQuote, 'quote-1', { quoteId: 'quote-1' }, 2);
    rememberPaymentOption(optionsByQuote, 'quote-2', { quoteId: 'quote-2' }, 2);
    rememberPaymentOption(optionsByQuote, 'quote-3', { quoteId: 'quote-3' }, 2);

    expect([...optionsByQuote.keys()]).toEqual(['quote-2', 'quote-3']);

    rememberPaymentOption(optionsByQuote, 'quote-2', { quoteId: 'quote-2' }, 2);

    expect([...optionsByQuote.keys()]).toEqual(['quote-3', 'quote-2']);
  });

  it('normalizes required string identifiers', () => {
    expect(normalizeNonEmptyString(' quote-123 ', 'quoteId')).toBe('quote-123');
    expect(() => normalizeNonEmptyString('', 'quoteId')).toThrow(
      'quoteId must not be empty',
    );
  });

  it('validates URL strings without changing caller formatting', () => {
    expect(normalizeUrlString(' https://example.com/path ', 'url')).toBe(
      'https://example.com/path',
    );
    expect(() => normalizeUrlString('not-a-url', 'url')).toThrow(
      'url must be a valid URL',
    );
    expect(() => normalizeUrlString('javascript:alert(1)', 'url')).toThrow(
      'url must use http or https',
    );
  });

  it('compares decimal strings without floating-point conversion', () => {
    expect(compareDecimalAmounts('99.99', '100')).toBe(-1);
    expect(compareDecimalAmounts('100.00', '100')).toBe(0);
    expect(compareDecimalAmounts('1000.0000001', '1000')).toBe(1);
  });
});

describe('payment date helpers', () => {
  it('rejects numeric date inputs at runtime', () => {
    expect(() => normalizeDate(1_893_456_000_000 as never)).toThrow(
      'Invalid date value',
    );
  });
});

describe('provider response helpers', () => {
  it('rejects non-function fetch implementations', () => {
    expect(() => getFetch(123 as never)).toThrow(
      'Fetch implementation must be a function',
    );
  });

  it('wraps non-JSON provider errors with retryability metadata', async () => {
    await expect(
      readJsonResponse(
        new Response('upstream unavailable', { status: 503 }),
        'Provider request',
      ),
    ).rejects.toMatchObject({
      name: 'PaymentProviderError',
      message: 'Provider request: upstream unavailable',
      retryable: true,
    });
  });

  it('wraps invalid JSON success responses as provider errors', async () => {
    await expect(
      readJsonResponse(new Response('not json'), 'Provider request'),
    ).rejects.toBeInstanceOf(PaymentProviderError);
  });

  it('wraps empty success responses as provider errors', async () => {
    await expect(
      readJsonResponse(new Response(null, { status: 204 }), 'Provider request'),
    ).rejects.toThrow('Provider request: empty response body');
  });
});

describe('payment polling', () => {
  it('removes abort listeners after sleep resolves', async () => {
    const controller = new AbortController();
    const removeEventListener = vi.spyOn(
      controller.signal,
      'removeEventListener',
    );

    await sleep(1, controller.signal);

    expect(removeEventListener).toHaveBeenCalledWith(
      'abort',
      expect.any(Function),
    );
  });

  it('emits timeout without waiting for the full polling interval', async () => {
    const stream = pollPaymentStatus(
      {
        quoteId: 'quote-timeout',
        payTo: 'pay-to',
        pollIntervalMs: 100,
        timeoutMs: 25,
      },
      async () => ({
        backendId: 'test',
        quoteId: 'quote-timeout',
        payTo: 'pay-to',
        status: 'pending',
        settlementCurrency: 'USD',
        updatedAt: new Date(),
      }),
    );
    const iterator = stream[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      value: { event: 'status', status: 'pending' },
      done: false,
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { event: 'timeout', status: 'pending' },
      done: false,
    });
  });

  it('emits refunded as a specialized payment event', () => {
    expect(
      toPaymentEvent({
        backendId: 'test',
        quoteId: 'quote-refunded',
        payTo: 'pay-to',
        status: 'refunded',
        settlementCurrency: 'USD',
        updatedAt: new Date(),
      }),
    ).toMatchObject({ event: 'refunded', status: 'refunded' });
  });

  it('rejects invalid polling intervals before starting a watcher loop', async () => {
    const stream = pollPaymentStatus(
      {
        quoteId: 'quote-invalid-poll',
        payTo: 'pay-to',
        pollIntervalMs: 0,
      },
      async () => ({
        backendId: 'test',
        quoteId: 'quote-invalid-poll',
        payTo: 'pay-to',
        status: 'pending',
        settlementCurrency: 'USD',
        updatedAt: new Date(),
      }),
    );

    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow(
      'pollIntervalMs must be a positive integer',
    );
  });
});
