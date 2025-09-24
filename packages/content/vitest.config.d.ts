/**
 * Standalone Vitest configuration for SMRT Content template
 *
 * This is a self-contained configuration that includes:
 * - SMRT plugin for virtual module generation
 * - Svelte support for UI components
 * - Full test environment setup
 *
 * This template can be copied to other repositories as a complete example
 * of testing SMRT-based content management systems.
 */
declare const _default: import('vite').UserConfig &
  Promise<import('vite').UserConfig> &
  (import('vitest/config').UserConfigFnObject &
    import('vitest/config').UserConfigExport);
export default _default;
//# sourceMappingURL=vitest.config.d.ts.map
