import { createPackageConfig } from '../../vite.config.base.js';

const config = createPackageConfig('speech', {
  local: 'src/local.ts',
});

// Optional peer of the `./local` entry: resolved by the consumer, never bundled.
const external = config.build?.rollupOptions?.external;
if (Array.isArray(external)) {
  external.push('@huggingface/transformers', /^@huggingface\/transformers\//);
}

export default config;
