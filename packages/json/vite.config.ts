import { createPackageConfig } from '../../vite.config.base.js';

export default createPackageConfig('json', {
  'adapters/index': 'src/adapters/index.ts',
});
