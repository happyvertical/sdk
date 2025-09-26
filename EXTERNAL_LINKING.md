# External Project Linking Guide

## Problem Resolution Summary

✅ **FIXED**: Package resolution issues have been resolved by:

1. **Fixed build output structure** - Packages now build to `packages/*/dist/index.js` (matching package.json exports)
2. **Restored per-package builds** - Each package has its own dist directory as expected by pnpm workspace
3. **Cleaned up bun artifacts** - Removed any leftover bun link connections

## For External Projects (like praeco)

### Method 1: pnpm link (Recommended)

From the SDK directory:
```bash
# Build all packages first
pnpm run build

# Link the packages you need
cd packages/ai && pnpm link --global
cd ../files && pnpm link --global
cd ../smrt && pnpm link --global
cd ../utils && pnpm link --global
```

From your external project directory:
```bash
# Link to the global packages
pnpm link --global @have/ai @have/files @have/smrt @have/utils

# Install dependencies
pnpm install
```

### Method 2: File Protocol Dependencies

In your external project's `package.json`:
```json
{
  "dependencies": {
    "@have/ai": "file:../sdk/packages/ai",
    "@have/files": "file:../sdk/packages/files",
    "@have/smrt": "file:../sdk/packages/smrt",
    "@have/utils": "file:../sdk/packages/utils"
  }
}
```

Then run:
```bash
pnpm install
```

### Method 3: Local npm Registry (For CI/Testing)

Publish to local registry:
```bash
# From SDK directory
npm run build
npx verdaccio &  # Start local registry
npm publish --registry http://localhost:4873 packages/utils/
npm publish --registry http://localhost:4873 packages/ai/
# ... repeat for other packages
```

## Verification

Test that imports work in your external project:
```typescript
import { getAI } from '@have/ai';
import { getFilesystem } from '@have/files';
import { SmrtObject } from '@have/smrt';

// Should not throw "Failed to resolve entry" errors
const ai = await getAI({ apiKey: 'test' });
const fs = await getFilesystem({ type: 'local' });
```

## Important Notes

- **TypeScript declarations**: Currently building without .d.ts files due to vite-plugin-dts configuration issue
- **Cross-package dependencies**: Now properly resolved within built packages
- **Workspace dependencies**: `workspace:*` works within SDK but gets resolved to actual files when linked externally

## Troubleshooting

If you still get "Failed to resolve entry" errors:

1. **Verify build files exist**:
   ```bash
   ls -la packages/ai/dist/index.js
   ls -la packages/files/dist/index.js
   ls -la packages/smrt/dist/index.js
   ```

2. **Check package.json exports match dist files**:
   ```bash
   cat packages/ai/package.json | grep -A 5 '"exports"'
   ```

3. **Clear node_modules and reinstall**:
   ```bash
   rm -rf node_modules package-lock.json
   pnpm install
   ```

4. **Re-run build if needed**:
   ```bash
   pnpm run clean && pnpm run build
   ```

The core issue has been resolved - packages now build to the correct location with proper exports structure.