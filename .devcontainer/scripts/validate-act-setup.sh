#!/bin/bash
set -e

echo "🔍 Validating Act integration setup..."

# Check if act is installed
if command -v act >/dev/null 2>&1; then
    echo "✅ act is installed: $(which act)"
    echo "📋 act version: $(act --version)"
else
    echo "❌ act is not installed"
    exit 1
fi

# Check if Docker CLI is available
if command -v docker >/dev/null 2>&1; then
    echo "✅ Docker CLI is available: $(which docker)"
    echo "🐳 Docker version: $(docker --version)"
else
    echo "❌ Docker CLI is not available"
    exit 1
fi

# Check if Docker socket is accessible
if [ -S "/var/run/docker.sock" ]; then
    echo "✅ Docker socket is accessible"
    if docker ps >/dev/null 2>&1; then
        echo "✅ Docker daemon is reachable"
    else
        echo "⚠️  Docker socket exists but daemon is not reachable"
        echo "    This might be a permission issue"
    fi
else
    echo "❌ Docker socket not found at /var/run/docker.sock"
fi

# Check if configuration files exist
if [ -f ".actrc" ]; then
    echo "✅ .actrc configuration found"
    echo "📄 .actrc contents:"
    cat .actrc | sed 's/^/    /'
else
    echo "❌ .actrc configuration not found"
fi

if [ -f ".env.act" ]; then
    echo "✅ .env.act environment file found"
else
    echo "❌ .env.act environment file not found"
fi

# Check if GitHub Actions workflow exists
if [ -f ".github/workflows/test.yml" ]; then
    echo "✅ GitHub Actions workflow found"
else
    echo "❌ GitHub Actions workflow not found"
fi

echo ""
echo "🎯 Ready to test Act integration!"
echo "Try: bun run test:ci"