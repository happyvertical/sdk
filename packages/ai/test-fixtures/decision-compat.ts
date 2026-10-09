/**
 * Compile-time fixtures. They are type-checked by `pnpm typecheck` (see
 * tsconfig.fixtures.json) and never run or published.
 *
 * They prove that adding the Laya decision provider, and the optional
 * `provenance.details` field it uses, leave consumers written against the
 * earlier decision contract compiling: existing providers, capability
 * literals, third-party `AIInterface` implementations, TypeSafe options and
 * results, and exhaustive handling of provider types.
 */

import type { OllamaProvider } from '../src/shared/providers/ollama';
import type { SeevioProvider } from '../src/shared/providers/seevio';
import type { TypeSafeProvider } from '../src/shared/providers/typesafe';
import type {
  AICapabilities,
  AIInterface,
  AIProviderType,
  DecisionOptions,
  DecisionRequest,
  DecisionResult,
  GetAIOptions,
  LayaDecisionOptions,
  LayaOptions,
  TypeSafeOptions,
} from '../src/shared/types';

function assertType<_T extends true>(): void {}

// Existing providers still satisfy the unchanged interface, and `decide`
// stays optional so providers written before it need no change.
export function legacyProviders(
  seevio: SeevioProvider,
  ollama: OllamaProvider,
  typesafe: TypeSafeProvider,
): AIInterface[] {
  assertType<undefined extends AIInterface['decide'] ? true : false>();
  return [seevio, ollama, typesafe];
}

// A capability literal that predates `decisions` is still a valid value.
export const legacyCapabilities: AICapabilities = {
  chat: true,
  completion: true,
  embeddings: false,
  streaming: true,
  functions: false,
  vision: false,
  fineTuning: false,
  imageEmbeddings: false,
  imageGeneration: false,
  videoGeneration: false,
  tts: false,
  voiceCloning: false,
  voiceDesign: false,
  maxContextLength: 8192,
  supportedOperations: ['chat'],
};

// A decision result built before `provenance.details` existed is still valid.
export const legacyResult: DecisionResult = {
  model: 'jev-1.13.0',
  provenance: { provider: 'typesafe', model: 'jev-1.13.0' },
  answers: { a: { type: 'predicate', probability: 0.5 } },
};

// A request and options built for the TypeSafe adapter work unchanged.
export const legacyRequest: DecisionRequest = {
  state: { message: 'hello' },
  questions: { a: { type: 'predicate', instructions: 'Is it a greeting?' } },
};
export const legacyOptions: DecisionOptions = {
  model: 'jev-latest',
  timeout: 1000,
};

// Existing option shapes are still accepted by the provider union.
export const typesafeOptions: GetAIOptions = {
  type: 'typesafe',
  apiKey: 'key',
};
export const openaiOptions: GetAIOptions = { type: 'openai', apiKey: 'key' };
export const typesafeStrict: TypeSafeOptions = { type: 'typesafe' };

// Laya options join the union and Laya's per-request options are a strict
// extension of the neutral ones, so they pass anywhere `DecisionOptions` does.
export const layaOptions: GetAIOptions = {
  type: 'laya',
  baseUrl: 'http://localhost:8000',
  defaultModel: 'typed-decisions',
  maxLen: 1024,
};
export const layaPerRequest: LayaDecisionOptions = {
  model: 'english',
  maxLen: 512,
  timeout: 1000,
};
export const asNeutral: DecisionOptions = layaPerRequest;
export const layaConfig: LayaOptions = {
  type: 'laya',
  baseUrl: 'http://localhost:8000',
};

// Laya-only settings are not accepted by other providers.
export const typesafeWithMaxLen: TypeSafeOptions = {
  type: 'typesafe',
  // @ts-expect-error `maxLen` belongs to Laya, not TypeSafe.
  maxLen: 1,
};
export const badMaxLen: LayaOptions = {
  type: 'laya',
  // @ts-expect-error `maxLen` must be a number.
  maxLen: '1024',
};
export const neutralWithMaxLen: DecisionOptions = {
  // @ts-expect-error a neutral request has no Laya window.
  maxLen: 1,
};

// Handling every provider type exhaustively still compiles, and 'laya' is one.
export function describeProvider(type: AIProviderType): string {
  switch (type) {
    case 'openai':
    case 'litellm':
    case 'bifrost':
    case 'ollama':
    case 'gemini':
    case 'anthropic':
    case 'huggingface':
    case 'bedrock':
    case 'claude-cli':
    case 'qwen3-tts':
    case 'openai-compat-video':
    case 'byteplus-modelark':
    case 'seevio':
    case 'typesafe':
    case 'laya':
    case 'webllm':
      return type;
    default: {
      const unreachable: never = type;
      return unreachable;
    }
  }
}
