import type { BaseUsdcAdapterOptions } from './adapters/base-usdc.js';
import type { BtcAdapterOptions } from './adapters/btc.js';
import type { StripeAdapterOptions } from './adapters/stripe.js';
import { PaymentConfigurationError } from './errors.js';
import type { PaymentBackend } from './types.js';

export type PaymentBackendOptions =
  | ({ type: 'base-usdc' } & BaseUsdcAdapterOptions)
  | ({ type: 'btc' } & BtcAdapterOptions)
  | ({ type: 'stripe' } & StripeAdapterOptions);

export async function createPaymentBackend(
  options: PaymentBackendOptions,
): Promise<PaymentBackend> {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new PaymentConfigurationError(
      'Payment backend options must be an object.',
    );
  }

  const type = (options as { type?: unknown }).type;

  if (typeof type !== 'string' || !type.trim()) {
    throw new PaymentConfigurationError(
      'Payment backend type must be a string.',
    );
  }

  const normalizedType = type.trim();
  const backendOptions = {
    ...options,
    type: normalizedType,
  } as PaymentBackendOptions;

  switch (backendOptions.type) {
    case 'base-usdc': {
      const { BaseUsdcAdapter } = await import('./adapters/base-usdc.js');
      return new BaseUsdcAdapter(backendOptions);
    }
    case 'btc': {
      const { BtcAdapter } = await import('./adapters/btc.js');
      return new BtcAdapter(backendOptions);
    }
    case 'stripe': {
      const { StripeAdapter } = await import('./adapters/stripe.js');
      return new StripeAdapter(backendOptions);
    }
    default:
      throw new PaymentConfigurationError(
        `Unknown payment backend type: ${normalizedType}`,
      );
  }
}
