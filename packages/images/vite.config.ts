import { createPackageConfig } from '../../vite.config.base.js';

export default createPackageConfig('images', {
  segmentation: 'src/segmentation.ts',
  'segmentation-assets': 'src/segmentation-assets.ts',
});
