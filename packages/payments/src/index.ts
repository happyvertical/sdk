/**
 * @happyvertical/payments - Multi-backend payment provider abstraction.
 *
 * The default entrypoint exports only provider contracts, shared errors, and
 * the dynamic factory. Adapter implementations live behind subpath exports:
 * `@happyvertical/payments/base-usdc`, `@happyvertical/payments/btc`,
 * `@happyvertical/payments/btcpay` (BTCPay Greenfield client), and
 * `@happyvertical/payments/stripe`.
 */

export * from './checkout-gateway.js';
export * from './errors.js';
export * from './factory.js';
export * from './types.js';

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;
