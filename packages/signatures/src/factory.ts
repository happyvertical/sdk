import type { BoldSignAdapterOptions } from './adapters/boldsign.js';
import { SignatureConfigurationError } from './errors.js';
import type { SignatureProvider } from './types.js';

export type SignatureProviderOptions = {
  type: 'boldsign';
} & BoldSignAdapterOptions;

export async function createSignatureProvider(
  options: SignatureProviderOptions,
): Promise<SignatureProvider> {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new SignatureConfigurationError(
      'Signature provider options must be an object.',
    );
  }

  const type = (options as { type?: unknown }).type;

  if (typeof type !== 'string' || !type.trim()) {
    throw new SignatureConfigurationError(
      'Signature provider type must be a non-empty string.',
    );
  }

  switch (type.trim()) {
    case 'boldsign': {
      const { BoldSignAdapter } = await import('./adapters/boldsign.js');
      return new BoldSignAdapter(options);
    }
    default:
      throw new SignatureConfigurationError(
        `Unknown signature provider type: ${type.trim()}`,
      );
  }
}
