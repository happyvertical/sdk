import { mergeConfig } from 'vite';
import { createPackageConfig } from '../../vite.config.base.js';

export default mergeConfig(createPackageConfig('messages'), {
  build: {
    rollupOptions: {
      external: [
        // CJS dependency (Slack SDK) - keep external so its
        // `require('node:os')` shim runs under real CJS, not the
        // rolldown `__require` polyfill, which throws under ESM.
        '@slack/web-api',
        /^@slack\/web-api\//,
      ],
    },
  },
});
