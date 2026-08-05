/**
 * Node.js-enhanced entry point for @happyvertical/ai
 *
 * Re-exports everything from the universal entry point (`.`), but replaces
 * `getAIAuto` with the Node-aware version from `./node/factory`, which
 * additionally auto-detects providers from process.env — including
 * provider-specific variables the universal (`HAVE_AI_*`-only) `getAIAuto`
 * does not check, such as `LITELLM_BASE_URL`, `BIFROST_BASE_URL`,
 * `OLLAMA_HOST`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `HF_TOKEN`,
 * `AWS_*`, `MODELARK_API_KEY` / `ARK_API_KEY`, and
 * `OPENAI_COMPAT_VIDEO_BASE_URL`.
 *
 * The default `.` entry point stays universal/browser-safe (it must not
 * reference `process.env` directly for provider-specific detection); import
 * from `@happyvertical/ai/node` in Node.js contexts that want the fuller
 * auto-detection.
 *
 * @example
 * ```typescript
 * import { getAIAuto } from '@happyvertical/ai/node';
 *
 * // Resolves to byteplus-modelark from MODELARK_API_KEY alone, which the
 * // universal getAIAuto (imported from '@happyvertical/ai') cannot do.
 * const client = await getAIAuto({});
 * ```
 */
export * from './index';
export { getAIAuto } from './node/factory';
