/**
 * A scripted Stripe HTTP double for provider tests. Each test supplies a
 * route handler; every request is recorded with its decoded form/query
 * parameters and idempotency key.
 */
import { vi } from 'vitest';
import { StripeProvider } from '../src/providers/stripe/index.js';

export interface FakeStripeCall {
  method: string;
  path: string;
  params: Record<string, string>;
  idempotencyKey?: string;
}

export interface FakeStripeReply {
  status?: number;
  body: unknown;
}

export type FakeStripeRoute = (
  call: FakeStripeCall,
  calls: FakeStripeCall[],
) => FakeStripeReply | undefined;

export function createFakeStripe(route: FakeStripeRoute) {
  const calls: FakeStripeCall[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method || 'GET';
    const form =
      typeof init?.body === 'string'
        ? new URLSearchParams(init.body)
        : url.searchParams;
    const headers = new Headers(init?.headers);
    const call: FakeStripeCall = {
      method,
      path: url.pathname,
      params: Object.fromEntries(form.entries()),
      idempotencyKey: headers.get('Idempotency-Key') || undefined,
    };
    calls.push(call);
    const reply = route(call, calls);
    if (!reply) {
      throw new Error(`Unexpected Stripe request ${method} ${url.pathname}`);
    }
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const provider = new StripeProvider({
    type: 'stripe',
    secretKey: 'sk_test_fake',
    apiBaseUrl: 'https://api.stripe.test',
    maxRetries: 0,
    fetch: fetchMock as unknown as typeof fetch,
  });

  return { provider, calls, fetchMock };
}

export function stripeError(
  status: number,
  error: Record<string, unknown>,
): FakeStripeReply {
  return { status, body: { error } };
}
