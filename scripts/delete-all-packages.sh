#!/usr/bin/env bash
set -e

echo "⚠️  WARNING: This will DELETE all @happyvertical packages from GitHub Packages!"
echo ""
echo "This includes ALL versions of:"
echo "  - @happyvertical/ai"
echo "  - @happyvertical/cache"
echo "  - @happyvertical/documents"
echo "  - @happyvertical/files"
echo "  - @happyvertical/geo"
echo "  - @happyvertical/github-actions"
echo "  - @happyvertical/logger"
echo "  - @happyvertical/ocr"
echo "  - @happyvertical/pdf"
echo "  - @happyvertical/sdk-mcp"
echo "  - @happyvertical/spider"
echo "  - @happyvertical/sql"
echo "  - @happyvertical/translator"
echo "  - @happyvertical/utils"
echo "  - @happyvertical/weather"
echo ""
read -p "Are you sure? Type 'DELETE' to confirm: " confirmation

if [ "$confirmation" != "DELETE" ]; then
  echo "❌ Cancelled"
  exit 1
fi

echo ""
echo "🗑️  Deleting all packages..."
echo ""

# List of packages
packages=(
  "ai"
  "cache"
  "documents"
  "files"
  "geo"
  "github-actions"
  "logger"
  "ocr"
  "pdf"
  "sdk-mcp"
  "spider"
  "sql"
  "translator"
  "utils"
  "weather"
)

success_count=0
error_count=0

for pkg in "${packages[@]}"; do
  echo "🗑️  Deleting @happyvertical/$pkg..."

  if gh api --method DELETE \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "/orgs/happyvertical/packages/npm/$pkg" > /dev/null 2>&1; then
    echo "   ✅ Deleted"
    ((success_count++))
  else
    echo "   ❌ Failed (may not exist or insufficient permissions)"
    ((error_count++))
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deleted: $success_count packages"
echo "❌ Failed: $error_count packages"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Note: The next publish will recreate these packages as public."
