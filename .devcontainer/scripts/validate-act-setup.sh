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

# Check Docker connectivity (DinD or socket)
if docker ps >/dev/null 2>&1; then
    echo "✅ Docker daemon is reachable"
    echo "🐳 Docker info:"
    docker version --format '    Client: {{.Client.Version}}'
    docker version --format '    Server: {{.Server.Version}}'
    if [ -n "$DOCKER_HOST" ]; then
        echo "📡 Using Docker host: $DOCKER_HOST"
    fi
else
    echo "❌ Docker daemon is not reachable"
    if [ -n "$DOCKER_HOST" ]; then
        echo "    Configured Docker host: $DOCKER_HOST"
        echo "    Check if DinD service is running"
    else
        echo "    No DOCKER_HOST configured"
    fi
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
echo "Try: pnpm run test:ci"
echo ""
echo "🔧 DinD Troubleshooting:"
echo "  - If Docker fails, check: docker-compose logs dind"
echo "  - Verify certificates: ls -la /certs/client/"
echo "  - Test connectivity: docker --host tcp://dind:2376 --tls ps"
