import { describe, expect, it, vi } from 'vitest';
import { createPaymentBackend } from './factory.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createPaymentBackend', () => {
  it('dynamically creates the requested backend type', async () => {
    const backend = await createPaymentBackend({
      type: 'stripe',
      secretKey: 'sk_test_123',
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch: vi.fn(async () =>
        jsonResponse({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/c/pay/cs_test_123',
        }),
      ),
    });

    expect(backend.capabilities.id).toBe('stripe');
  });

  it('normalizes backend type whitespace before dispatching', async () => {
    const backend = await createPaymentBackend({
      type: ' stripe ',
      secretKey: 'sk_test_123',
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch: vi.fn(async () =>
        jsonResponse({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/c/pay/cs_test_123',
        }),
      ),
    } as never);

    expect(backend.capabilities.id).toBe('stripe');
  });

  it('throws on unknown backend types', async () => {
    await expect(
      createPaymentBackend({ type: 'unknown' } as never),
    ).rejects.toThrow('Unknown payment backend type');
  });

  it('rejects malformed backend factory options', async () => {
    await expect(createPaymentBackend(null as never)).rejects.toThrow(
      'Payment backend options must be an object',
    );
    await expect(createPaymentBackend({} as never)).rejects.toThrow(
      'Payment backend type must be a string',
    );
    await expect(createPaymentBackend({ type: 123 } as never)).rejects.toThrow(
      'Payment backend type must be a string',
    );
  });
});
