#!/bin/bash

# Development environment setup script
# This script runs during devcontainer creation

echo "🚀 Setting up HAVE SDK development environment..."

# Verify system dependencies
echo "✅ Checking Ghostscript installation..."
if command -v gs &> /dev/null; then
    echo "   Ghostscript found: $(gs --version)"
else
    echo "   ⚠️ Ghostscript not found - PDF ink coverage may not work"
fi

echo "✅ Checking Git LFS..."
if command -v git-lfs &> /dev/null; then
    echo "   Git LFS found: $(git-lfs --version)"
    git lfs install
else
    echo "   ⚠️ Git LFS not found"
fi

echo "✅ Development environment ready!"