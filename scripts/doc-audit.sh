#!/usr/bin/env bash
set -euo pipefail

# List packages to audit (exclude stubs/experimental)
PACKAGES=(
  packages/utils
  packages/logger
  packages/files
  packages/sql
  packages/ai
  packages/cache
  packages/geo
  packages/translator
  packages/ocr
  packages/pdf
  packages/spider
  packages/documents
  packages/sdk-mcp
  packages/github-actions
)

for pkg in "${PACKAGES[@]}"; do
  echo "=== Auditing $pkg ==="
  claude -p "/doc-audit $pkg" --allowedTools "Bash,Read,Write,Edit" 2>&1 | tee "doc-audit-$(basename $pkg).log"
  echo "=== Done: $pkg ==="
done

echo "All packages audited. Review commits with: git log --oneline -${#PACKAGES[@]}"
