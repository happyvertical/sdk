import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  BASE_USDC_BACKEND_ID,
  BaseUsdcAdapter,
  deriveBaseUsdcAddress,
  quoteIdToDerivationIndex,
} from './adapters/base-usdc.js';
import { definePaymentBackendConformanceTests } from './testing/conformance.js';

const payTo = '0x1111111111111111111111111111111111111111';
const payer = '0x2222222222222222222222222222222222222222';
const txHash =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const transferTopic =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const futureExpiryOffsetMs = 365 * 24 * 60 * 60 * 1_000;

function futureExpiresAt(): string {
  return new Date(
    Math.floor((Date.now() + futureExpiryOffsetMs) / 1_000) * 1_000,
  ).toISOString();
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function addressTopic(address: string): string {
  return `0x${address.slice(2).padStart(64, '0')}`;
}

function usdcTransferLog(amountAtomic = 12_340_000n, blockNumber = '0x5') {
  return {
    address: '0x833589fcD6EDb6e08f4C7C32D4F71B54BdA02913',
    blockNumber,
    transactionHash: txHash,
    topics: [transferTopic, addressTopic(payer), addressTopic(payTo)],
    data: `0x${amountAtomic.toString(16)}`,
  };
}

function createRpcFetch(
  options: {
    amountAtomic?: bigint;
    currentBlock?: string;
    logBlockNumber?: string;
    logs?: unknown[];
    receipt?: Record<string, unknown> | null;
  } = {},
) {
  return vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));

    if (body.method === 'eth_getLogs') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: options.logs ?? [
          usdcTransferLog(options.amountAtomic, options.logBlockNumber),
        ],
      });
    }

    if (body.method === 'eth_blockNumber') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: options.currentBlock ?? '0x6',
      });
    }

    if (body.method === 'eth_getTransactionReceipt') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result:
          options.receipt === undefined
            ? {
                status: '0x1',
                transactionHash: txHash,
                blockNumber: '0x5',
                logs: [
                  usdcTransferLog(options.amountAtomic, options.logBlockNumber),
                ],
              }
            : options.receipt,
      });
    }

    return jsonResponse({
      jsonrpc: '2.0',
      id: body.id,
      error: { code: -32601, message: 'method not found' },
    });
  });
}

function createAdvancingBlockRpcFetch(
  blockNumbers: string[],
  options: Parameters<typeof createRpcFetch>[0] = {},
) {
  const fallback = createRpcFetch(options);
  let blockIndex = 0;

  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));

    if (body.method === 'eth_blockNumber') {
      const result =
        blockNumbers[Math.min(blockIndex, blockNumbers.length - 1)] ?? '0x0';
      blockIndex += 1;

      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result,
      });
    }

    return fallback(input, init);
  });
}

function createFacilitatorFetch(
  facilitatorBody: Record<string, unknown>,
  rpcOptions: Parameters<typeof createRpcFetch>[0] = {},
) {
  const rpcFetch = createRpcFetch(rpcOptions);

  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith('https://x402.example')) {
      return jsonResponse(facilitatorBody);
    }

    return rpcFetch(input, init);
  });
}

function createAdapter(
  options: {
    fetch?: ReturnType<typeof createRpcFetch>;
    confirmations?: number;
    maxStoredPaymentOptions?: number;
    allowCumulativeTransferMatching?: boolean;
  } = {},
) {
  return new BaseUsdcAdapter({
    rpcUrl: 'https://base.example.test',
    fetch: options.fetch ?? createRpcFetch(),
    addressDeriver: () => payTo,
    sendTransaction: async () => ({ transactionId: txHash }),
    confirmations: options.confirmations,
    maxStoredPaymentOptions: options.maxStoredPaymentOptions,
    allowCumulativeTransferMatching: options.allowCumulativeTransferMatching,
  });
}

function storedQuoteIds(adapter: unknown): string[] {
  return [
    ...(
      adapter as { optionsByQuote: Map<string, unknown> }
    ).optionsByQuote.keys(),
  ];
}

definePaymentBackendConformanceTests(
  'BaseUsdcAdapter',
  {
    createBackend: () =>
      createAdapter({ fetch: createAdvancingBlockRpcFetch(['0x4', '0x6']) }),
    expectedCapabilities: {
      id: BASE_USDC_BACKEND_ID,
      settlementCurrency: 'USDC',
      chain: 'base',
      settlementShape: 'address',
      x402Capable: true,
    },
    expectedOption: {
      payTo,
      settlementAmount: 12_340_000,
    },
    expectedStatus: {
      status: 'confirmed',
      transactionId: txHash,
      confirmations: 2,
    },
    payoutInput: {
      destination: '0x3333333333333333333333333333333333333333',
      amount: 1_000_000,
      currency: 'USDC',
    },
    expectedPayout: {
      status: 'submitted',
      transactionId: txHash,
    },
  },
  { describe, expect, it },
);

describe('BaseUsdcAdapter', () => {
  it('evicts older stored payment options when cache capacity is reached', async () => {
    const adapter = createAdapter({ maxStoredPaymentOptions: 1 });

    await adapter.createPaymentOption({
      quoteId: 'quote-1',
      amount: 1000,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });
    await adapter.createPaymentOption({
      quoteId: 'quote-2',
      amount: 2000,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });

    expect(storedQuoteIds(adapter)).toEqual(['quote-2']);
  });

  it('derives a stable non-hardened child index from a quote id', () => {
    const expected =
      createHash('sha256').update('quote-123').digest().readUInt32BE(0) &
      0x7fffffff;

    expect(quoteIdToDerivationIndex('quote-123')).toBe(expected);
    expect(quoteIdToDerivationIndex(' quote-123 ')).toBe(expected);
    expect(quoteIdToDerivationIndex('quote-123')).toBe(
      quoteIdToDerivationIndex('quote-123'),
    );
    expect(() => quoteIdToDerivationIndex(' ')).toThrow(
      'Base USDC quoteId must not be empty',
    );
  });

  it('uses multiple non-hardened child indexes by default to reduce address collisions', async () => {
    const adapter = createAdapter();
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-wide-path',
      amount: 125,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });

    expect(option.metadata).toMatchObject({
      derivationIndexes: expect.arrayContaining([expect.any(Number)]),
    });
    expect((option.metadata?.derivationIndexes as number[]).length).toBe(4);
    expect(option.settlementAmount).toBe(1_250_000);
    expect(option.paymentUri).toContain('uint256=1250000');
  });

  it('uses USDC atomic public amounts directly for Base settlement', async () => {
    const adapter = createAdapter();
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-usdc-atomic',
      amount: 1_000_000,
      currency: 'USDC',
      expiresAt: futureExpiresAt(),
    });

    expect(option).toMatchObject({
      amount: 1_000_000,
      currency: 'USDC',
      settlementAmount: 1_000_000,
    });
    expect(option.paymentUri).toContain('uint256=1000000');
  });

  it('rejects invalid Base USDC adapter configuration before payment creation', () => {
    expect(
      () =>
        new BaseUsdcAdapter({
          rpcUrl: 'https://base.example.test',
          addressDeriver: () => payTo,
          usdcContractAddress: 'not-an-address',
        }),
    ).toThrow('Invalid EVM address');

    expect(
      () =>
        new BaseUsdcAdapter({
          rpcUrl: 'https://base.example.test',
          addressDeriver: () => payTo,
          confirmations: -1,
        }),
    ).toThrow('confirmations must be a non-negative integer');

    expect(
      () =>
        new BaseUsdcAdapter({
          rpcUrl: 'https://base.example.test',
          addressDeriver: () => payTo,
          fromBlock: -1,
        }),
    ).toThrow('fromBlock must be a non-negative JSON-RPC block tag');

    expect(
      () =>
        new BaseUsdcAdapter({
          rpcUrl: 'https://base.example.test',
          addressDeriver: () => payTo,
          fromBlock: {} as never,
        }),
    ).toThrow('fromBlock must be a non-negative JSON-RPC block tag');

    expect(
      () =>
        new BaseUsdcAdapter({
          rpcUrl: 'https://base.example.test',
          addressDeriver: () => payTo,
          x402FacilitatorUrl: ' ',
        }),
    ).toThrow('x402FacilitatorUrl must not be empty');

    expect(
      () =>
        new BaseUsdcAdapter({
          rpcUrl: 'https://base.example.test',
          addressDeriver: () => payTo,
          x402FacilitatorUrl: 'javascript:alert(1)',
        }),
    ).toThrow('BaseUsdcAdapter x402FacilitatorUrl must use http or https');

    expect(
      () =>
        new BaseUsdcAdapter({
          rpcUrl: 'not-a-url',
          addressDeriver: () => payTo,
        }),
    ).toThrow('BaseUsdcAdapter rpcUrl must be a valid URL');

    expect(
      () =>
        new BaseUsdcAdapter({
          rpcUrl: 123 as never,
          addressDeriver: () => payTo,
        }),
    ).toThrow('requires an RPC URL');

    expect(
      () =>
        new BaseUsdcAdapter({
          rpcUrl: 'https://base.example.test',
          masterXpub: 123 as never,
        }),
    ).toThrow('Base USDC masterXpub must be a string');

    expect(
      () =>
        new BaseUsdcAdapter({
          rpcUrl: 'https://base.example.test',
          masterXpub: ' ',
        }),
    ).toThrow('Base USDC masterXpub must not be empty');

    expect(
      () =>
        new BaseUsdcAdapter({
          rpcUrl: 'https://base.example.test',
          addressDeriver: () => payTo,
          derivationPathPrefix: ' ',
        }),
    ).toThrow('derivationPathPrefix must not be empty');

    expect(
      () =>
        new BaseUsdcAdapter({
          rpcUrl: 'https://base.example.test',
          addressDeriver: () => payTo,
          derivationPathPrefix: 123 as never,
        }),
    ).toThrow('derivationPathPrefix must be a string');
  });

  it('rejects custom hardened or invalid BIP32 child indexes', async () => {
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch: createRpcFetch(),
      addressDeriver: () => payTo,
      addressIndexForQuote: () => 0x80000000,
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-hardened-index',
        amount: 125,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('non-hardened BIP32 child index');
  });

  it('trims Base USDC derivation path prefixes', async () => {
    const addressDeriver = vi.fn(() => payTo);
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch: createRpcFetch(),
      addressDeriver,
      derivationPathPrefix: ' m/44/60/0 ',
    });

    await adapter.createPaymentOption({
      quoteId: 'quote-trimmed-path',
      amount: 125,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });

    expect(addressDeriver.mock.calls[0]?.[0].path).toMatch(
      /^m\/44\/60\/0\/\d+/,
    );
  });

  it('rejects blank Base USDC quote ids before address derivation', async () => {
    const addressDeriver = vi.fn(() => payTo);
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch: createRpcFetch(),
      addressDeriver,
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: ' ',
        amount: 125,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('Base USDC quoteId must not be empty');
    expect(addressDeriver).not.toHaveBeenCalled();
  });

  it('verifies an x402 proof when the header carries a Base transaction hash', async () => {
    const adapter = createAdapter();
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');

    const result = await adapter.verifyX402Proof({
      paymentHeader: header,
      quoteId: 'quote-123',
      payTo,
      amount: 1234,
      currency: 'USD',
    });

    expect(result).toMatchObject({
      valid: true,
      transactionId: txHash,
      payer,
      amount: 12_340_000,
    });
  });

  it('returns invalid x402 proof results for malformed payment headers', async () => {
    const adapter = createAdapter();

    await expect(
      adapter.verifyX402Proof({
        paymentHeader: 'not valid base64 json',
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      valid: false,
      reason: 'x402 payment header could not be decoded.',
    });
  });

  it('does not confirm dust transfers when quote amount state is not available', async () => {
    const adapter = createAdapter({
      fetch: createRpcFetch({ amountAtomic: 1n }),
    });

    const status = await adapter.getStatus('quote-123', payTo);

    expect(status.status).toBe('pending');
    expect(status.receivedAmount).toBeUndefined();
    expect(status.requiredConfirmations).toBe(1);
  });

  it('keeps split Base transfers pending unless cumulative matching is enabled', async () => {
    const adapter = createAdapter({
      fetch: createAdvancingBlockRpcFetch(['0x3', '0x8'], {
        logs: [
          {
            ...usdcTransferLog(6_000_000n, '0x4'),
            transactionHash:
              '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
          usdcTransferLog(6_340_000n, '0x6'),
        ],
      }),
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-split-default',
      amount: 12_340_000,
      currency: 'USDC',
      expiresAt: futureExpiresAt(),
    });

    await expect(
      adapter.getStatus('quote-split-default', option.payTo),
    ).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('confirms cumulative Base transfers that meet the expected amount when enabled', async () => {
    let blockRequests = 0;
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));

        if (body.method === 'eth_blockNumber') {
          blockRequests += 1;

          return jsonResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: blockRequests === 1 ? '0x3' : '0x8',
          });
        }

        if (body.method === 'eth_getLogs') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: [
              {
                ...usdcTransferLog(6_000_000n, '0x4'),
                transactionHash:
                  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              },
              usdcTransferLog(6_340_000n, '0x6'),
            ],
          });
        }

        return jsonResponse({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32601, message: 'method not found' },
        });
      },
    );
    const adapter = createAdapter({
      fetch,
      allowCumulativeTransferMatching: true,
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-split',
      amount: 12_340_000,
      currency: 'USDC',
      expiresAt: futureExpiresAt(),
    });

    await expect(
      adapter.getStatus('quote-split', option.payTo),
    ).resolves.toMatchObject({
      status: 'confirmed',
      receivedAmount: 12_340_000,
      transactionId: txHash,
      confirmations: 3,
    });
  });

  it('uses deterministic cumulative transfer tie-breaking within the same block', async () => {
    let blockRequests = 0;
    const firstHash =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const secondHash =
      '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));

        if (body.method === 'eth_blockNumber') {
          blockRequests += 1;

          return jsonResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: blockRequests === 1 ? '0x3' : '0x8',
          });
        }

        if (body.method === 'eth_getLogs') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: [
              {
                ...usdcTransferLog(6_000_000n, '0x4'),
                transactionHash: firstHash,
              },
              {
                ...usdcTransferLog(6_340_000n, '0x4'),
                transactionHash: secondHash,
              },
            ],
          });
        }

        return jsonResponse({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32601, message: 'method not found' },
        });
      },
    );
    const adapter = createAdapter({
      fetch,
      allowCumulativeTransferMatching: true,
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-same-block-split',
      amount: 12_340_000,
      currency: 'USDC',
      expiresAt: futureExpiresAt(),
    });

    await expect(
      adapter.getStatus('quote-same-block-split', option.payTo),
    ).resolves.toMatchObject({
      status: 'confirmed',
      receivedAmount: 12_340_000,
      transactionId: secondHash,
    });
  });

  it('uses deterministic cumulative transfer tie-breaking across same-block payer groups', async () => {
    let blockRequests = 0;
    const lowerHash =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const higherHash =
      '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
    const otherPayer = '0x3333333333333333333333333333333333333333';
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));

        if (body.method === 'eth_blockNumber') {
          blockRequests += 1;

          return jsonResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: blockRequests === 1 ? '0x3' : '0x8',
          });
        }

        if (body.method === 'eth_getLogs') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: [
              {
                ...usdcTransferLog(12_340_000n, '0x4'),
                transactionHash: higherHash,
              },
              {
                ...usdcTransferLog(12_340_000n, '0x4'),
                topics: [
                  transferTopic,
                  addressTopic(otherPayer),
                  addressTopic(payTo),
                ],
                transactionHash: lowerHash,
              },
            ],
          });
        }

        return jsonResponse({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32601, message: 'method not found' },
        });
      },
    );
    const adapter = createAdapter({
      fetch,
      allowCumulativeTransferMatching: true,
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-same-block-payers',
      amount: 12_340_000,
      currency: 'USDC',
      expiresAt: futureExpiresAt(),
    });

    await expect(
      adapter.getStatus('quote-same-block-payers', option.payTo),
    ).resolves.toMatchObject({
      status: 'confirmed',
      transactionId: higherHash,
    });
  });

  it('does not combine cumulative Base transfers from different payers', async () => {
    let blockRequests = 0;
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));

        if (body.method === 'eth_blockNumber') {
          blockRequests += 1;

          return jsonResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: blockRequests === 1 ? '0x3' : '0x8',
          });
        }

        if (body.method === 'eth_getLogs') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: [
              usdcTransferLog(6_000_000n, '0x4'),
              {
                ...usdcTransferLog(6_340_000n, '0x6'),
                topics: [
                  transferTopic,
                  addressTopic('0x4444444444444444444444444444444444444444'),
                  addressTopic(payTo),
                ],
              },
            ],
          });
        }

        return jsonResponse({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32601, message: 'method not found' },
        });
      },
    );
    const adapter = createAdapter({
      fetch,
      allowCumulativeTransferMatching: true,
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-split-payers',
      amount: 12_340_000,
      currency: 'USDC',
      expiresAt: futureExpiresAt(),
    });

    await expect(
      adapter.getStatus('quote-split-payers', option.payTo),
    ).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('ignores Base transfers mined before a stored quote was created', async () => {
    const adapter = createAdapter({
      fetch: createRpcFetch({
        currentBlock: '0x8',
        logs: [usdcTransferLog(12_340_000n, '0x5')],
      }),
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-replayed',
      amount: 12_340_000,
      currency: 'USDC',
      expiresAt: futureExpiresAt(),
    });

    const status = await adapter.getStatus('quote-replayed', option.payTo);

    expect(status).toMatchObject({
      status: 'pending',
    });
    expect(status.receivedAmount).toBeUndefined();
  });

  it('ignores removed Base transfer logs in the default single-transfer path', async () => {
    const adapter = createAdapter({
      fetch: createAdvancingBlockRpcFetch(['0x3', '0x8'], {
        logs: [
          {
            ...usdcTransferLog(12_340_000n, '0x4'),
            removed: true,
          },
        ],
      }),
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-reorged-single',
      amount: 12_340_000,
      currency: 'USDC',
      expiresAt: futureExpiresAt(),
    });

    await expect(
      adapter.getStatus('quote-reorged-single', option.payTo),
    ).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('ignores removed Base transfer logs when cumulative matching is enabled', async () => {
    const adapter = createAdapter({
      allowCumulativeTransferMatching: true,
      fetch: createAdvancingBlockRpcFetch(['0x3', '0x8'], {
        logs: [
          {
            ...usdcTransferLog(12_340_000n, '0x4'),
            removed: true,
          },
          usdcTransferLog(1n, '0x6'),
        ],
      }),
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-reorged',
      amount: 12_340_000,
      currency: 'USDC',
      expiresAt: futureExpiresAt(),
    });

    await expect(
      adapter.getStatus('quote-reorged', option.payTo),
    ).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('ignores malformed Base transfer logs instead of throwing', async () => {
    const adapter = createAdapter({
      fetch: createRpcFetch({
        logs: [
          null,
          {
            address: '0x833589fcD6EDb6e08f4C7C32D4F71B54BdA02913',
            blockNumber: '0x5',
            transactionHash: txHash,
            data: '0xbc4b20',
          },
          {
            address: '0x833589fcD6EDb6e08f4C7C32D4F71B54BdA02913',
            blockNumber: '0x5',
            transactionHash: txHash,
            topics: [transferTopic, 'not-a-topic', addressTopic(payTo)],
            data: 'not-hex',
          },
        ],
      }),
    });

    await expect(
      adapter.getStatus('quote-123', payTo, {
        settlementAmount: 12_340_000,
        searchStartBlock: 0,
      }),
    ).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('treats malformed Base transfer log responses as pending', async () => {
    const adapter = createAdapter({
      fetch: createRpcFetch({
        logs: { result: 'not-an-array' } as never,
      }),
    });

    await expect(
      adapter.getStatus('quote-123', payTo, {
        settlementAmount: 12_340_000,
        searchStartBlock: 0,
      }),
    ).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('does not parse malformed overlong Base transfer address topics', async () => {
    const adapter = createAdapter({
      fetch: createRpcFetch({
        logs: [
          {
            ...usdcTransferLog(),
            topics: [
              transferTopic,
              `0x${'0'.repeat(65)}${payer.slice(2)}`,
              addressTopic(payTo),
            ],
          },
        ],
      }),
    });

    await expect(
      adapter.getStatus('quote-123', payTo, {
        settlementAmount: 12_340_000,
        searchStartBlock: 0,
      }),
    ).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('does not confirm decimal-encoded Base log amounts', async () => {
    const adapter = createAdapter({
      fetch: createRpcFetch({
        logs: [
          {
            ...usdcTransferLog(),
            data: '12340000',
          },
        ],
      }),
    });

    await expect(
      adapter.getStatus('quote-123', payTo, {
        settlementAmount: 12_340_000,
        searchStartBlock: 0,
      }),
    ).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('rejects zero expected amounts supplied through Base status context', async () => {
    const adapter = createAdapter();

    await expect(
      adapter.getStatus('quote-123', payTo, { settlementAmount: 0 }),
    ).rejects.toThrow('Base USDC expected amount must be greater than zero');
  });

  it('can use persisted amount context to check status after adapter restart', async () => {
    const adapter = createAdapter();

    await expect(
      adapter.getStatus('quote-123', payTo, {
        settlementAmount: 12_340_000,
        searchStartBlock: 0,
      }),
    ).resolves.toMatchObject({
      status: 'confirmed',
      receivedAmount: 12_340_000,
    });
  });

  it('honors persisted searchStartBlock context after adapter restart', async () => {
    const adapter = createAdapter({
      fetch: createRpcFetch({
        currentBlock: '0x8',
        logs: [usdcTransferLog(12_340_000n, '0x5')],
      }),
    });

    await expect(
      adapter.getStatus('quote-123', payTo, {
        settlementAmount: 12_340_000,
        searchStartBlock: '0x6',
      }),
    ).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('requires exact amount and enough confirmations for direct x402 receipt verification', async () => {
    const overpaid = createAdapter({
      fetch: createRpcFetch({ amountAtomic: 12_340_001n }),
    });
    const underconfirmed = createAdapter({
      confirmations: 3,
      fetch: createRpcFetch({ currentBlock: '0x5' }),
    });
    const pending = createAdapter({
      fetch: createRpcFetch({ receipt: null }),
    });
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');

    await expect(
      overpaid.verifyX402Proof({
        paymentHeader: header,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      valid: false,
      reason: 'No exact USDC transfer matching the x402 proof.',
    });
    await expect(
      underconfirmed.verifyX402Proof({
        paymentHeader: header,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      valid: false,
      reason: 'x402 transaction has 1 confirmations; 3 required.',
    });
    await expect(
      pending.verifyX402Proof({
        paymentHeader: header,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      valid: false,
      reason: 'x402 transaction receipt is not available yet.',
    });
  });

  it('rejects replayed x402 transaction proofs', async () => {
    const adapter = createAdapter();
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');
    const input = {
      paymentHeader: header,
      quoteId: 'quote-123',
      payTo,
      amount: 1234,
      currency: 'USD',
    };

    await expect(adapter.verifyX402Proof(input)).resolves.toMatchObject({
      valid: true,
      transactionId: txHash,
    });
    await expect(adapter.verifyX402Proof(input)).resolves.toMatchObject({
      valid: false,
      reason: 'x402 transaction has already been verified.',
    });
  });

  it('allows retrying x402 proofs after a pending receipt becomes available', async () => {
    let receipt: Record<string, unknown> | null = null;
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));

        if (body.method === 'eth_getTransactionReceipt') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: receipt,
          });
        }

        if (body.method === 'eth_blockNumber') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: '0x6',
          });
        }

        return jsonResponse({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32601, message: 'method not found' },
        });
      },
    );
    const adapter = createAdapter({ fetch });
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');
    const input = {
      paymentHeader: header,
      quoteId: 'quote-123',
      payTo,
      amount: 1234,
      currency: 'USD',
    };

    await expect(adapter.verifyX402Proof(input)).resolves.toMatchObject({
      valid: false,
      reason: 'x402 transaction receipt is not available yet.',
    });

    receipt = {
      status: '0x1',
      transactionHash: txHash,
      blockNumber: '0x5',
      logs: [usdcTransferLog()],
    };

    await expect(adapter.verifyX402Proof(input)).resolves.toMatchObject({
      valid: true,
      transactionId: txHash,
    });
    await expect(adapter.verifyX402Proof(input)).resolves.toMatchObject({
      valid: false,
      reason: 'x402 transaction has already been verified.',
    });
  });

  it('rejects concurrent x402 transaction proof replays before receipt lookup completes', async () => {
    let releaseReceipt!: () => void;
    const receiptGate = new Promise<void>((resolve) => {
      releaseReceipt = resolve;
    });
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));

        if (body.method === 'eth_getTransactionReceipt') {
          await receiptGate;

          return jsonResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              status: '0x1',
              transactionHash: txHash,
              blockNumber: '0x5',
              logs: [usdcTransferLog()],
            },
          });
        }

        if (body.method === 'eth_blockNumber') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: '0x6',
          });
        }

        return jsonResponse({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32601, message: 'method not found' },
        });
      },
    );
    const adapter = createAdapter({ fetch });
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');
    const input = {
      paymentHeader: header,
      quoteId: 'quote-123',
      payTo,
      amount: 1234,
      currency: 'USD',
    };
    const first = adapter.verifyX402Proof(input);
    const second = adapter.verifyX402Proof(input);

    releaseReceipt();
    const results = await Promise.all([first, second]);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ valid: true, transactionId: txHash }),
        expect.objectContaining({
          valid: false,
          reason: 'x402 transaction has already been verified.',
        }),
      ]),
    );
  });

  it('ignores malformed Base x402 receipt logs instead of throwing', async () => {
    const adapter = createAdapter({
      fetch: createRpcFetch({
        receipt: {
          status: '0x1',
          transactionHash: txHash,
          blockNumber: '0x5',
          logs: [
            null,
            {
              address: '0x833589fcD6EDb6e08f4C7C32D4F71B54BdA02913',
              data: '0xbc4b20',
            },
          ],
        },
      }),
    });
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');

    await expect(
      adapter.verifyX402Proof({
        paymentHeader: header,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      valid: false,
      reason: 'No exact USDC transfer matching the x402 proof.',
    });
  });

  it('rejects direct x402 proofs missing scheme or network requirements', async () => {
    const adapter = createAdapter();
    const missingSchemeHeader = Buffer.from(
      JSON.stringify({
        network: 'eip155:8453',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');
    const missingNetworkHeader = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');

    await expect(
      adapter.verifyX402Proof({
        paymentHeader: missingSchemeHeader,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      valid: false,
      reason: 'x402 proof did not include the payment scheme.',
    });
    await expect(
      adapter.verifyX402Proof({
        paymentHeader: missingNetworkHeader,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      valid: false,
      reason: 'x402 proof did not include the payment network.',
    });
  });

  it('rejects malformed direct x402 transaction hashes before RPC lookup', async () => {
    const fetch = createRpcFetch();
    const adapter = createAdapter({ fetch });
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { transactionHash: 'not-a-hash' },
      }),
    ).toString('base64url');

    await expect(
      adapter.verifyX402Proof({
        paymentHeader: header,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      valid: false,
      transactionId: 'not-a-hash',
      reason: 'x402 proof transaction hash was invalid.',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects zero-value Base x402 verification amounts before RPC lookup', async () => {
    const fetch = createRpcFetch();
    const adapter = createAdapter({ fetch });
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');

    await expect(
      adapter.verifyX402Proof({
        paymentHeader: header,
        quoteId: 'quote-123',
        payTo,
        amount: 0,
        currency: 'USD',
      }),
    ).rejects.toThrow('Base USDC x402 amount must be greater than zero');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts numeric x402 validBefore expiry claims', async () => {
    const adapter = createAdapter();
    const expiresAt = new Date(futureExpiresAt());
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: {
          transactionHash: txHash,
          authorization: {
            validBefore: Math.floor(expiresAt.getTime() / 1_000),
          },
        },
      }),
    ).toString('base64url');

    await expect(
      adapter.verifyX402Proof({
        paymentHeader: header,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
        expiresAt,
      }),
    ).resolves.toMatchObject({
      valid: true,
      transactionId: txHash,
    });
  });

  it('rejects expired direct x402 proof claims even without caller expiry context', async () => {
    const adapter = createAdapter();
    const expiredAt = Math.floor((Date.now() - 1_000) / 1_000);
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: {
          transactionHash: txHash,
          authorization: {
            validBefore: expiredAt,
          },
        },
      }),
    ).toString('base64url');

    await expect(
      adapter.verifyX402Proof({
        paymentHeader: header,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      valid: false,
      reason: 'x402 proof is expired.',
    });
  });

  it('returns invalid x402 proof results for malformed expiry claims', async () => {
    const adapter = createAdapter();
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: {
          transactionHash: txHash,
          authorization: {
            validBefore: 'not-a-date',
          },
        },
      }),
    ).toString('base64url');

    await expect(
      adapter.verifyX402Proof({
        paymentHeader: header,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).resolves.toMatchObject({
      valid: false,
      reason: 'x402 proof expiry was invalid.',
    });
  });

  it('returns invalid x402 proof results for out-of-range numeric expiry claims', async () => {
    const adapter = createAdapter();
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: {
          transactionHash: txHash,
          authorization: {
            validBefore: Number.MAX_SAFE_INTEGER,
          },
        },
      }),
    ).toString('base64url');

    await expect(
      adapter.verifyX402Proof({
        paymentHeader: header,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      valid: false,
      reason: 'x402 proof expiry was invalid.',
    });
  });

  it('encodes numeric fromBlock values as JSON-RPC hex quantities', async () => {
    const fetch = createRpcFetch();
    const adapter = new BaseUsdcAdapter({
      rpcUrl: ' https://base.example.test ',
      fetch,
      addressDeriver: () => payTo,
      fromBlock: 123,
    });

    await adapter.getStatus('quote-123', payTo, {
      settlementAmount: 12_340_000,
    });

    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://base.example.test');
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      params: [expect.objectContaining({ fromBlock: '0x7b' })],
    });
  });

  it('defaults Base log scans to a recent block window instead of genesis', async () => {
    const fetch = createRpcFetch({ currentBlock: '0x3000' });
    const adapter = createAdapter({ fetch });

    await adapter.getStatus('quote-123', payTo);

    const getLogsCall = fetch.mock.calls.find(([, init]) => {
      const body = JSON.parse(String(init?.body));

      return body.method === 'eth_getLogs';
    });

    expect(JSON.parse(String(getLogsCall?.[1]?.body))).toMatchObject({
      params: [expect.objectContaining({ fromBlock: '0x8f0' })],
    });
  });

  it('starts stored Base quote log scans at the quote searchStartBlock', async () => {
    const fetch = createAdvancingBlockRpcFetch(['0x2000', '0x3000'], {
      logs: [usdcTransferLog(12_340_000n, '0x2001')],
    });
    const adapter = createAdapter({ fetch });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-recent-log',
      amount: 12_340_000,
      currency: 'USDC',
      expiresAt: futureExpiresAt(),
    });

    await expect(
      adapter.getStatus('quote-recent-log', option.payTo),
    ).resolves.toMatchObject({
      status: 'confirmed',
    });

    const getLogsCall = fetch.mock.calls.find(([, init]) => {
      const body = JSON.parse(String(init?.body));

      return body.method === 'eth_getLogs';
    });

    expect(JSON.parse(String(getLogsCall?.[1]?.body))).toMatchObject({
      params: [expect.objectContaining({ fromBlock: '0x2000' })],
    });
  });

  it('throws for stateless Base amount checks without a persisted searchStartBlock', async () => {
    const adapter = createAdapter();

    await expect(
      adapter.getStatus('quote-123', payTo, {
        settlementAmount: 12_340_000,
      }),
    ).rejects.toThrow('requires statusContext.searchStartBlock');
  });

  it('extends default Base log scans back to a stored quote searchStartBlock', async () => {
    const fetch = createAdvancingBlockRpcFetch(['0x5', '0x3000', '0x3000'], {
      logs: [usdcTransferLog(12_340_000n, '0x6')],
    });
    const adapter = createAdapter({ fetch });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-old-log',
      amount: 12_340_000,
      currency: 'USDC',
      expiresAt: futureExpiresAt(),
    });

    await expect(
      adapter.getStatus('quote-old-log', option.payTo),
    ).resolves.toMatchObject({
      status: 'confirmed',
    });

    const getLogsCall = fetch.mock.calls.find(([, init]) => {
      const body = JSON.parse(String(init?.body));

      return body.method === 'eth_getLogs';
    });

    expect(JSON.parse(String(getLogsCall?.[1]?.body))).toMatchObject({
      params: [expect.objectContaining({ fromBlock: '0x5' })],
    });
  });

  it('trims the x402 facilitator URL before verification requests', async () => {
    const fetch = createFacilitatorFetch({
      valid: true,
      transactionHash: txHash,
      amount: '12340000',
    });
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch,
      addressDeriver: () => payTo,
      x402FacilitatorUrl: ' https://x402.example/ ',
    });
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');

    await adapter.verifyX402Proof({
      paymentHeader: header,
      quoteId: 'quote-123',
      payTo,
      amount: 1234,
      currency: 'USD',
    });

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://x402.example/verify',
    );
  });

  it('requires boolean x402 facilitator validity before accepting a proof', async () => {
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch: vi.fn(async () =>
        jsonResponse({
          valid: 'false',
          reason: 'not verified',
          transactionHash: txHash,
        }),
      ),
      addressDeriver: () => payTo,
      x402FacilitatorUrl: 'https://x402.example',
    });
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');

    await expect(
      adapter.verifyX402Proof({
        paymentHeader: header,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      valid: false,
      reason: 'not verified',
    });
  });

  it('verifies accepted x402 facilitator proofs onchain instead of trusting echoed amounts', async () => {
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch: createFacilitatorFetch({
        valid: true,
        transactionHash: txHash,
        amount: 'not-digits',
      }),
      addressDeriver: () => payTo,
      x402FacilitatorUrl: 'https://x402.example',
    });
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');

    await expect(
      adapter.verifyX402Proof({
        paymentHeader: header,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      valid: true,
      amount: 12_340_000,
    });
  });

  it('rejects malformed x402 facilitator transaction hashes on accepted proofs', async () => {
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch: vi.fn(async () =>
        jsonResponse({
          valid: true,
          transactionHash: 'not-a-hash',
          amount: '12340000',
        }),
      ),
      addressDeriver: () => payTo,
      x402FacilitatorUrl: 'https://x402.example',
    });
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');

    await expect(
      adapter.verifyX402Proof({
        paymentHeader: header,
        quoteId: 'quote-123',
        payTo,
        amount: 1234,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      valid: false,
      transactionId: 'not-a-hash',
      reason: 'x402 facilitator transaction hash was invalid.',
    });
  });

  it('does not parse malformed x402 facilitator amounts on rejected proofs', async () => {
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch: vi.fn(async () =>
        jsonResponse({
          valid: false,
          reason: 'not verified',
          transactionHash: txHash,
          amount: 'not-digits',
        }),
      ),
      addressDeriver: () => payTo,
      x402FacilitatorUrl: 'https://x402.example',
    });
    const header = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { transactionHash: txHash },
      }),
    ).toString('base64url');

    const result = await adapter.verifyX402Proof({
      paymentHeader: header,
      quoteId: 'quote-123',
      payTo,
      amount: 1234,
      currency: 'USD',
    });

    expect(result).toMatchObject({
      valid: false,
      reason: 'not verified',
    });
    expect(result.amount).toBeUndefined();
  });

  it('keeps future-block Base transfers processing with zero confirmations', async () => {
    const adapter = createAdapter({
      fetch: createRpcFetch({ currentBlock: '0x4', logBlockNumber: '0x5' }),
    });

    await expect(
      adapter.getStatus('quote-123', payTo, {
        settlementAmount: 12_340_000,
        searchStartBlock: 0,
      }),
    ).resolves.toMatchObject({
      status: 'processing',
      confirmations: 0,
    });
  });

  it('builds deterministic payment options through an injected deriver', async () => {
    const adapter = createAdapter();
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-abc',
      amount: 125,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });

    expect(option.payTo).toBe(payTo);
    expect(option.paymentUri).toContain('@8453/transfer');
    expect(option.metadata).toMatchObject({
      caip2Network: 'eip155:8453',
      tokenAddress: expect.any(String),
    });
  });

  it('rejects expired quotes before deriving a Base USDC payment option', async () => {
    const addressDeriver = vi.fn(() => payTo);
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch: createRpcFetch(),
      addressDeriver,
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-expired',
        amount: 125,
        currency: 'USD',
        expiresAt: '2000-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('Base USDC expiry is in the past');
    expect(addressDeriver).not.toHaveBeenCalled();
  });

  it('rejects zero-value Base USDC payment and payout requests', async () => {
    const adapter = createAdapter();

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-zero',
        amount: 0,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('Base USDC amount must be greater than zero');
    await expect(
      adapter.sendPayout({
        destination: '0x3333333333333333333333333333333333333333',
        amount: 0,
        currency: 'USDC',
      }),
    ).rejects.toThrow('Base USDC payout amount must be greater than zero');
  });

  it('accepts trimmed Base USDC payout currency input', async () => {
    const sendTransaction = vi.fn(async () => ({ transactionId: txHash }));
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch: createRpcFetch(),
      addressDeriver: () => payTo,
      sendTransaction,
    });

    await expect(
      adapter.sendPayout({
        destination: ' 0x3333333333333333333333333333333333333333 ',
        amount: 1_000_000,
        currency: ' usdc ',
        quoteId: ' quote-payout ',
      }),
    ).resolves.toMatchObject({
      destination: '0x3333333333333333333333333333333333333333',
      currency: 'USDC',
      amount: 1_000_000,
    });
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: '0x3333333333333333333333333333333333333333',
        amountAtomic: '1000000',
        quoteId: 'quote-payout',
      }),
    );
  });

  it('forwards Base USDC refund idempotency keys to the signer callback', async () => {
    const sendTransaction = vi.fn(async () => ({ transactionId: txHash }));
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch: createRpcFetch(),
      addressDeriver: () => payTo,
      sendTransaction,
    });

    await adapter.refundPayment({
      destination: '0x3333333333333333333333333333333333333333',
      amount: 1_000_000,
      currency: 'USDC',
      idempotencyKey: 'base-refund-idem-123',
    });

    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'base-refund-idem-123',
      }),
    );
  });

  it('rejects invalid Base USDC payout currencies before signing', async () => {
    const sendTransaction = vi.fn(async () => ({ transactionId: txHash }));
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch: createRpcFetch(),
      addressDeriver: () => payTo,
      sendTransaction,
    });

    await expect(
      adapter.sendPayout({
        destination: '0x3333333333333333333333333333333333333333',
        amount: 1_000_000,
        currency: ' ',
      }),
    ).rejects.toThrow('Base USDC payout currency must not be empty');
    await expect(
      adapter.sendPayout({
        destination: '0x3333333333333333333333333333333333333333',
        amount: 1_000_000,
        currency: 123 as never,
      }),
    ).rejects.toThrow('Base USDC payout currency must be a string');
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it('rejects non-USDC Base refund currencies before sending payouts', async () => {
    const sendTransaction = vi.fn(async () => ({ transactionId: txHash }));
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch: createRpcFetch(),
      addressDeriver: () => payTo,
      sendTransaction,
    });

    await expect(
      adapter.refundPayment({
        destination: '0x3333333333333333333333333333333333333333',
        amount: 1_000_000,
        currency: 'USD',
      }),
    ).rejects.toThrow('refunds require USDC currency');
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it('rejects blank Base USDC payout quote ids before signing', async () => {
    const sendTransaction = vi.fn(async () => ({ transactionId: txHash }));
    const adapter = new BaseUsdcAdapter({
      rpcUrl: 'https://base.example.test',
      fetch: createRpcFetch(),
      addressDeriver: () => payTo,
      sendTransaction,
    });

    await expect(
      adapter.sendPayout({
        destination: '0x3333333333333333333333333333333333333333',
        amount: 1_000_000,
        quoteId: ' ',
      }),
    ).rejects.toThrow('Base USDC payout quoteId must not be empty');
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it('derives deterministic EVM addresses from a BIP32 xpub', async () => {
    const { HDKey } = await import('@scure/bip32');
    const seed = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const masterXpub = HDKey.fromMasterSeed(seed).publicExtendedKey;
    const first = await deriveBaseUsdcAddress({
      masterXpub,
      path: 'm/0/42',
    });
    const second = await deriveBaseUsdcAddress({
      masterXpub,
      path: 'm/0/42',
    });

    expect(first).toMatch(/^0x[a-f0-9]{40}$/);
    expect(second).toBe(first);
    await expect(
      deriveBaseUsdcAddress({
        masterXpub: ` ${masterXpub} `,
        path: ' m/0/42 ',
      }),
    ).resolves.toBe(first);
    await expect(
      deriveBaseUsdcAddress({
        masterXpub,
        path: ' ',
      }),
    ).rejects.toThrow('Base USDC derivation path must not be empty');
  });
});
