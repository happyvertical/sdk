import { describe, expect, it } from 'vitest';
import {
  createFakeStripe,
  type FakeStripeCall,
  stripeError,
} from '../../../test/fake-stripe.js';

const invoice = {
  id: 'close-1',
  invoiceNumber: 'INV-1',
  customerId: 'account-42',
  customerExternalId: 'cus_1',
  issueDate: new Date('2026-09-01T00:00:00Z'),
  dueDate: new Date('2026-09-30T00:00:00Z'),
  subtotal: 0,
  taxAmount: 0,
  totalAmount: 0,
  currency: 'usd',
  idempotencyKey: 'close-1',
};

function itemCalls(calls: FakeStripeCall[]) {
  return calls.filter(
    (call) => call.method === 'POST' && call.path === '/v1/invoiceitems',
  );
}

function invoiceFake(
  coupons: Map<string, Record<string, unknown>> = new Map(),
  onCreateCoupon?: (call: FakeStripeCall) => ReturnType<typeof stripeError>,
) {
  return createFakeStripe((call) => {
    if (call.method === 'GET' && call.path === '/v1/invoices') {
      return { body: { data: [], has_more: false } };
    }
    if (call.method === 'GET' && call.path === '/v1/invoiceitems') {
      return { body: { data: [], has_more: false } };
    }
    if (call.path.startsWith('/v1/coupons/') && call.method === 'GET') {
      const id = decodeURIComponent(call.path.slice('/v1/coupons/'.length));
      const coupon = coupons.get(id);
      return coupon
        ? { body: coupon }
        : stripeError(404, {
            type: 'invalid_request_error',
            code: 'resource_missing',
          });
    }
    if (call.path === '/v1/coupons' && call.method === 'POST') {
      const override = onCreateCoupon?.(call);
      if (override) return override;
      const coupon = {
        id: call.params.id,
        amount_off: Number(call.params.amount_off),
        currency: call.params.currency,
        valid: true,
      };
      coupons.set(call.params.id as string, coupon);
      return { body: coupon };
    }
    if (call.path === '/v1/invoiceitems') return { body: { id: 'ii_1' } };
    if (call.path === '/v1/invoices') return { body: { id: 'in_1' } };
    if (call.path.startsWith('/v1/invoices/')) return { body: { id: 'in_1' } };
  });
}

describe('Stripe invoice line service periods (#1274)', () => {
  it('sends period start and end as Unix seconds', async () => {
    const { provider, calls } = invoiceFake();
    await provider.invoices.push({
      ...invoice,
      lineItems: [
        {
          description: 'Plan (prorated)',
          quantity: 1,
          unitPrice: 12.5,
          periodStart: new Date('2026-08-20T00:00:00Z'),
          periodEnd: new Date('2026-09-20T00:00:00Z'),
        },
        { description: 'Setup fee', quantity: 1, unitPrice: 5 },
      ],
    });
    const [plan, fee] = itemCalls(calls);
    expect(plan?.params).toMatchObject({
      'period[start]': String(Date.parse('2026-08-20T00:00:00Z') / 1000),
      'period[end]': String(Date.parse('2026-09-20T00:00:00Z') / 1000),
    });
    expect(fee?.params['period[start]']).toBeUndefined();
  });

  it.each([
    [{ periodStart: new Date('2026-09-01T00:00:00Z') }, 'needs both'],
    [{ periodEnd: new Date('2026-09-01T00:00:00Z') }, 'needs both'],
    [
      {
        periodStart: new Date('2026-09-02T00:00:00Z'),
        periodEnd: new Date('2026-09-01T00:00:00Z'),
      },
      'invalid service period',
    ],
    [
      {
        periodStart: new Date('invalid'),
        periodEnd: new Date('2026-09-01T00:00:00Z'),
      },
      'invalid service period',
    ],
  ])('rejects an unusable period %o before creating anything', async (period, message) => {
    const { provider, calls } = invoiceFake();
    await expect(
      provider.invoices.push({
        ...invoice,
        lineItems: [
          { description: 'Fine', quantity: 1, unitPrice: 1 },
          { description: 'Plan', quantity: 1, unitPrice: 10, ...period },
        ],
      }),
    ).rejects.toThrow(message);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });
});

describe('Stripe invoice line discounts and uncollectible status (#1271)', () => {
  it('applies a line discount as a shared amount-off coupon on the item', async () => {
    const { provider, calls } = invoiceFake();
    await provider.invoices.push({
      ...invoice,
      automaticTax: true,
      lineItems: [
        {
          description: 'Seats',
          quantity: 3,
          unitPrice: 10,
          discount: 5,
        },
        { description: 'Add-on', quantity: 1, unitPrice: 8, discount: 5 },
      ],
    });

    const couponCreates = calls.filter(
      (call) => call.method === 'POST' && call.path === '/v1/coupons',
    );
    expect(couponCreates).toHaveLength(1);
    expect(couponCreates[0]?.params).toMatchObject({
      id: 'hv_amount_off_usd_500',
      amount_off: '500',
      currency: 'usd',
      duration: 'forever',
    });
    const [seats, addon] = itemCalls(calls);
    expect(seats?.params).toMatchObject({
      quantity: '3',
      unit_amount_decimal: '1000',
      'discounts[0][coupon]': 'hv_amount_off_usd_500',
      tax_behavior: 'exclusive',
      'metadata[local_discount]': '5',
    });
    expect(addon?.params['discounts[0][coupon]']).toBe('hv_amount_off_usd_500');
  });

  it('reuses an existing coupon and survives a concurrent creator', async () => {
    const coupons = new Map<string, Record<string, unknown>>();
    let raced = false;
    const { provider, calls } = invoiceFake(coupons, (call) => {
      // Another worker created the coupon between our GET and POST.
      raced = true;
      coupons.set(call.params.id as string, {
        id: call.params.id,
        amount_off: 250,
        currency: 'eur',
        valid: true,
      });
      return stripeError(400, {
        type: 'invalid_request_error',
        code: 'resource_already_exists',
      });
    });
    await provider.invoices.push({
      ...invoice,
      currency: 'eur',
      lineItems: [
        { description: 'Plan', quantity: 1, unitPrice: 10, discount: 2.5 },
      ],
    });
    expect(raced).toBe(true);
    expect(itemCalls(calls)[0]?.params['discounts[0][coupon]']).toBe(
      'hv_amount_off_eur_250',
    );
  });

  it('refuses a coupon id that exists with different terms', async () => {
    const coupons = new Map([
      [
        'hv_amount_off_usd_500',
        { id: 'hv_amount_off_usd_500', percent_off: 50, valid: true },
      ],
    ]);
    const { provider, calls } = invoiceFake(coupons);
    await expect(
      provider.invoices.push({
        ...invoice,
        lineItems: [
          { description: 'Plan', quantity: 1, unitPrice: 10, discount: 5 },
        ],
      }),
    ).rejects.toThrow('is not a valid 500 usd amount-off coupon');
    expect(itemCalls(calls)).toHaveLength(0);
  });

  it.each([
    [{ discount: -1 }, 'non-negative'],
    [{ discount: Number.NaN }, 'non-negative'],
    [{ discount: 10.01 }, 'exceeds the line total'],
  ])('rejects an invalid discount %o before creating anything', async (discount, message) => {
    const { provider, calls } = invoiceFake();
    await expect(
      provider.invoices.push({
        ...invoice,
        lineItems: [
          { description: 'Plan', quantity: 1, unitPrice: 10, ...discount },
        ],
      }),
    ).rejects.toThrow(message);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('treats a zero discount as no discount', async () => {
    const { provider, calls } = invoiceFake();
    await provider.invoices.push({
      ...invoice,
      lineItems: [
        { description: 'Plan', quantity: 1, unitPrice: 10, discount: 0 },
      ],
    });
    expect(calls.some((call) => call.path.startsWith('/v1/coupons'))).toBe(
      false,
    );
    expect(itemCalls(calls)[0]?.params['discounts[0][coupon]']).toBeUndefined();
  });

  it('reports uncollectible invoices and marks them idempotently', async () => {
    const { provider, calls } = createFakeStripe((call) =>
      call.method === 'GET'
        ? {
            body: {
              id: 'in_1',
              status: 'uncollectible',
              currency: 'usd',
              total: 1000,
              amount_remaining: 1000,
            },
          }
        : { body: { id: 'in_1', status: 'uncollectible' } },
    );
    await expect(provider.invoices.pull('in_1')).resolves.toMatchObject({
      status: 'uncollectible',
      balance: 10,
    });
    await provider.invoices.markUncollectible?.('in_1');
    expect(calls[1]).toMatchObject({
      method: 'POST',
      path: '/v1/invoices/in_1/mark_uncollectible',
      idempotencyKey: 'in_1:mark_uncollectible',
    });
  });
});
