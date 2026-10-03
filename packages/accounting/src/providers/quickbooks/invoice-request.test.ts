import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  prepareQuickBooksInvoiceRequest,
  QuickBooksWriteError,
} from '../../index.js';
import type { InvoiceInput } from '../../types.js';
import { QuickBooksProvider } from './index.js';

function provider(realmId = 'realm-a', maxRetries = 2) {
  const p = new QuickBooksProvider({
    type: 'quickbooks',
    clientId: 'test',
    clientSecret: 'test',
    refreshToken: 'test',
    realmId,
    environment: 'sandbox',
    maxRetries,
    timeout: 100,
  });
  vi.spyOn(p, 'ensureAccessToken').mockResolvedValue('test-token');
  return p;
}
function invoice(): InvoiceInput {
  return {
    id: 'local-1',
    invoiceNumber: 'INV-1',
    customerId: 'customer-1',
    issueDate: new Date(2026, 8, 1),
    dueDate: new Date(2026, 8, 30),
    lineItems: [{ description: 'Work', quantity: 1, unitPrice: 50 }],
    subtotal: 50,
    taxAmount: 0,
    totalAmount: 50,
  };
}
function keyed() {
  const input = invoice();
  input.quickbooksRequest = prepareQuickBooksInvoiceRequest(input, {
    requestId: 'invoice-1',
    realmId: 'realm-a',
    environment: 'sandbox',
  });
  return input;
}
function ok() {
  return new Response(JSON.stringify({ Invoice: { Id: 'remote-1' } }));
}
async function settle<T>(
  promise: Promise<T>,
): Promise<{ value?: T; error?: unknown }> {
  const result = promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await vi.runAllTimersAsync();
  return result;
}

describe('QuickBooks invoice request identity', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('replays accepted-but-lost response with identical requestid and bytes, including a restarted caller', async () => {
    const requests: { url: string; body: string }[] = [];
    const accepted = new Map<string, Response>();
    const fetcher = vi.fn(async (url: string, options: RequestInit) => {
      requests.push({ url, body: options.body as string });
      if (!accepted.has(url)) {
        accepted.set(url, ok());
        throw new TypeError('response lost after acceptance');
      }
      return accepted.get(url)!.clone();
    });
    vi.stubGlobal('fetch', fetcher);
    const input = keyed();
    expect(
      (await settle(provider().invoices.push(input))).value?.externalId,
    ).toBe('remote-1');
    input.quickbooksRequest = JSON.parse(
      JSON.stringify(input.quickbooksRequest),
    );
    expect(
      (await settle(provider().invoices.sync(input))).value?.externalId,
    ).toBe('remote-1');
    expect(requests).toHaveLength(3);
    expect(new Set(requests.map((r) => r.url)).size).toBe(1);
    expect(new Set(requests.map((r) => r.body)).size).toBe(1);
    expect(new URL(requests[0].url).searchParams.get('requestid')).toBe(
      'invoice-1',
    );
    expect(accepted.size).toBe(1);
  });

  it.each([429, 500, 503])('retries keyed status %i', async (status) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('upstream', { status }))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetcher);
    expect(
      (await settle(provider().invoices.push(keyed()))).value?.externalId,
    ).toBe('remote-1');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe(fetcher.mock.calls[1][0]);
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
  });

  it.each([
    'payload',
    'realm',
    'environment',
    'hash',
    'update',
  ])('refuses persisted descriptor %s misuse before auth or fetch', async (change) => {
    const input = keyed();
    const p = provider(change === 'realm' ? 'realm-b' : 'realm-a');
    if (change === 'payload') input.lineItems[0].unitPrice = 100;
    if (change === 'environment')
      input.quickbooksRequest = {
        ...input.quickbooksRequest!,
        environment: 'production',
      };
    if (change === 'hash')
      input.quickbooksRequest = {
        ...input.quickbooksRequest!,
        payloadHash: 'bad',
      };
    if (change === 'update') input.externalId = 'existing';
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(p.invoices.sync(input)).rejects.toThrow(/mismatch|updates/);
    expect(p.ensureAccessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    '',
    'a'.repeat(51),
    'space id',
    'a&b',
    undefined,
  ])('rejects malformed request id %s', (requestId) => {
    expect(() =>
      prepareQuickBooksInvoiceRequest(invoice(), {
        requestId: requestId as string,
        realmId: 'realm-a',
        environment: 'sandbox',
      }),
    ).toThrow(/requestId/);
  });

  it('accepts 50 characters and snapshots bytes before asynchronous auth', async () => {
    const input = keyed();
    input.quickbooksRequest = prepareQuickBooksInvoiceRequest(input, {
      requestId: 'a'.repeat(50),
      realmId: 'realm-a',
      environment: 'sandbox',
    });
    const p = provider();
    vi.mocked(p.ensureAccessToken).mockImplementation(async () => {
      input.lineItems[0].unitPrice = 100;
      return 'token';
    });
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetcher);
    await settle(p.invoices.push(input));
    expect(JSON.parse(fetcher.mock.calls[0][1].body).Line[0].Amount).toBe(50);
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
  });

  it('identifies exhausted uncertain outcomes and preserves uncertainty after a later rejection', async () => {
    const input = keyed();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('lost'))
        .mockResolvedValueOnce(new Response('bad', { status: 400 })),
    );
    const { error } = await settle(provider().invoices.push(input));
    expect(error).toBeInstanceOf(QuickBooksWriteError);
    expect(error).toMatchObject({
      outcome: 'unknown',
      requestId: 'invoice-1',
      realmId: 'realm-a',
      environment: 'sandbox',
      payloadHash: input.quickbooksRequest!.payloadHash,
      status: 400,
    });
  });

  it.each([
    {},
    { Invoice: {} },
    'not-json',
  ])('treats malformed successful response as uncertain', async (body) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(
          async () =>
            new Response(
              typeof body === 'string' ? body : JSON.stringify(body),
            ),
        ),
    );
    const { error } = await settle(
      provider('realm-a', 0).invoices.push(keyed()),
    );
    expect(error).toMatchObject({ outcome: 'unknown', requestId: 'invoice-1' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('bounds a hanging request and reuses identity after an abort', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options.signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            ),
          ),
      )
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetcher);
    expect(
      (await settle(provider().invoices.push(keyed()))).value?.externalId,
    ).toBe('remote-1');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    429,
    500,
    400,
    'network',
  ])('never retries an unkeyed invoice on %s', async (status) => {
    const fetcher = vi.fn().mockImplementation(async () => {
      if (status === 'network') throw new Error('lost');
      return new Response('error', { status: status as number });
    });
    vi.stubGlobal('fetch', fetcher);
    const { error } = await settle(provider().invoices.push(invoice()));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({
      outcome: status === 500 || status === 'network' ? 'unknown' : 'rejected',
      requestId: undefined,
    });
  });

  it.each([
    'customer',
    'vendor',
    'bill',
    'payment',
    'invoice/existing/send',
    'invoice',
  ])('does not replay other unkeyed write endpoint %s', async (endpoint) => {
    for (const status of [429, 503, undefined]) {
      const fetcher = vi.fn().mockImplementation(async () => {
        if (!status) throw new Error('lost');
        return new Response('error', { status });
      });
      vi.stubGlobal('fetch', fetcher);
      const { error } = await settle(
        provider().request('POST', endpoint, { Id: 'existing' }),
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(QuickBooksWriteError);
    }
  });

  it('does not retry a keyed client error but preserves logical uncertainty', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('invalid', { status: 400 }));
    vi.stubGlobal('fetch', fetcher);
    const { error } = await settle(provider().invoices.push(keyed()));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({
      outcome: 'unknown',
      requestId: 'invoice-1',
      status: 400,
    });
  });

  it('preserves uncertainty after a lost response and a client error on a restarted worker', async () => {
    const input = keyed();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('accepted remotely, response lost')),
    );
    const first = await settle(provider('realm-a', 0).invoices.push(input));
    expect(first.error).toMatchObject({
      outcome: 'unknown',
      requestId: 'invoice-1',
    });
    // A durable outbox rehydrates its original descriptor; there is no shared
    // provider instance, mutable descriptor state, or process-level registry.
    const replay = {
      ...invoice(),
      quickbooksRequest: JSON.parse(JSON.stringify(input.quickbooksRequest)),
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('rejected later', { status: 400 }));
    vi.stubGlobal('fetch', fetcher);
    const second = await settle(provider().invoices.push(replay));
    expect(second.error).toMatchObject({
      outcome: 'unknown',
      requestId: 'invoice-1',
      status: 400,
      payloadHash: input.quickbooksRequest!.payloadHash,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('preserves the identity after retry exhaustion', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('lost'));
    vi.stubGlobal('fetch', fetcher);
    const { error } = await settle(provider().invoices.push(keyed()));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(error).toMatchObject({
      outcome: 'unknown',
      requestId: 'invoice-1',
      realmId: 'realm-a',
    });
  });

  it('preparation is offline and rejects missing realm or an unknown environment', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(() =>
      prepareQuickBooksInvoiceRequest(invoice(), {
        requestId: 'id',
        realmId: '',
        environment: 'sandbox',
      }),
    ).toThrow(/realm/);
    expect(() =>
      prepareQuickBooksInvoiceRequest(invoice(), {
        requestId: 'id',
        realmId: 'realm-a',
        environment: 'unknown' as 'sandbox',
      }),
    ).toThrow(/environment/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    'Customer',
    'Vendor',
    'Bill',
  ] as const)('keeps malformed successful %s creates inside the uncertainty boundary', async (entity) => {
    const p = provider();
    const input = invoice();
    const push = () =>
      entity === 'Customer'
        ? p.customers.push({ id: 'local', name: 'Customer' })
        : entity === 'Vendor'
          ? p.vendors.push({ id: 'local', name: 'Vendor' })
          : p.bills.push({
              ...input,
              vendorId: 'vendor',
              billDate: input.issueDate,
            });
    for (const body of [
      {},
      { [entity]: {} },
      { [entity]: { Id: 123 } },
      { [entity]: { Id: ' ' } },
    ]) {
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(body)));
      vi.stubGlobal('fetch', fetcher);
      const { error } = await settle(push());
      expect(error).toBeInstanceOf(QuickBooksWriteError);
      expect(error).toMatchObject({
        outcome: 'unknown',
        endpoint: entity.toLowerCase(),
        realmId: 'realm-a',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ [entity]: { Id: 'remote-valid' } })),
        ),
    );
    expect((await settle(push())).value?.externalId).toBe('remote-valid');
  });

  it.each([
    'customer',
    'vendor',
    'bill',
    'invoice',
    'invoice/existing/send',
    'payment',
  ])('reports a malformed update/send/write response at %s as uncertain', async (endpoint) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    const { error } = await settle(
      provider().request('POST', endpoint, { Id: 'existing' }),
    );
    expect(error).toMatchObject({ outcome: 'unknown', endpoint });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retains GET retries and honors maxRetries zero', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetcher);
    expect(
      (await settle(provider().request('GET', 'invoice/1'))).value,
    ).toMatchObject({ Invoice: { Id: 'remote-1' } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockReset().mockRejectedValue(new Error('lost'));
    expect(
      (await settle(provider('realm-a', 0).request('GET', 'invoice/1'))).error,
    ).toBeInstanceOf(Error);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
