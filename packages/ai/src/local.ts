/**
 * @happyvertical/ai/local
 *
 * On-device AI that runs entirely in the browser. Currently the WebLLM
 * (WebGPU) chat provider, backed by `@mlc-ai/web-llm`, an optional peer
 * dependency imported lazily on first request. `getAI({ type: 'webllm' })`
 * from the root entry reaches the same provider; this subpath exists for
 * direct construction and for the helpers below.
 *
 * @example
 * ```typescript
 * import { getAI } from '@happyvertical/ai';
 *
 * const ai = await getAI({
 *   type: 'webllm',
 *   model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
 *   onLoadProgress: ({ progress, text }) => console.log(progress, text),
 * });
 * const reply = await ai.message('Pick a package for a blog', {
 *   responseSchema: {
 *     type: 'object',
 *     properties: { package: { enum: ['smrt-content', 'smrt-commerce'] } },
 *     required: ['package'],
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

export {
  DEFAULT_WEBLLM_MODEL,
  disposeWebLLMEngines,
  importWebLLM,
  isWebGPUAvailable,
  WebLLMProvider,
} from './shared/providers/webllm';
export type {
  WebLLMEngineLike,
  WebLLMLoadProgress,
  WebLLMOptions,
} from './shared/types';
export { WebGPUUnavailableError, WebLLMPeerMissingError } from './shared/types';
