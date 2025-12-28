/**
 * @happyvertical/accounting - Multi-provider accounting integration
 *
 * This package provides a unified interface for syncing and auditing
 * accounting data (AR/AP) with external providers like QuickBooks Online,
 * Stripe, PayPal, and Coinbase Commerce.
 *
 * Key components:
 * - getAccountingProvider() - Factory function for creating provider instances
 * - AccountingProvider - Unified interface for all providers
 * - Audit operations for reconciling local vs external data
 *
 * @example
 * ```typescript
 * import { getAccountingProvider } from '@happyvertical/accounting';
 *
 * const provider = await getAccountingProvider({
 *   type: 'quickbooks',
 *   clientId: 'xxx',
 *   clientSecret: 'xxx',
 *   realmId: 'xxx',
 *   refreshToken: 'xxx'
 * });
 *
 * // Sync a customer
 * const result = await provider.customers.sync(customer);
 *
 * // Audit invoices
 * const report = await provider.audit.reconcileInvoices(localInvoices);
 * ```
 */

import { loadEnvConfig } from '@happyvertical/utils';
import type {
  AccountingOptions,
  AccountingProvider,
  QuickBooksOptions,
  StripeOptions,
} from './types.js';

// Re-export all types
export * from './types.js';

/**
 * Schema for environment variable type conversion
 */
const accountingOptionsSchema: Record<string, 'string' | 'number' | 'boolean'> =
  {
    type: 'string',
    clientId: 'string',
    clientSecret: 'string',
    realmId: 'string',
    refreshToken: 'string',
    environment: 'string',
    secretKey: 'string',
    apiKey: 'string',
    timeout: 'number',
    maxRetries: 'number',
  };

/**
 * Type guard for QuickBooks options
 */
export function isQuickBooksOptions(
  options: AccountingOptions,
): options is QuickBooksOptions {
  return options.type === 'quickbooks';
}

/**
 * Type guard for Stripe options
 */
export function isStripeOptions(
  options: AccountingOptions,
): options is StripeOptions {
  return options.type === 'stripe';
}

/**
 * Create an accounting provider instance
 *
 * Factory function that creates a provider-specific implementation
 * of the AccountingProvider interface. Uses dynamic imports to
 * load only the provider code you need.
 *
 * @param userOptions - Provider configuration options
 * @returns AccountingProvider instance
 *
 * @example
 * ```typescript
 * // QuickBooks Online
 * const qbo = await getAccountingProvider({
 *   type: 'quickbooks',
 *   clientId: process.env.QBO_CLIENT_ID!,
 *   clientSecret: process.env.QBO_CLIENT_SECRET!,
 *   realmId: process.env.QBO_REALM_ID!,
 *   refreshToken: process.env.QBO_REFRESH_TOKEN!,
 *   environment: 'sandbox',
 *   onTokenRefresh: async (tokens) => {
 *     // Persist refreshed tokens
 *     await saveTokens(tokens);
 *   }
 * });
 *
 * // Stripe
 * const stripe = await getAccountingProvider({
 *   type: 'stripe',
 *   secretKey: process.env.STRIPE_SECRET_KEY!
 * });
 *
 * // Use env vars for configuration
 * const provider = await getAccountingProvider({ type: 'quickbooks' });
 * // Reads HAVE_ACCOUNTING_CLIENT_ID, HAVE_ACCOUNTING_REALM_ID, etc.
 * ```
 */
export async function getAccountingProvider(
  userOptions: Partial<AccountingOptions> & { type: AccountingOptions['type'] },
): Promise<AccountingProvider> {
  // Load config from env vars, user options take precedence
  const options = loadEnvConfig<AccountingOptions>(userOptions, {
    packageName: 'accounting',
    schema: accountingOptionsSchema,
  });

  switch (options.type) {
    case 'quickbooks': {
      if (!isQuickBooksOptions(options)) {
        throw new Error('Invalid QuickBooks options');
      }
      const { QuickBooksProvider } = await import(
        './providers/quickbooks/index.js'
      );
      return new QuickBooksProvider(options);
    }

    case 'stripe': {
      if (!isStripeOptions(options)) {
        throw new Error('Invalid Stripe options');
      }
      const { StripeProvider } = await import('./providers/stripe/index.js');
      return new StripeProvider(options);
    }

    case 'paypal':
      throw new Error('PayPal provider not yet implemented');

    case 'coinbase':
      throw new Error('Coinbase provider not yet implemented');

    default:
      throw new Error(`Unknown provider type: ${(options as any).type}`);
  }
}

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;
