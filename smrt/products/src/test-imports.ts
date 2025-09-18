/**
 * Test selective imports to avoid problematic dependencies
 */

import { smrtPlugin } from '@have/smrt/vite-plugin';
import { ASTScanner } from '@have/smrt/scanner';

console.log('✅ Workspace dependency resolution works!');
console.log('ASTScanner:', typeof ASTScanner);
console.log('smrtPlugin:', typeof smrtPlugin);