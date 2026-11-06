import { createPackageConfig } from '../../vite.config.base.js';

export default createPackageConfig('encryption', {
  'vault-snapshot': 'src/vault-snapshot.ts',
});
