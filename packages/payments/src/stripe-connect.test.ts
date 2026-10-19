import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { StripeAdapter, type StripeAdapterOptions } from './adapters/stripe.js';
import {
  PaymentConfigurationError,
  PaymentNotOwnedError,
  PaymentProviderError,
  PaymentVerificationError,
} from './errors.js';

// Test-only secrets. Never real Stripe keys.
const platformSecret = 'whsec_test_platform';
const connectSecret = 'whsec_test_connect';
const secretKey = 'sk_test_fixture';

const fixtureDir = resolve(__dirname, '../fixtures/stripe-connect');

function fixture(name: string): string {
  return readFileSync(resolve(fixtureDir, `${name}.json`), 'utf8');
}

function fixtureJson(name: string): Record<string, unknown> {
  return JSON.parse(fixture(name));
}

function sign(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1_000);
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createAdapter(options: Partial<StripeAdapterOptions> = {}) {
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/accounts') && init?.method === 'POST') {
        return jsonResponse(fixtureJson('account-created'));
      }

      if (url.endsWith('/account_links') && init?.method === 'POST') {
        return jsonResponse(fixtureJson('account-link'));
      }

      if (url.endsWith('/accounts/acct_1TestCoop0001')) {
        return jsonResponse(fixtureJson('account'));
      }

      return jsonResponse({ error: { message: 'not found' } }, 404);
    },
  );
  const adapter = new StripeAdapter({
    secretKey,
    apiBaseUrl: 'https://stripe.example/v1',
    fetch,
    webhookSecret: platformSecret,
    connectWebhookSecret: connectSecret,
    ...options,
  });

  return { adapter, fetch };
}

function requestOf(fetch: ReturnType<typeof createAdapter>['fetch'], n = 0) {
  const [input, init] = fetch.mock.calls[n] ?? [];
  return {
    url: String(input),
    method: init?.method ?? 'GET',
    headers: new Headers(init?.headers),
    body: new URLSearchParams(String(init?.body ?? '')),
  };
}

describe('StripeAdapter Connect webhooks', () => {
  it('verifies Connect endpoint events with the Connect secret and exposes the account', () => {
    const { adapter } = createAdapter();
    const payload = fixture('event-connect-checkout-completed');
    const event = adapter.parseConnectWebhookEvent(
      payload,
      sign(payload, connectSecret),
    );

    expect(event).toMatchObject({
      id: 'evt_1TestConnectCheckout',
      type: 'checkout.session.completed',
      account: 'acct_1TestCoop0001',
      status: 'confirmed',
      quoteId: 'quote-coop-1',
      providerPaymentId: 'cs_test_connect_1',
      duplicate: false,
    });
    expect(event.connect).toBeUndefined();
  });

  it('rejects a Connect event signed with the platform secret', () => {
    const { adapter } = createAdapter();
    const payload = fixture('event-connect-checkout-completed');

    expect(() =>
      adapter.parseConnectWebhookEvent(payload, sign(payload, platformSecret)),
    ).toThrow('Invalid Stripe webhook signature');
  });

  it('rejects a Connect event on the platform endpoint instead of treating it as a platform event', () => {
    const { adapter } = createAdapter();
    const payload = fixture('event-connect-checkout-completed');

    expect(() =>
      adapter.parseWebhookEvent(payload, sign(payload, platformSecret)),
    ).toThrow(PaymentVerificationError);
  });

  it('verifies the signature before parsing the payload', () => {
    const { adapter } = createAdapter();

    expect(() =>
      adapter.parseConnectWebhookEvent(
        'not-json',
        sign('other', connectSecret),
      ),
    ).toThrow('Invalid Stripe webhook signature');
    expect(() =>
      adapter.parseConnectWebhookEvent(
        'not-json',
        sign('not-json', connectSecret),
      ),
    ).toThrow('Invalid Stripe webhook JSON payload');
  });

  it('rejects Connect endpoint events without a valid connected account', () => {
    const { adapter } = createAdapter();
    const withoutAccount = JSON.stringify({
      ...fixtureJson('event-connect-checkout-completed'),
      account: undefined,
    });
    const badAccount = JSON.stringify({
      ...fixtureJson('event-connect-checkout-completed'),
      account: 'cus_123',
    });

    expect(() =>
      adapter.parseConnectWebhookEvent(
        withoutAccount,
        sign(withoutAccount, connectSecret),
      ),
    ).toThrow(PaymentVerificationError);
    expect(() =>
      adapter.parseConnectWebhookEvent(
        badAccount,
        sign(badAccount, connectSecret),
      ),
    ).toThrow(PaymentVerificationError);
  });

  it('requires connectWebhookSecret and never echoes secrets in errors', () => {
    const { adapter } = createAdapter({ connectWebhookSecret: undefined });
    const payload = fixture('event-account-updated');

    expect(() =>
      adapter.parseConnectWebhookEvent(payload, sign(payload, connectSecret)),
    ).toThrow(PaymentConfigurationError);
    expect(
      () => new StripeAdapter({ secretKey, connectWebhookSecret: '  ' }),
    ).toThrow('connectWebhookSecret must not be empty');

    const { adapter: configured } = createAdapter();
    let message = '';
    try {
      configured.parseConnectWebhookEvent(
        payload,
        sign(payload, 'whsec_wrong'),
      );
    } catch (error) {
      message = String(error);
    }
    expect(message).not.toContain(connectSecret);
    expect(message).not.toContain(platformSecret);
    expect(message).not.toContain(secretKey);
  });

  it('types account.updated with capability state', () => {
    const { adapter } = createAdapter();
    const payload = fixture('event-account-updated');
    const event = adapter.parseConnectWebhookEvent(
      payload,
      sign(payload, connectSecret),
    );

    expect(event.account).toBe('acct_1TestCoop0001');
    expect(event.status).toBe('processing');
    expect(event.connect).toMatchObject({
      type: 'account.updated',
      account: {
        accountId: 'acct_1TestCoop0001',
        type: 'standard',
        chargesEnabled: true,
        detailsSubmitted: true,
        payoutsEnabled: true,
        capabilities: Object.fromEntries([
          ['card_payments', 'active'],
          ['transfers', 'active'],
        ]),
        requirements: { currentlyDue: [], eventuallyDue: [], pastDue: [] },
        country: 'US',
        defaultCurrency: 'USD',
      },
    });
  });

  it('rejects account.updated whose object is a different account', () => {
    const { adapter } = createAdapter();
    const payload = JSON.stringify({
      ...fixtureJson('event-account-updated'),
      account: 'acct_1TestOther0009',
    });

    expect(() =>
      adapter.parseConnectWebhookEvent(payload, sign(payload, connectSecret)),
    ).toThrow('did not match the event account');
  });

  it('types application_fee.created and application_fee.refunded on the platform endpoint', () => {
    const { adapter } = createAdapter();
    const created = fixture('event-application-fee-created');
    const refunded = fixture('event-application-fee-refunded');
    const createdEvent = adapter.parseWebhookEvent(
      created,
      sign(created, platformSecret),
    );
    const refundedEvent = adapter.parseWebhookEvent(
      refunded,
      sign(refunded, platformSecret),
    );

    expect(createdEvent.account).toBeUndefined();
    expect(createdEvent.status).toBe('processing');
    expect(createdEvent.connect).toMatchObject({
      type: 'application_fee.created',
      applicationFee: {
        id: 'fee_1TestFee0001',
        account: 'acct_1TestCoop0001',
        amount: 500,
        amountRefunded: 0,
        currency: 'USD',
        refunded: false,
        charge: 'ch_test_connect_1',
        livemode: false,
      },
    });
    // A refunded platform fee is not a refunded customer payment.
    expect(refundedEvent.status).toBe('processing');
    expect(refundedEvent.connect).toMatchObject({
      type: 'application_fee.refunded',
      applicationFee: { amountRefunded: 500, refunded: true },
    });
  });

  it('rejects events for another account on an account-scoped adapter', () => {
    const { adapter } = createAdapter({ stripeAccount: 'acct_1TestOther0009' });
    const payload = fixture('event-account-updated');

    expect(() =>
      adapter.parseConnectWebhookEvent(payload, sign(payload, connectSecret)),
    ).toThrow(PaymentNotOwnedError);
  });
});

describe('StripeAdapter.resolveConnectWebhookEvent', () => {
  const owners = new Map([['acct_1TestCoop0001', { tenantId: 'tenant-1' }]]);
  const resolveAccount = (account: string) => owners.get(account);

  it('maps the verified connected account to its owner', async () => {
    const { adapter } = createAdapter();
    const payload = fixture('event-connect-checkout-completed');
    const resolver = vi.fn(resolveAccount);
    const resolved = await adapter.resolveConnectWebhookEvent(
      payload,
      sign(payload, connectSecret),
      { resolveAccount: resolver },
    );

    expect(resolved.account).toBe('acct_1TestCoop0001');
    expect(resolved.owner).toEqual({ tenantId: 'tenant-1' });
    expect(resolved.event.duplicate).toBe(false);
    expect(resolver).toHaveBeenCalledWith('acct_1TestCoop0001', resolved.event);
  });

  it('never calls the resolver for an unverified delivery', async () => {
    const { adapter } = createAdapter();
    const payload = fixture('event-connect-checkout-completed');
    const resolver = vi.fn(resolveAccount);

    await expect(
      adapter.resolveConnectWebhookEvent(payload, sign(payload, 'whsec_bad'), {
        resolveAccount: resolver,
      }),
    ).rejects.toThrow(PaymentProviderError);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('rejects unknown accounts explicitly and does not mark them as seen', async () => {
    const { adapter } = createAdapter();
    const payload = JSON.stringify({
      ...fixtureJson('event-connect-checkout-completed'),
      account: 'acct_1TestUnknown01',
    });
    const signature = sign(payload, connectSecret);

    await expect(
      adapter.resolveConnectWebhookEvent(payload, signature, {
        resolveAccount,
      }),
    ).rejects.toThrow(PaymentNotOwnedError);

    // Once the host maps the account, Stripe's retry is not a duplicate.
    const retried = await adapter.resolveConnectWebhookEvent(
      payload,
      signature,
      { resolveAccount: () => ({ tenantId: 'tenant-late' }) },
    );
    expect(retried.event.duplicate).toBe(false);
    const again = await adapter.resolveConnectWebhookEvent(payload, signature, {
      resolveAccount: () => ({ tenantId: 'tenant-late' }),
    });
    expect(again.event.duplicate).toBe(true);
  });

  it('propagates resolver failures', async () => {
    const { adapter } = createAdapter();
    const payload = fixture('event-account-updated');

    await expect(
      adapter.resolveConnectWebhookEvent(
        payload,
        sign(payload, connectSecret),
        {
          resolveAccount: async () => {
            throw new Error('tenant store unavailable');
          },
        },
      ),
    ).rejects.toThrow('tenant store unavailable');
  });

  it('routes platform application fee events by the fee account', async () => {
    const { adapter } = createAdapter();
    const payload = fixture('event-application-fee-created');
    const resolved = await adapter.resolveConnectWebhookEvent(
      payload,
      sign(payload, platformSecret),
      { endpoint: 'platform', resolveAccount },
    );

    expect(resolved.account).toBe('acct_1TestCoop0001');
    expect(resolved.owner).toEqual({ tenantId: 'tenant-1' });
  });

  it('rejects platform events that have no connected account to route by', async () => {
    const { adapter } = createAdapter();
    const payload = JSON.stringify({
      id: 'evt_platform_checkout',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_platform', status: 'complete' } },
    });
    const resolver = vi.fn(resolveAccount);

    await expect(
      adapter.resolveConnectWebhookEvent(
        payload,
        sign(payload, platformSecret),
        {
          endpoint: 'platform',
          resolveAccount: resolver,
        },
      ),
    ).rejects.toThrow(PaymentNotOwnedError);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('requires a resolver function', async () => {
    const { adapter } = createAdapter();
    const payload = fixture('event-account-updated');

    await expect(
      adapter.resolveConnectWebhookEvent(
        payload,
        sign(payload, connectSecret),
        {} as never,
      ),
    ).rejects.toThrow(PaymentConfigurationError);
  });
});

describe('StripeAdapter Connect onboarding', () => {
  it('creates a Standard account on the platform', async () => {
    const { adapter, fetch } = createAdapter({
      stripeAccount: 'acct_1TestCoop0001',
    });
    const account = await adapter.createStandardAccount({
      country: 'ca',
      email: 'treasurer@coop.example',
      businessType: 'non_profit',
      metadata: { tenant: 'tenant-test-2' },
      idempotencyKey: 'create-account-tenant-test-2',
    });
    const request = requestOf(fetch);

    expect(request.url).toBe('https://stripe.example/v1/accounts');
    expect(request.method).toBe('POST');
    // Account creation is a platform call even on an account-scoped adapter.
    expect(request.headers.get('Stripe-Account')).toBeNull();
    expect(request.headers.get('Idempotency-Key')).toBe(
      'create-account-tenant-test-2',
    );
    expect(Object.fromEntries(request.body)).toEqual({
      type: 'standard',
      country: 'CA',
      email: 'treasurer@coop.example',
      ...Object.fromEntries([['business_type', 'non_profit']]),
      'metadata[tenant]': 'tenant-test-2',
    });
    expect(account).toMatchObject({
      accountId: 'acct_1TestCoop0002',
      type: 'standard',
      chargesEnabled: false,
      detailsSubmitted: false,
      payoutsEnabled: false,
      requirements: {
        pastDue: ['external_account'],
        disabledReason: 'requirements.past_due',
      },
      defaultCurrency: 'CAD',
    });
  });

  it('rejects an invalid country before calling Stripe', async () => {
    const { adapter, fetch } = createAdapter();

    await expect(
      adapter.createStandardAccount({ country: 'Canada' }),
    ).rejects.toThrow(PaymentConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates an Account Links onboarding link', async () => {
    const { adapter, fetch } = createAdapter();
    const link = await adapter.createOnboardingLink(
      'acct_1TestCoop0002',
      'https://app.example/connect/return',
      'https://app.example/connect/refresh',
    );
    const request = requestOf(fetch);

    expect(request.url).toBe('https://stripe.example/v1/account_links');
    expect(request.headers.get('Stripe-Account')).toBeNull();
    expect(Object.fromEntries(request.body)).toEqual({
      account: 'acct_1TestCoop0002',
      type: 'account_onboarding',
      ...Object.fromEntries([
        ['return_url', 'https://app.example/connect/return'],
        ['refresh_url', 'https://app.example/connect/refresh'],
      ]),
    });
    expect(link.url).toBe(
      'https://connect.stripe.com/setup/s/acct_1TestCoop0002/fixtureLinkToken',
    );
    expect(link.expiresAt).toEqual(new Date(1792000500 * 1_000));
  });

  it('passes collect and idempotency options to Account Links', async () => {
    const { adapter, fetch } = createAdapter();
    await adapter.createOnboardingLink(
      'acct_1TestCoop0002',
      'https://app.example/connect/return',
      'https://app.example/connect/refresh',
      { collect: 'eventually_due', idempotencyKey: 'link-1' },
    );
    const request = requestOf(fetch);

    expect(request.body.get('collect')).toBe('eventually_due');
    expect(request.headers.get('Idempotency-Key')).toBe('link-1');
  });

  it('validates onboarding link inputs before calling Stripe', async () => {
    const { adapter, fetch } = createAdapter();

    await expect(
      adapter.createOnboardingLink(
        '../charges',
        'https://app.example/r',
        'https://app.example/f',
      ),
    ).rejects.toThrow('acct_');
    await expect(
      adapter.createOnboardingLink(
        'acct_1TestCoop0002',
        'not a url',
        'https://app.example/f',
      ),
    ).rejects.toThrow(PaymentConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads account capabilities', async () => {
    const { adapter, fetch } = createAdapter();
    const status = await adapter.getAccountCapabilities('acct_1TestCoop0001');
    const request = requestOf(fetch);

    expect(request.url).toBe(
      'https://stripe.example/v1/accounts/acct_1TestCoop0001',
    );
    expect(request.method).toBe('GET');
    expect(request.headers.get('Stripe-Account')).toBeNull();
    expect(status).toMatchObject({
      accountId: 'acct_1TestCoop0001',
      type: 'standard',
      chargesEnabled: true,
      detailsSubmitted: true,
      payoutsEnabled: false,
      capabilities: Object.fromEntries([
        ['card_payments', 'active'],
        ['transfers', 'active'],
        ['us_bank_account_ach_payments', 'pending'],
      ]),
      requirements: {
        currentlyDue: ['external_account'],
        eventuallyDue: ['external_account', 'company.tax_id'],
        pastDue: [],
      },
      country: 'US',
      defaultCurrency: 'USD',
    });
    expect(status.requirements.disabledReason).toBeUndefined();
  });

  it('rejects a capabilities response for a different account', async () => {
    const adapter = new StripeAdapter({
      secretKey,
      apiBaseUrl: 'https://stripe.example/v1',
      fetch: async () => jsonResponse(fixtureJson('account')),
    });

    await expect(
      adapter.getAccountCapabilities('acct_1TestOther0009'),
    ).rejects.toThrow(PaymentVerificationError);
  });

  it('does not include the secret key in provider errors', async () => {
    const adapter = new StripeAdapter({
      secretKey,
      apiBaseUrl: 'https://stripe.example/v1',
      fetch: async () =>
        jsonResponse({ error: { message: 'No such account' } }, 404),
    });
    let message = '';
    try {
      await adapter.getAccountCapabilities('acct_1TestMissing1');
    } catch (error) {
      message = String(error);
    }

    expect(message).toContain('No such account');
    expect(message).not.toContain(secretKey);
  });
});
