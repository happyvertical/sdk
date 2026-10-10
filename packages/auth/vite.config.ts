import { createPackageConfig } from '../../vite.config.base.js';

export default createPackageConfig('auth', {
  'server/index': 'src/server/index.ts',
});
