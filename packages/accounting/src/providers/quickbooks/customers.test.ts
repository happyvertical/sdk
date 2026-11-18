import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickBooksWriteError } from '../../errors.js';
import { QuickBooksProvider } from './index.js';

function provider() {
  const p = new QuickBooksProvider({
    type: 'quickbooks',
    clientId: 'test',
    clientSecret: 'test',
    refreshToken: 'test',
    realmId: 'realm-a',
    environment: 'sandbox',
    maxRetries: 0,
  });
  vi.spyOn(p, 'ensureAccessToken').mockResolvedValue('token');
  return p;
}

const customer = (id: string, name: string, email?: string) => ({
  Id: id,
  SyncToken: '0',
  DisplayName: name,
  ...(email ? { PrimaryEmailAddr: { Address: email } } : {}),
});

/** Route mocked QBO responses by query text; records every request. */
function mockQbo(handler: (url: URL, init: RequestInit) => unknown) {
  const calls: { url: URL; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const parsed = new URL(url);
      calls.push({ url: parsed, init });
      return new Response(JSON.stringify(handler(parsed, init)), {
        status: 200,
      });
    }),
  );
  return calls;
}
const queryOf = (url: URL) => url.searchParams.get('query') ?? '';

describe('QuickBooks customer find', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('queries by display name and returns every candidate', async () => {
    const calls = mockQbo(() => ({
      QueryResponse: {
        Customer: [
          customer('1', 'Acme Inc', 'a@acme.test'),
          customer('2', 'acme inc'),
        ],
      },
    }));
    const found = await provider().customers.find({
      displayName: ' Acme Inc ',
    });
    expect(found.map((c) => c.externalId)).toEqual(['1', '2']);
    expect(queryOf(calls[0].url)).toContain("WHERE DisplayName = 'Acme Inc'");
    expect(calls[0].init.method).toBe('GET');
  });

  it('escapes quotes and backslashes so input cannot alter the query', async () => {
    const calls = mockQbo(() => ({ QueryResponse: {} }));
    await provider().customers.find({
      displayName: "O'Brien' OR Id > '0\\",
    });
    expect(queryOf(calls[0].url)).toContain(
      "WHERE DisplayName = 'O\\'Brien\\' OR Id > \\'0\\\\'",
    );
  });

  it('queries each criterion separately and de-duplicates the union', async () => {
    const calls = mockQbo((url) =>
      queryOf(url).includes('PrimaryEmailAddr')
        ? {
            QueryResponse: {
              Customer: [
                customer('1', 'Other', 'a@acme.test'),
                customer('3', 'X', 'a@acme.test'),
              ],
            },
          }
        : {
            QueryResponse: {
              Customer: [customer('1', 'Other', 'a@acme.test')],
            },
          },
    );
    const found = await provider().customers.find({
      displayName: 'Other',
      email: 'A@acme.test',
    });
    expect(calls).toHaveLength(2);
    expect(found.map((c) => c.externalId).sort()).toEqual(['1', '3']);
  });

  it('drops provider rows that are not exact matches', async () => {
    mockQbo(() => ({
      QueryResponse: { Customer: [customer('1', 'Acme Inc Holdings')] },
    }));
    expect(
      await provider().customers.find({ displayName: 'Acme Inc' }),
    ).toEqual([]);
  });

  it('can include inactive customers', async () => {
    const calls = mockQbo(() => ({ QueryResponse: {} }));
    await provider().customers.find({
      email: 'a@b.test',
      includeInactive: true,
    });
    expect(queryOf(calls[0].url)).toContain(
      "PrimaryEmailAddr = 'a@b.test' AND Active IN (true, false)",
    );
  });

  it.each([
    [{}],
    [{ displayName: '   ' }],
    [{ displayName: 'a\nb' }],
    [{ email: 'x'.repeat(501) }],
  ])('rejects an unusable query %j without calling QuickBooks', async (query) => {
    const calls = mockQbo(() => ({}));
    await expect(provider().customers.find(query)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('QuickBooks customer findOrCreate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const input = { id: 'local-1', name: 'Acme Inc', email: 'a@acme.test' };

  it('returns the existing customer without creating', async () => {
    const calls = mockQbo(() => ({
      QueryResponse: { Customer: [customer('9', 'Acme Inc', 'a@acme.test')] },
    }));
    const result = await provider().customers.findOrCreate(input);
    expect(result.match).toBe('existing');
    expect(result.candidates.map((c) => c.externalId)).toEqual(['9']);
    expect(calls.every((c) => c.init.method === 'GET')).toBe(true);
  });

  it('searches inactive customers and returns an inactive match as existing', async () => {
    const calls = mockQbo(() => ({
      QueryResponse: {
        Customer: [
          { ...customer('9', 'Acme Inc', 'a@acme.test'), Active: false },
        ],
      },
    }));
    const result = await provider().customers.findOrCreate(input);
    expect(result.match).toBe('existing');
    expect(result.candidates[0]).toMatchObject({
      externalId: '9',
      active: false,
    });
    expect(calls.every((c) => c.init.method === 'GET')).toBe(true);
    expect(
      calls.every((c) => queryOf(c.url).includes('Active IN (true, false)')),
    ).toBe(true);
  });

  it('creates when nothing matches', async () => {
    const calls = mockQbo((_url, init) =>
      init.method === 'POST'
        ? { Customer: customer('10', 'Acme Inc', 'a@acme.test') }
        : { QueryResponse: {} },
    );
    const result = await provider().customers.findOrCreate(input);
    expect(result.match).toBe('created');
    expect(result.candidates[0]).toMatchObject({
      externalId: '10',
      name: 'Acme Inc',
    });
    const posts = calls.filter((c) => c.init.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0].init.body as string)).toMatchObject({
      DisplayName: 'Acme Inc',
      PrimaryEmailAddr: { Address: 'a@acme.test' },
    });
  });

  it('never creates on ambiguity', async () => {
    const calls = mockQbo(() => ({
      QueryResponse: {
        Customer: [customer('1', 'Acme Inc'), customer('2', 'Acme Inc')],
      },
    }));
    const result = await provider().customers.findOrCreate({
      id: 'local-1',
      name: 'Acme Inc',
    });
    expect(result.match).toBe('ambiguous');
    expect(result.candidates).toHaveLength(2);
    expect(calls.some((c) => c.init.method === 'POST')).toBe(false);
  });

  it('surfaces a rejected create as QuickBooksWriteError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) =>
        init.method === 'POST'
          ? new Response('{"Fault":{}}', { status: 400 })
          : new Response('{"QueryResponse":{}}', { status: 200 }),
      ),
    );
    await expect(
      provider().customers.findOrCreate(input),
    ).rejects.toBeInstanceOf(QuickBooksWriteError);
  });
});
