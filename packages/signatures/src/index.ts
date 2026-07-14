/**
 * Provider-neutral e-signature request, webhook, and evidence contracts.
 *
 * Adapter implementations are available from provider subpath exports.
 *
 * @packageDocumentation
 */

export type {
  BoldSignAdapterOptions,
  BoldSignRegion,
} from './adapters/boldsign.js';
export * from './errors.js';
export * from './factory.js';
export type { SignatureFetch } from './shared.js';
export * from './types.js';
