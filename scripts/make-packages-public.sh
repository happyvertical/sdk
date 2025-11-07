#!/usr/bin/env bash
set -e

echo "🔓 Making all @happyvertical packages public..."
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
  echo "📦 Updating @happyvertical/$pkg to public..."

  if gh api --method PATCH \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "/orgs/happyvertical/packages/npm/$pkg" \
    -f visibility=public > /dev/null 2>&1; then
    echo "   ✅ Success"
    ((success_count++))
  else
    echo "   ❌ Failed (may not exist or already public)"
    ((error_count++))
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Updated: $success_count packages"
echo "❌ Failed: $error_count packages"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
