import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  BtcpayClient,
  createBtcpayCheckoutGateway,
} from './adapters/btcpay.js';
import { CryptoCheckoutNotOwnedError } from './checkout-gateway.js';
import {
  PaymentConfigurationError,
  PaymentVerificationError,
} from './errors.js';

const SECRET = 'whsec-gateway';
const STORE = 'store-1';
const TX = 'c'.repeat(64);

interface FakeInvoice {
  id: string;
  status: string;
  additionalStatus: string;
  amount: string;
  currency: string;
  createdTime: number;
  metadata: Record<string, unknown>;
  checkout: Record<string, unknown>;
  methods: Record<string, unknown>[];
  archived?: boolean;
  /** Test hook: what BTCPay echoes back as the invoice amount. */
  echoAmount?: string;
}

/** A minimal in-memory BTCPay store behind a fetch stub. */
function fakeBtcpay() {
  const invoices = new Map<string, FakeInvoice>();
  const created: Record<string, unknown>[] = [];
  let counter = 0;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
  const view = (invoice: FakeInvoice) => ({
    id: invoice.id,
    storeId: STORE,
    status: invoice.status,
    additionalStatus: invoice.additionalStatus,
    amount: invoice.echoAmount ?? invoice.amount,
    currency: invoice.currency,
    archived: invoice.archived === true,
    checkoutLink: `https://pay.example/i/${invoice.id}`,
    createdTime: invoice.createdTime,
    expirationTime: invoice.createdTime + 900,
    metadata: invoice.metadata,
    checkout: invoice.checkout,
  });
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(`/api/v1/stores/${STORE}`, '');
    if (path === '/invoices' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      created.push(body);
      counter += 1;
      const invoice: FakeInvoice = {
        id: `inv_${counter}`,
        status: 'New',
        additionalStatus: 'None',
        amount: body.amount,
        currency: body.currency,
        createdTime: 1_790_000_000 + counter,
        metadata: body.metadata,
        checkout: body.checkout,
        methods: [
          {
            paymentMethodId: 'BTC-CHAIN',
            currency: 'BTC',
            rate: '100000.00',
            amount: '0.00025000',
            paymentMethodPaid: '0',
            totalPaid: '0',
            due: '0.00025000',
            payments: [],
          },
        ],
      };
      if (hooks.echoAmount) invoice.echoAmount = hooks.echoAmount;
      invoices.set(invoice.id, invoice);
      return json(view(invoice));
    }
    if (path === '/invoices') {
      const orderIds = url.searchParams.getAll('orderId');
      const archived = url.searchParams.get('includeArchived') === 'true';
      return json(
        [...invoices.values()]
          .filter(
            (invoice) =>
              orderIds.includes(String(invoice.metadata.orderId)) &&
              (archived || !invoice.archived),
          )
          .map(view),
      );
    }
    const methods = /^\/invoices\/([^/]+)\/payment-methods$/.exec(path);
    if (methods) {
      const invoice = invoices.get(methods[1] ?? '');
      return invoice ? json(invoice.methods) : json({ code: 'nf' }, 404);
    }
    const one = /^\/invoices\/([^/]+)$/.exec(path);
    if (one) {
      const invoice = invoices.get(one[1] ?? '');
      return invoice ? json(view(invoice)) : json({ code: 'nf' }, 404);
    }
    return json({ code: 'unexpected' }, 500);
  };
  const hooks: { echoAmount?: string } = {};
  const client = new BtcpayClient({
    baseUrl: 'https://btcpay.example',
    apiKey: 'key',
    storeId: STORE,
    fetch,
  });
  return { client, invoices, created, hooks };
}

function invoiceOf(world: ReturnType<typeof fakeBtcpay>, id: string) {
  const invoice = world.invoices.get(id);
  if (!invoice) throw new Error(`missing ${id}`);
  return invoice;
}

function gatewayFor(world = fakeBtcpay(), extra: object = {}) {
  return {
    world,
    gateway: createBtcpayCheckoutGateway({
      client: world.client,
      webhookSecret: SECRET,
      speedPolicy: 'LowSpeed',
      rateSource: 'kraken',
      ...extra,
    }),
  };
}

describe('createBtcpayCheckoutGateway', () => {
  it('validates options', () => {
    const { client } = fakeBtcpay();
    const base = { client, webhookSecret: SECRET, speedPolicy: 'LowSpeed' };
    expect(() =>
      createBtcpayCheckoutGateway({ ...base, webhookSecret: '' } as never),
    ).toThrow(/webhookSecret/);
    expect(() =>
      createBtcpayCheckoutGateway({ ...base, speedPolicy: 'Fast' } as never),
    ).toThrow(/speedPolicy/);
    expect(() =>
      createBtcpayCheckoutGateway({ ...base, paymentMethods: [] } as never),
    ).toThrow(/paymentMethods/);
    expect(() =>
      createBtcpayCheckoutGateway({ ...base, paymentTolerance: 101 } as never),
    ).toThrow(/percentage/);
    expect(() =>
      createBtcpayCheckoutGateway({ ...base, expirationMinutes: 0 } as never),
    ).toThrow(/positive integer/);
  });

  it('creates a fiat-priced checkout with the configured policy, idempotently by orderId', async () => {
    const { gateway, world } = gatewayFor();
    const first = await gateway.createCheckout({
      orderId: 'order-1',
      amount: 2500,
      currency: 'cad',
      description: 'Prepaid credit',
      buyerEmail: 'a@b.test',
      metadata: { purpose: 'credit_purchase' },
      redirectUrl: 'https://app.test/done',
    });
    expect(world.created[0]).toMatchObject({
      amount: '25.00',
      currency: 'CAD',
      metadata: {
        orderId: 'order-1',
        itemDesc: 'Prepaid credit',
        buyerEmail: 'a@b.test',
        purpose: 'credit_purchase',
      },
      checkout: {
        speedPolicy: 'LowSpeed',
        paymentMethods: ['BTC-CHAIN'],
        expirationMinutes: 15,
        monitoringMinutes: 1440,
        paymentTolerance: 0,
        redirectURL: 'https://app.test/done',
        redirectAutomatically: true,
      },
    });
    expect(first).toMatchObject({
      gateway: 'btcpay',
      id: 'inv_1',
      orderId: 'order-1',
      status: 'open',
      exception: 'none',
      amount: 2500,
      currency: 'CAD',
      amountPaid: 0,
      settlementAsset: 'BTC',
      nativeAmountDue: '0.00025000',
      nativeAmountPaid: '0',
      rate: '100000.00',
      rateSource: 'kraken',
      checkoutUrl: 'https://pay.example/i/inv_1',
      metadata: { purpose: 'credit_purchase' },
    });
    // Only the caller's keys come back, so they round-trip into createCheckout.
    expect(Object.keys(first.metadata)).toEqual(['purpose']);

    const again = await gateway.createCheckout({
      orderId: 'order-1',
      amount: 2500,
      currency: 'CAD',
    });
    expect(again.id).toBe('inv_1');
    expect(world.created).toHaveLength(1);

    await expect(
      gateway.createCheckout({
        orderId: 'order-1',
        amount: 2600,
        currency: 'CAD',
      }),
    ).rejects.toBeInstanceOf(PaymentConfigurationError);
  });

  it('creates a fresh checkout once the previous one expired or was invalidated', async () => {
    const { gateway, world } = gatewayFor();
    await gateway.createCheckout({
      orderId: 'o',
      amount: 100,
      currency: 'USD',
    });
    const invoice = world.invoices.get('inv_1');
    if (!invoice) throw new Error('missing');
    invoice.status = 'Expired';
    const next = await gateway.createCheckout({
      orderId: 'o',
      amount: 100,
      currency: 'USD',
    });
    expect(next.id).toBe('inv_2');
    invoiceOf(world, 'inv_2').status = 'Invalid';
    expect(
      (
        await gateway.createCheckout({
          orderId: 'o',
          amount: 100,
          currency: 'USD',
        })
      ).id,
    ).toBe('inv_3');
    expect(
      (await gateway.listCheckouts({ orderId: 'o' })).map((c) => c.id),
    ).toEqual(['inv_1', 'inv_2', 'inv_3']);
  });

  it('reuses an archived live invoice instead of creating another', async () => {
    const { gateway, world } = gatewayFor();
    await gateway.createCheckout({
      orderId: 'a',
      amount: 100,
      currency: 'CAD',
    });
    const invoice = invoiceOf(world, 'inv_1');
    invoice.status = 'Settled';
    invoice.archived = true;
    const again = await gateway.createCheckout({
      orderId: 'a',
      amount: 100,
      currency: 'CAD',
    });
    expect(again).toMatchObject({ id: 'inv_1', status: 'settled' });
    expect(world.created).toHaveLength(1);
    expect(await gateway.listCheckouts({ orderId: 'a' })).toHaveLength(1);
  });

  it('refuses a created invoice whose price differs from the request', async () => {
    const { gateway, world } = gatewayFor();
    world.hooks.echoAmount = '24.99';
    await expect(
      gateway.createCheckout({ orderId: 'e', amount: 2500, currency: 'CAD' }),
    ).rejects.toThrow(/requested 2500 CAD/);
  });

  it('ignores invoices it did not create that share an order id', async () => {
    const { gateway, world } = gatewayFor();
    await gateway.createCheckout({
      orderId: 'f',
      amount: 100,
      currency: 'CAD',
    });
    const foreign = invoiceOf(world, 'inv_1');
    foreign.metadata = { orderId: 'f' };
    foreign.status = 'Weird';
    const mine = await gateway.createCheckout({
      orderId: 'f',
      amount: 100,
      currency: 'CAD',
    });
    expect(mine.id).toBe('inv_2');
    expect(world.created[1]?.metadata).toMatchObject({
      hvCheckoutGateway: 'crypto-checkout:v1',
    });
    expect(
      (await gateway.listCheckouts({ orderId: 'f' })).map((c) => c.id),
    ).toEqual(['inv_2']);
    await expect(gateway.getCheckout('inv_1')).rejects.toBeInstanceOf(
      CryptoCheckoutNotOwnedError,
    );
    // An earlier marker version still counts as ours.
    invoiceOf(world, 'inv_2').metadata.hvCheckoutGateway = 'crypto-checkout:v0';
    expect((await gateway.getCheckout('inv_2')).id).toBe('inv_2');
    await expect(
      gateway.createCheckout({
        orderId: 'g',
        amount: 1,
        currency: 'CAD',
        metadata: { hvCheckoutGateway: 'x' },
      }),
    ).rejects.toThrow(/reserved/);
  });

  it('fails loudly on an unknown payment status', async () => {
    const { gateway, world } = gatewayFor();
    await gateway.createCheckout({
      orderId: 'q',
      amount: 100,
      currency: 'CAD',
    });
    invoiceOf(world, 'inv_1').methods = [
      {
        paymentMethodId: 'BTC-CHAIN',
        rate: '1000',
        paymentMethodPaid: '0',
        payments: [{ id: `${TX}-0`, value: '0.001', fee: '0' }],
      },
    ];
    await expect(gateway.getCheckout('inv_1')).rejects.toThrow(
      /payment with unknown status ''/,
    );
  });

  it('refuses payment methods that settle in different assets', () => {
    const { client } = fakeBtcpay();
    expect(() =>
      createBtcpayCheckoutGateway({
        client,
        webhookSecret: SECRET,
        speedPolicy: 'LowSpeed',
        paymentMethods: ['BTC-CHAIN', 'LTC-CHAIN'],
      }),
    ).toThrow(/one asset/);
  });

  it('refuses a method with payments but no or zero paid amount', async () => {
    const { gateway, world } = gatewayFor();
    await gateway.createCheckout({
      orderId: 'z',
      amount: 100,
      currency: 'CAD',
    });
    const payment = {
      id: `${TX}-0`,
      value: '0.001',
      fee: '0',
      status: 'Settled',
    };
    invoiceOf(world, 'inv_1').methods = [
      { paymentMethodId: 'BTC-CHAIN', rate: '1000', payments: [payment] },
    ];
    await expect(gateway.getCheckout('inv_1')).rejects.toThrow(
      /no paid amount/,
    );
    invoiceOf(world, 'inv_1').methods = [
      {
        paymentMethodId: 'BTC-CHAIN',
        rate: '1000',
        paymentMethodPaid: '0',
        payments: [payment],
      },
    ];
    await expect(gateway.getCheckout('inv_1')).rejects.toThrow(/zero paid/);
    // Greenfield 1.x names the field `paid`.
    invoiceOf(world, 'inv_1').methods = [
      {
        paymentMethod: 'BTC',
        rate: '1000',
        paid: '0.001',
        payments: [payment],
      },
    ];
    expect((await gateway.getCheckout('inv_1')).amountPaid).toBe(100);
  });

  it('converts zero-decimal currencies exactly and refuses bad input', async () => {
    const { gateway, world } = gatewayFor();
    await gateway.createCheckout({
      orderId: 'jpy',
      amount: 1500,
      currency: 'JPY',
    });
    expect(world.created[0]?.amount).toBe('1500');
    await expect(
      gateway.createCheckout({ orderId: 'x', amount: 0, currency: 'CAD' }),
    ).rejects.toThrow(/positive integer/);
    await expect(
      gateway.createCheckout({ orderId: 'x', amount: 1.5, currency: 'CAD' }),
    ).rejects.toThrow(/positive integer/);
    await expect(
      gateway.createCheckout({
        orderId: 'x',
        amount: 1,
        currency: 'CAD',
        metadata: { orderId: 'spoof' },
      }),
    ).rejects.toThrow(/reserved/);
  });

  it.each([
    ['New', 'None', 'open', 'none'],
    ['Processing', 'None', 'confirming', 'none'],
    ['Settled', 'None', 'settled', 'none'],
    ['Settled', 'PaidOver', 'settled', 'overpaid'],
    ['Settled', 'Marked', 'settled', 'manually_marked'],
    ['Settled', 'PaidLate', 'settled', 'paid_late'],
    ['Expired', 'PaidPartial', 'expired', 'underpaid'],
    ['Expired', 'PaidLate', 'expired', 'paid_late'],
    ['Expired', 'None', 'expired', 'none'],
    ['Invalid', 'Invalid', 'invalid', 'none'],
    ['Invalid', 'Marked', 'invalid', 'manually_marked'],
  ])('maps %s/%s to %s/%s', async (status, additional, expected, exception) => {
    const { gateway, world } = gatewayFor();
    await gateway.createCheckout({
      orderId: 'm',
      amount: 100,
      currency: 'CAD',
    });
    const invoice = invoiceOf(world, 'inv_1');
    invoice.status = status;
    invoice.additionalStatus = additional;
    expect(await gateway.getCheckout('inv_1')).toMatchObject({
      status: expected,
      exception,
    });
  });

  it('fails loudly on unknown BTCPay states', async () => {
    const { gateway, world } = gatewayFor();
    await gateway.createCheckout({
      orderId: 'u',
      amount: 100,
      currency: 'CAD',
    });
    invoiceOf(world, 'inv_1').status = 'Complete';
    await expect(gateway.getCheckout('inv_1')).rejects.toThrow(
      /unknown status/,
    );
    invoiceOf(world, 'inv_1').status = 'New';
    invoiceOf(world, 'inv_1').additionalStatus = 'Weird';
    await expect(gateway.getCheckout('inv_1')).rejects.toThrow(
      /unknown additionalStatus/,
    );
  });

  it('derives the fiat paid amount exactly across on-chain and Lightning, rounded down', async () => {
    const { gateway, world } = gatewayFor(undefined, {
      paymentMethods: ['BTC-CHAIN', 'BTC-LN'],
    });
    await gateway.createCheckout({
      orderId: 'p',
      amount: 2500,
      currency: 'CAD',
    });
    const invoice = invoiceOf(world, 'inv_1');
    invoice.status = 'Settled';
    invoice.methods = [
      {
        paymentMethodId: 'BTC-LN',
        currency: 'BTC',
        rate: '99999.99',
        amount: '0.00025001',
        paymentMethodPaid: '0.00010000',
        totalPaid: '0.00025001',
        due: '0',
        payments: [
          {
            id: 'd'.repeat(64),
            value: '0.00010000',
            fee: '0',
            status: 'Settled',
            receivedDate: 1_790_000_050,
          },
        ],
      },
      {
        paymentMethodId: 'BTC-CHAIN',
        currency: 'BTC',
        rate: '99999.99',
        amount: '0.00025001',
        paymentMethodPaid: '0.00015001',
        totalPaid: '0.00025001',
        due: '0',
        payments: [
          {
            id: `${TX}-0`,
            value: '0.00015001',
            fee: '0.00000141',
            status: 'Settled',
            receivedDate: 1_790_000_100,
          },
          {
            id: `${'e'.repeat(64)}-1`,
            value: '0.00001',
            fee: '0',
            status: 'Invalid',
          },
        ],
      },
    ];
    const checkout = await gateway.getCheckout('inv_1');
    // 0.00025001 BTC × 99999.99 = 25.000997... CAD → 2500 cents (floor).
    expect(checkout.amountPaid).toBe(2500);
    expect(checkout).toMatchObject({
      status: 'settled',
      settlementAsset: 'BTC',
      nativeAmountDue: '0.00025001',
      nativeAmountPaid: '0.00025001',
      rate: '99999.99',
    });
    expect(checkout.payments).toEqual([
      expect.objectContaining({
        rail: 'lightning',
        asset: 'BTC',
        status: 'settled',
        transactionId: undefined,
        fee: undefined,
      }),
      expect.objectContaining({
        rail: 'onchain',
        status: 'settled',
        transactionId: TX,
        fee: '0.00000141',
      }),
      expect.objectContaining({ rail: 'onchain', status: 'invalid' }),
    ]);
    expect(checkout.payments[1]?.receivedAt?.getTime()).toBe(1_790_000_100_000);
  });

  it('refuses to value payments without a rate', async () => {
    const { gateway, world } = gatewayFor();
    await gateway.createCheckout({
      orderId: 'r',
      amount: 100,
      currency: 'CAD',
    });
    invoiceOf(world, 'inv_1').methods = [
      { paymentMethodId: 'BTC-CHAIN', paymentMethodPaid: '0.1', payments: [] },
    ];
    await expect(gateway.getCheckout('inv_1')).rejects.toThrow(/no rate/);
  });

  describe('verifyWebhook', () => {
    const body = (extra: object = {}) =>
      JSON.stringify({
        deliveryId: 'del_2',
        originalDeliveryId: 'del_1',
        isRedelivery: true,
        type: 'InvoiceSettled',
        storeId: STORE,
        invoiceId: 'inv_9',
        ...extra,
      });
    const sign = (raw: string, secret = SECRET) =>
      `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

    it('accepts a signed delivery with a stable event id', () => {
      const { gateway } = gatewayFor();
      const raw = body();
      expect(
        gateway.verifyWebhook(raw, new Headers({ 'BTCPay-Sig': sign(raw) })),
      ).toEqual({
        eventId: 'del_1',
        checkoutId: 'inv_9',
        type: 'InvoiceSettled',
        redelivery: true,
      });
      const plain = body({
        originalDeliveryId: undefined,
        isRedelivery: false,
      });
      expect(
        gateway.verifyWebhook(plain, { 'btcpay-sig': sign(plain) }),
      ).toMatchObject({ eventId: 'del_2', redelivery: false });
      const noInvoice = body({ invoiceId: undefined, type: 'PayoutCreated' });
      expect(
        gateway.verifyWebhook(noInvoice, { 'BTCPAY-SIG': sign(noInvoice) })
          .checkoutId,
      ).toBeNull();
    });

    it('rejects forged, unsigned, malformed, or other-store deliveries', () => {
      const { gateway } = gatewayFor();
      const raw = body();
      expect(() =>
        gateway.verifyWebhook(raw, { 'BTCPay-Sig': sign(raw, 'other') }),
      ).toThrow(PaymentVerificationError);
      expect(() => gateway.verifyWebhook(raw, {})).toThrow(
        PaymentVerificationError,
      );
      const bad = '{"type":"InvoiceSettled"}';
      expect(() =>
        gateway.verifyWebhook(bad, { 'BTCPay-Sig': sign(bad) }),
      ).toThrow(PaymentVerificationError);
      const foreign = body({ storeId: 'store-2' });
      expect(() =>
        gateway.verifyWebhook(foreign, { 'BTCPay-Sig': sign(foreign) }),
      ).toThrow(/another store/);
    });
  });
});
