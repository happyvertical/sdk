import { createPackageConfig } from '../../vite.config.base';

export default createPackageConfig('json', {
  'adapters/index': 'src/adapters/index.ts',
});
