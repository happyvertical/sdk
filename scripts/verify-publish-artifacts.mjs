#!/usr/bin/env node

import { verifyPublishArtifacts } from './publish-artifacts-lib.mjs';

try {
  const result = verifyPublishArtifacts(process.argv[2]);
  console.log(`Verified ${result.packages.length} package artifacts for ${result.releaseVersion}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
