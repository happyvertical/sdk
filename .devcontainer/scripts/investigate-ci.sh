#!/usr/bin/env bash
set -euo pipefail

echo "Investigating CI build and export readiness..."

echo "Validating workflow syntax with act..."
act pull_request -j test --validate

echo ""
echo "Running local build artifact checks..."
pnpm run build
pnpm run validate-build
pnpm run agent:check
pnpm run test-exports

echo ""
echo "Investigation complete."
echo "For full containerized workflow logs, run: pnpm run test:ci-debug"
