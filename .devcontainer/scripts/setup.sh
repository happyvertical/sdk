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

echo "✅ Checking OCR dependencies..."
# Check for required C++ libraries for OCR functionality
if [ -f "/usr/lib/x86_64-linux-gnu/libstdc++.so.6" ]; then
    echo "   libstdc++6 found"
else
    echo "   ⚠️ libstdc++6 not found - OCR functionality may not work"
fi

# The OCR functionality requires ONNX Runtime and specific system libraries
# These are typically available in the devcontainer but may need explicit installation
echo "   📋 OCR requirements:"
echo "      - C++ Standard Library (libstdc++6)"
echo "      - ONNX Runtime (bundled with @gutenye/ocr-node)"
echo "      - Build tools for native modules"

echo "✅ Checking Git LFS..."
if command -v git-lfs &> /dev/null; then
    echo "   Git LFS found: $(git-lfs --version)"
    git lfs install
else
    echo "   ⚠️ Git LFS not found"
fi

# Install Claude Code CLI
echo "📦 Installing Claude Code CLI..."
if ! command -v claude &> /dev/null; then
    npm install -g @anthropic-ai/claude-code
    echo "   Claude Code CLI installed"
else
    echo "   Claude Code CLI already installed: $(claude --version)"
fi

# Install Gemini CLI
echo "📦 Installing Gemini CLI..."
if ! command -v gemini &> /dev/null; then
    npm install -g @google/gemini-cli
    echo "   Gemini CLI installed"
else
    echo "   Gemini CLI already installed"
fi

# Install OpenCode CLI
echo "📦 Installing OpenCode CLI..."
if ! command -v opencode &> /dev/null; then
    curl -fsSL https://raw.githubusercontent.com/opencode-ai/opencode/refs/heads/main/install | bash
    # Reload shell environment to pick up OpenCode PATH
    source ~/.bashrc
    echo "   OpenCode CLI installed"
else
    echo "   OpenCode CLI already installed: $(opencode --version)"
fi

echo "✅ Development environment ready!"
echo "📋 Available tools:"
echo "   - claude --version: $(claude --version 2>/dev/null || echo 'Not available')"
echo "   - gemini --version: $(gemini --version 2>/dev/null || echo 'Not available')"  
echo "   - opencode --version: $(opencode --version 2>/dev/null || echo 'Not available')"