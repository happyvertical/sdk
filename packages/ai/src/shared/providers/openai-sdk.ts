/**
 * Lazy loader for the `openai` SDK (#1503).
 *
 * Nothing in the package imports `openai` at module scope, so importing
 * `@happyvertical/ai` (or a constant such as `AI_PROVIDER_TYPES`) never loads
 * it. The OpenAI-compatible providers and `OpenAIClient` call
 * {@link loadOpenAISdk} on their first request.
 */

import type OpenAI from 'openai';
import { AIError } from '../types';

/** The `openai` package's default export (the client class and its error classes). */
export type OpenAISdk = typeof OpenAI;

let loadedSdk: OpenAISdk | undefined;

/**
 * Import the `openai` SDK once and cache it.
 *
 * @param provider - Provider name reported on the error when loading fails
 * @throws {AIError} `INITIALIZATION_ERROR` naming the package to install when
 *   the SDK cannot be loaded (for example a bundle that left it out)
 */
export async function loadOpenAISdk(provider = 'openai'): Promise<OpenAISdk> {
  if (loadedSdk) return loadedSdk;
  try {
    loadedSdk = (await import('openai')).default;
    return loadedSdk;
  } catch (cause) {
    const error = new AIError(
      `The ${provider} provider needs the openai package, which could not be loaded. Install it with \`pnpm add openai\` (or the npm/yarn equivalent), and keep it in your bundle.`,
      'INITIALIZATION_ERROR',
      provider,
    );
    error.cause = cause;
    throw error;
  }
}

/**
 * The SDK if a provider has already loaded it. Error checks use this: an
 * `openai` error object can only exist after the SDK was loaded.
 */
export function loadedOpenAISdk(): OpenAISdk | undefined {
  return loadedSdk;
}
