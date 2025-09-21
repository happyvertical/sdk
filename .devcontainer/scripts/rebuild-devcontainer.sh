#!/bin/bash
set -e

echo "🔄 Rebuilding DevContainer..."

# Get the current directory for context
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEVCONTAINER_DIR="$PROJECT_ROOT/.devcontainer"

echo "📁 Project root: $PROJECT_ROOT"
echo "🐳 DevContainer config: $DEVCONTAINER_DIR"

# Check if we're running inside a devcontainer
if [ -n "$REMOTE_CONTAINERS" ] || [ -n "$CODESPACES" ] || [ "$TERM_PROGRAM" = "vscode" ]; then
    echo "🏗️  Running inside devcontainer/codespace"
    echo ""
    echo "⚠️  To rebuild the devcontainer from inside:"
    echo "   1. Open Command Palette (Ctrl/Cmd + Shift + P)"
    echo "   2. Run: 'Dev Containers: Rebuild Container'"
    echo "   3. Or run: 'Dev Containers: Rebuild Container Without Cache'"
    echo ""
    echo "🔧 Alternative: Run this script from your host machine"
    exit 0
fi

# Function to check if docker-compose service is running
check_service_running() {
    local service_name="$1"
    if docker compose -f "$DEVCONTAINER_DIR/docker-compose.yml" ps "$service_name" 2>/dev/null | grep -q "Up"; then
        return 0
    else
        return 1
    fi
}

# Function to stop services gracefully
stop_services() {
    echo "🛑 Stopping existing DevContainer services..."

    cd "$DEVCONTAINER_DIR"

    if docker compose ps 2>/dev/null | grep -q "Up"; then
        echo "   Stopping running services..."
        docker compose down || true
    else
        echo "   No running services found"
    fi

    # Clean up any orphaned containers
    echo "🧹 Cleaning up orphaned containers..."
    docker compose down --remove-orphans || true

    cd "$PROJECT_ROOT"
}

# Function to build and start services
build_and_start() {
    echo "🔨 Building DevContainer..."

    cd "$DEVCONTAINER_DIR"

    # Build with no cache to ensure fresh build
    echo "   Building images (no cache)..."
    docker compose build --no-cache

    # Start services
    echo "🚀 Starting DevContainer services..."
    docker compose up -d

    # Wait for services to be healthy
    echo "⏳ Waiting for services to be ready..."

    # Wait for PostgreSQL to be healthy
    echo "   Waiting for PostgreSQL..."
    timeout=60
    elapsed=0
    while ! check_service_running "db" && [ $elapsed -lt $timeout ]; do
        sleep 2
        elapsed=$((elapsed + 2))
        echo "     ... waiting (${elapsed}s/${timeout}s)"
    done

    if check_service_running "db"; then
        echo "   ✅ PostgreSQL is ready"
    else
        echo "   ⚠️  PostgreSQL may not be fully ready"
    fi

    # Wait for main app container
    echo "   Waiting for app container..."
    timeout=30
    elapsed=0
    while ! check_service_running "app" && [ $elapsed -lt $timeout ]; do
        sleep 2
        elapsed=$((elapsed + 2))
        echo "     ... waiting (${elapsed}s/${timeout}s)"
    done

    if check_service_running "app"; then
        echo "   ✅ App container is ready"
    else
        echo "   ⚠️  App container may not be fully ready"
    fi

    cd "$PROJECT_ROOT"
}

# Function to validate the rebuild
validate_rebuild() {
    echo "🔍 Validating rebuild..."

    # Check if containers are running
    cd "$DEVCONTAINER_DIR"
    if docker compose ps | grep -q "Up"; then
        echo "   ✅ Containers are running"
    else
        echo "   ❌ Containers are not running"
        return 1
    fi

    # Test act installation
    echo "   Testing act installation..."
    if docker compose exec -T app which act >/dev/null 2>&1; then
        echo "   ✅ act is installed"
        act_version=$(docker compose exec -T app act --version 2>/dev/null || echo "unknown")
        echo "      Version: $act_version"
    else
        echo "   ❌ act is not installed"
    fi

    # Test Docker CLI
    echo "   Testing Docker CLI..."
    if docker compose exec -T app which docker >/dev/null 2>&1; then
        echo "   ✅ Docker CLI is available"
        docker_version=$(docker compose exec -T app docker --version 2>/dev/null || echo "unknown")
        echo "      Version: $docker_version"
    else
        echo "   ❌ Docker CLI is not available"
    fi

    # Test PostgreSQL connection
    echo "   Testing PostgreSQL connection..."
    if docker compose exec -T app bash -c 'PGPASSWORD=postgres psql -h db -U postgres -d testdb -c "SELECT 1;" >/dev/null 2>&1'; then
        echo "   ✅ PostgreSQL connection works"
    else
        echo "   ⚠️  PostgreSQL connection failed (may need more time)"
    fi

    cd "$PROJECT_ROOT"
}

# Main execution
echo "🎯 Starting DevContainer rebuild process..."
echo ""

# Stop existing services
stop_services
echo ""

# Build and start
build_and_start
echo ""

# Validate
validate_rebuild
echo ""

echo "✅ DevContainer rebuild complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Open VS Code and connect to the devcontainer"
echo "   2. Run: bun run validate-act-setup"
echo "   3. Test: bun run test:ci"
echo ""
echo "🔧 If running from VS Code:"
echo "   - Command Palette → 'Dev Containers: Reopen in Container'"