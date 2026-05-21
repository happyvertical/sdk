/**
 * @happyvertical/payments - payment backend abstractions.
 *
 * This package defines the provider-neutral interface used by checkout, x402,
 * fiat checkout, and payout adapters. Concrete adapters live beside this
 * package and prove compatibility with the shared conformance suite.
 */

export * from './conformance';
export * from './types';

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;
