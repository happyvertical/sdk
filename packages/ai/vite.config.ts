import { createPackageConfig } from '../../vite.config.base.js';

// `node` is a separate entry (published as the `@happyvertical/ai/node`
// subpath, see package.json `exports`) so the Node-aware `getAIAuto` —
// which additionally checks provider-specific environment variables
// (LITELLM_*, BIFROST_*, OLLAMA_*, MODELARK_*, ARK_API_KEY,
// OPENAI_COMPAT_VIDEO_*, etc.) — is actually reachable by published-package
// consumers. The default `.` entry point stays universal/browser-safe and
// only exports the `HAVE_AI_*`-only `getAIAuto`.
export default createPackageConfig('ai', { node: 'src/node.ts' });
