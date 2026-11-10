import { createPackageConfig } from '../../vite.config.base.js';

// `node` is a separate entry (published as the `@happyvertical/ai/node`
// subpath, see package.json `exports`) so the Node-aware `getAIAuto` —
// which additionally checks provider-specific environment variables
// (LITELLM_*, BIFROST_*, OLLAMA_*, MODELARK_*, ARK_API_KEY,
// OPENAI_COMPAT_VIDEO_*, etc.) — is actually reachable by published-package
// consumers. The default `.` entry point stays universal/browser-safe and
// only exports the `HAVE_AI_*`-only `getAIAuto`.
//
// `local` is the `@happyvertical/ai/local` subpath: in-browser providers whose
// optional peers (`@mlc-ai/web-llm`) are imported lazily and never bundled.
//
// `types` is the `@happyvertical/ai/types` light entry (#1503): provider
// names, types and error classes with no provider code or SDK imports.
export default createPackageConfig('ai', {
  node: 'src/node.ts',
  local: 'src/local.ts',
  types: 'src/types.ts',
});
