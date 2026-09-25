import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  BtcpayApiError,
  BtcpayClient,
  isValidBtcpayWebhookSignature,
  parseBtcpayWebhook,
} from './adapters/btcpay.js';
import { PaymentConfigurationError, PaymentProviderError } from './errors.js';

const API_KEY = 'test-api-key-do-not-log';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function client(fetch: ReturnType<typeof vi.fn>) {
  return new BtcpayClient({
    baseUrl: 'https://btcpay.example.com/',
    apiKey: API_KEY,
    storeId: 'store/1',
    fetch,
  });
}

const invoiceBody = {
  id: 'inv_1',
  storeId: 'store/1',
  status: 'Settled',
  additionalStatus: 'PaidOver',
  amount: '25.00',
  currency: 'CAD',
  checkoutLink: 'https://btcpay.example.com/i/inv_1',
  createdTime: 1_790_000_000,
  expirationTime: 1_790_000_900,
  monitoringExpiration: 1_790_086_400,
  archived: false,
  metadata: { orderId: 'order-1', purpose: 'credit_purchase' },
  checkout: { speedPolicy: 'MediumSpeed' },
};

describe('BtcpayClient', () => {
  it('validates configuration without echoing secrets', () => {
    const fetch = vi.fn();
    expect(
      () =>
        new BtcpayClient({
          baseUrl: 'https://btcpay.example.com/api',
          apiKey: API_KEY,
          storeId: 's',
          fetch,
        }),
    ).toThrow(PaymentConfigurationError);
    expect(
      () =>
        new BtcpayClient({
          baseUrl: 'https://user:pw@btcpay.example.com',
          apiKey: API_KEY,
          storeId: 's',
          fetch,
        }),
    ).toThrow(/origin/);
    expect(
      () =>
        new BtcpayClient({
          baseUrl: 'ftp://btcpay.example.com',
          apiKey: API_KEY,
          storeId: 's',
          fetch,
        }),
    ).toThrow(/http/);
    expect(
      () =>
        new BtcpayClient({
          baseUrl: 'https://btcpay.example.com',
          apiKey: ' ',
          storeId: 's',
          fetch,
        }),
    ).toThrow(/apiKey is required/);
    expect(
      () =>
        new BtcpayClient({
          baseUrl: 'https://btcpay.example.com',
          apiKey: API_KEY,
          storeId: '',
          fetch,
        }),
    ).toThrow(/storeId is required/);
    expect(
      () =>
        new BtcpayClient({
          baseUrl: 'https://btcpay.example.com',
          apiKey: API_KEY,
          storeId: 's',
          fetch,
          timeoutMs: 0,
        }),
    ).toThrow(/timeoutMs/);
  });

  it('creates an invoice with orderId, checkout options, and auth header', async () => {
    const fetch = vi.fn(async () => jsonResponse(invoiceBody));
    const invoice = await client(fetch).createInvoice({
      amount: '25.00',
      currency: 'CAD',
      orderId: 'order-1',
      metadata: { purpose: 'credit_purchase' },
      checkout: {
        speedPolicy: 'MediumSpeed',
        paymentMethods: ['BTC-CHAIN'],
        expirationMinutes: 15,
        monitoringMinutes: 1440,
        paymentTolerance: 0,
        redirectURL: 'https://app.example.com/done',
        defaultLanguage: undefined,
      },
      additionalSearchTerms: ['order-1'],
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://btcpay.example.com/api/v1/stores/store%2F1/invoices',
    );
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe(`token ${API_KEY}`);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({
      amount: '25.00',
      currency: 'CAD',
      metadata: { purpose: 'credit_purchase', orderId: 'order-1' },
      checkout: {
        speedPolicy: 'MediumSpeed',
        paymentMethods: ['BTC-CHAIN'],
        expirationMinutes: 15,
        monitoringMinutes: 1440,
        paymentTolerance: 0,
        redirectURL: 'https://app.example.com/done',
      },
      additionalSearchTerms: ['order-1'],
    });

    expect(invoice).toMatchObject({
      id: 'inv_1',
      status: 'Settled',
      additionalStatus: 'PaidOver',
      amount: '25.00',
      currency: 'CAD',
      checkoutLink: 'https://btcpay.example.com/i/inv_1',
      archived: false,
      metadata: { orderId: 'order-1' },
    });
    expect(invoice.createdTime?.toISOString()).toBe(
      new Date(1_790_000_000_000).toISOString(),
    );
    expect(invoice.monitoringExpiration?.getTime()).toBe(1_790_086_400_000);
  });

  it('refuses non-decimal amounts before calling BTCPay', async () => {
    const fetch = vi.fn();
    await expect(
      client(fetch).createInvoice({ amount: '1e3', currency: 'CAD' }),
    ).rejects.toThrow(/decimal string/);
    await expect(
      client(fetch).createInvoice({ amount: '-1', currency: 'CAD' }),
    ).rejects.toThrow(/decimal string/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads an invoice and defaults missing fields', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ id: 'inv_2', amount: 10, currency: 'USD' }),
    );
    const invoice = await client(fetch).getInvoice('inv_2');
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://btcpay.example.com/api/v1/stores/store%2F1/invoices/inv_2',
    );
    expect(invoice).toMatchObject({
      id: 'inv_2',
      status: 'New',
      additionalStatus: 'None',
      amount: '10',
      metadata: {},
      checkout: {},
    });
  });

  it('lists invoices with repeated orderId and status filters', async () => {
    const fetch = vi.fn(async () => jsonResponse([invoiceBody]));
    const invoices = await client(fetch).listInvoices({
      orderId: ['a b', 'c'],
      status: ['New', 'Settled'],
      take: 5,
      skip: 0,
    });
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/v1/stores/store%2F1/invoices');
    expect(url.searchParams.getAll('orderId')).toEqual(['a b', 'c']);
    expect(url.searchParams.getAll('status')).toEqual(['New', 'Settled']);
    expect(url.searchParams.get('take')).toBe('5');
    expect(url.searchParams.get('skip')).toBe('0');
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.id).toBe('inv_1');
  });

  it('lists without a query string when no filters are given', async () => {
    const fetch = vi.fn(async () => jsonResponse({ items: [] }));
    await expect(client(fetch).listInvoices()).resolves.toEqual([]);
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://btcpay.example.com/api/v1/stores/store%2F1/invoices',
    );
    await expect(client(fetch).listInvoices({ take: -1 })).rejects.toThrow(
      /non-negative integer/,
    );
  });

  it('reads payment methods for 2.x and 1.x shapes, keeping decimals as strings', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse([
        {
          paymentMethodId: 'BTC-CHAIN',
          currency: 'BTC',
          destination: 'bc1qdest',
          rate: '85000.12',
          amount: '0.00029411',
          paymentMethodPaid: '0.00029411',
          totalPaid: '0.00029411',
          due: '0.00000000',
          payments: [
            {
              id: 'tx1-0',
              receivedDate: 1_790_000_100,
              value: '0.00029411',
              fee: '0.00000100',
              status: 'Settled',
              destination: 'bc1qdest',
            },
          ],
        },
        {
          paymentMethod: 'BTC',
          cryptoCode: 'BTC',
          rate: 1e-7,
          amount: '0.1',
          payments: 'not-an-array',
        },
      ]),
    );
    const methods = await client(fetch).getInvoicePaymentMethods('inv_1');
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://btcpay.example.com/api/v1/stores/store%2F1/invoices/inv_1/payment-methods',
    );
    expect(methods[0]).toMatchObject({
      paymentMethodId: 'BTC-CHAIN',
      currency: 'BTC',
      rate: '85000.12',
      paymentMethodPaid: '0.00029411',
      due: '0.00000000',
      payments: [
        {
          id: 'tx1-0',
          value: '0.00029411',
          fee: '0.00000100',
          status: 'Settled',
        },
      ],
    });
    expect(methods[0]?.payments[0]?.receivedDate?.getTime()).toBe(
      1_790_000_100_000,
    );
    expect(methods[1]).toMatchObject({
      paymentMethodId: 'BTC',
      currency: 'BTC',
      rate: '0.0000001',
      paymentMethodPaid: '0',
      payments: [],
    });
  });

  it('maps Greenfield errors without leaking the API key', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ code: 'invoice-not-found', message: 'Not found' }, 404),
    );
    const error = await client(fetch)
      .getInvoice('missing')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BtcpayApiError);
    expect(error).toBeInstanceOf(PaymentProviderError);
    expect(error).toMatchObject({
      status: 404,
      apiCode: 'invoice-not-found',
      retryable: false,
    });
    expect(String((error as Error).message)).toContain('HTTP 404: Not found');
    expect(String((error as Error).message)).not.toContain(API_KEY);
  });

  it('maps validation errors and marks 5xx, 429 and network failures retryable', async () => {
    const validation = vi.fn(async () =>
      jsonResponse([{ path: 'amount', message: 'must be positive' }], 422),
    );
    await expect(
      client(validation).createInvoice({ amount: '0', currency: 'CAD' }),
    ).rejects.toMatchObject({
      status: 422,
      apiCode: 'validation-error',
      message: expect.stringContaining('amount: must be positive'),
    });

    const unavailable = vi.fn(
      async () => new Response('oops', { status: 503 }),
    );
    await expect(client(unavailable).getInvoice('x')).rejects.toMatchObject({
      status: 503,
      retryable: true,
    });

    const limited = vi.fn(async () => jsonResponse({}, 429));
    await expect(client(limited).getInvoice('x')).rejects.toMatchObject({
      status: 429,
      retryable: true,
    });

    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(client(offline).getInvoice('x')).rejects.toMatchObject({
      status: 0,
      retryable: true,
    });
  });

  it('never marks an ambiguous createInvoice failure retryable', async () => {
    const offline = vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    await expect(
      client(offline).createInvoice({ amount: '1.00', currency: 'CAD' }),
    ).rejects.toMatchObject({ status: 0, retryable: false });
    expect(
      await client(offline)
        .createInvoice({ amount: '1.00', currency: 'CAD' })
        .catch((error: Error) => error.message),
    ).toContain('timed out');

    const unavailable = vi.fn(async () => jsonResponse({}, 502));
    await expect(
      client(unavailable).createInvoice({ amount: '1.00', currency: 'CAD' }),
    ).rejects.toMatchObject({ status: 502, retryable: false });

    const limited = vi.fn(async () => jsonResponse({}, 429));
    await expect(
      client(limited).createInvoice({ amount: '1.00', currency: 'CAD' }),
    ).rejects.toMatchObject({ status: 429, retryable: true });
  });

  it('rejects malformed success bodies', async () => {
    await expect(
      client(vi.fn(async () => new Response('not json'))).getInvoice('x'),
    ).rejects.toThrow(/invalid JSON/);
    await expect(
      client(vi.fn(async () => jsonResponse({ nope: true }))).getInvoice('x'),
    ).rejects.toThrow(/no id/);
    await expect(
      client(vi.fn(async () => jsonResponse({}))).getInvoicePaymentMethods('x'),
    ).rejects.toThrow(/not an array/);
    await expect(
      client(vi.fn(async () => jsonResponse({ items: 'x' }))).listInvoices(),
    ).rejects.toThrow(/not an array/);
  });
});

describe('BTCPay webhooks', () => {
  const secret = 'whsec-test';
  const body = JSON.stringify({
    deliveryId: 'del_2',
    webhookId: 'wh_1',
    originalDeliveryId: 'del_1',
    isRedelivery: true,
    type: 'InvoiceSettled',
    timestamp: 1_790_000_200,
    storeId: 'store/1',
    invoiceId: 'inv_1',
    metadata: { orderId: 'order-1' },
    manuallyMarked: false,
  });
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  it('accepts a valid signature, case-insensitively', () => {
    expect(isValidBtcpayWebhookSignature(body, signature, secret)).toBe(true);
    expect(
      isValidBtcpayWebhookSignature(
        body,
        signature.toUpperCase().replace('SHA256=', 'sha256='),
        secret,
      ),
    ).toBe(true);
  });

  it('rejects wrong, missing, or malformed signatures', () => {
    expect(isValidBtcpayWebhookSignature(`${body} `, signature, secret)).toBe(
      false,
    );
    expect(isValidBtcpayWebhookSignature(body, signature, 'other')).toBe(false);
    expect(isValidBtcpayWebhookSignature(body, undefined, secret)).toBe(false);
    expect(isValidBtcpayWebhookSignature(body, null, secret)).toBe(false);
    expect(isValidBtcpayWebhookSignature(body, 'sha256=abc', secret)).toBe(
      false,
    );
    expect(
      isValidBtcpayWebhookSignature(
        body,
        signature.replace('sha256=', ''),
        secret,
      ),
    ).toBe(false);
    expect(isValidBtcpayWebhookSignature(body, signature, '')).toBe(false);
  });

  it('parses a delivery', () => {
    const delivery = parseBtcpayWebhook(body);
    expect(delivery).toMatchObject({
      deliveryId: 'del_2',
      webhookId: 'wh_1',
      originalDeliveryId: 'del_1',
      isRedelivery: true,
      type: 'InvoiceSettled',
      storeId: 'store/1',
      invoiceId: 'inv_1',
      metadata: { orderId: 'order-1' },
    });
    expect(delivery.timestamp?.getTime()).toBe(1_790_000_200_000);
    expect(delivery.raw.manuallyMarked).toBe(false);
  });

  it('rejects malformed deliveries', () => {
    expect(() => parseBtcpayWebhook('nope')).toThrow(/not JSON/);
    expect(() => parseBtcpayWebhook('[]')).toThrow(/not an object/);
    expect(() => parseBtcpayWebhook('{"type":"InvoiceSettled"}')).toThrow(
      /deliveryId and type/,
    );
  });
});
