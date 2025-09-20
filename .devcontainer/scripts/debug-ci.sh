#!/bin/bash
set -e

echo "🔍 Debugging CI environment with act..."

# Clean previous runs
act --rm 2>/dev/null || true

# Create artifacts directory
mkdir -p ./ci-artifacts

# Run CI with debugging
echo "📋 Running full CI workflow with verbose output..."
act pull_request \
  --verbose \
  --env-file .env.act \
  --artifact-server-path ./ci-artifacts \
  --platform ubuntu-latest=catthehacker/ubuntu:act-latest \
  2>&1 | tee ci-debug-$(date +%Y%m%d-%H%M%S).log

echo "✅ CI debug complete. Check log file for details."
echo "📂 Artifacts saved in ./ci-artifacts/"