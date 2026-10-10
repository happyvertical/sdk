import { createPackageConfig } from '../../vite.config.base.js';

export default createPackageConfig('sql', {
  'backup/index': 'src/backup/index.ts',
  query: 'src/query.ts',
  pglite: 'src/pglite.ts',
});
