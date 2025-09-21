#!/bin/bash
set -e

echo "🧪 Testing Docker-in-Docker Setup for Act Integration"
echo "=================================================="

# Test 1: Basic Docker connectivity
echo ""
echo "📋 Test 1: Docker Daemon Connectivity"
echo "-------------------------------------"
if docker ps >/dev/null 2>&1; then
    echo "✅ Docker daemon is reachable"
    docker version --format 'Client: {{.Client.Version}}, Server: {{.Server.Version}}'
else
    echo "❌ Docker daemon not reachable"
    echo "Current DOCKER_HOST: ${DOCKER_HOST:-'not set'}"
    echo "Check if DinD service is running: docker-compose logs dind"
    exit 1
fi

# Test 2: Docker networks and services
echo ""
echo "📋 Test 2: Docker Networks and Services"
echo "---------------------------------------"
echo "Available networks:"
docker network ls | head -5

echo ""
echo "Running containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Test 3: Certificate setup
echo ""
echo "📋 Test 3: TLS Certificate Configuration"
echo "----------------------------------------"
if [ -d "/certs/client" ]; then
    echo "✅ Certificate directory exists"
    ls -la /certs/client/ | head -5
else
    echo "⚠️  Certificate directory not found"
    echo "This might affect TLS connectivity"
fi

# Test 4: Test a simple Docker operation
echo ""
echo "📋 Test 4: Docker Operations Test"
echo "---------------------------------"
if docker run --rm hello-world >/dev/null 2>&1; then
    echo "✅ Docker can run containers successfully"
else
    echo "❌ Docker container execution failed"
    echo "This might indicate network or permission issues"
fi

# Test 5: PostgreSQL service connectivity
echo ""
echo "📋 Test 5: PostgreSQL Service Connectivity"
echo "------------------------------------------"
if command -v pg_isready >/dev/null 2>&1; then
    if pg_isready -h db -p 5432 -d testdb >/dev/null 2>&1; then
        echo "✅ PostgreSQL service is accessible"
    else
        echo "❌ PostgreSQL service not accessible"
        echo "Check if db service is running"
    fi
else
    echo "⚠️  pg_isready not available, skipping PostgreSQL test"
fi

# Test 6: Act basic functionality
echo ""
echo "📋 Test 6: Act Configuration"
echo "----------------------------"
if command -v act >/dev/null 2>&1; then
    echo "✅ Act is installed: $(act --version)"

    echo ""
    echo "Act configuration:"
    echo "  .actrc: $([ -f .actrc ] && echo 'exists' || echo 'missing')"
    echo "  .env.act: $([ -f .env.act ] && echo 'exists' || echo 'missing')"

    # Test act dry run
    echo ""
    echo "Testing act dry-run..."
    if act pull_request --dryrun >/dev/null 2>&1; then
        echo "✅ Act dry-run successful"
    else
        echo "⚠️  Act dry-run failed (this might be expected)"
    fi
else
    echo "❌ Act not installed"
fi

echo ""
echo "🎯 DinD Setup Test Complete!"
echo "============================"
echo ""
echo "Next steps:"
echo "  1. If all tests pass, try: bun run test:ci"
echo "  2. If Docker tests fail, check: docker-compose logs dind"
echo "  3. For network issues, verify DinD service is in same network"
echo ""