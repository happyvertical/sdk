#!/usr/bin/env bash
set -euo pipefail

# Test PostgreSQL connections for both container and host usage patterns
echo "🧪 Testing PostgreSQL connections..."

# Function to test connection
test_connection() {
    local host=$1
    local port=$2
    local description=$3

    echo ""
    echo "🔗 Testing $description..."
    echo "   Host: $host, Port: $port"

    if command -v psql &> /dev/null; then
        if PGPASSWORD=postgres psql -h "$host" -p "$port" -U postgres -d testdb -c "SELECT 'Connection successful from $description' as status;" 2>/dev/null; then
            echo "   ✅ Connection successful"
            return 0
        else
            echo "   ❌ Connection failed"
            return 1
        fi
    else
        echo "   ⚠️  psql not available for testing"
        return 2
    fi
}

# Test container connection (if inside container)
if [[ "${SQLOO_HOST:-}" == "db" ]]; then
    echo "🐳 Running inside container environment"
    test_connection "db" "5432" "container internal connection"
else
    echo "🏠 Running in host environment"
fi

# Test host connection
echo ""
test_connection "localhost" "65432" "host external connection"

# Test with bun (which is used for @have/sql tests)
echo ""
echo "🧪 Testing with Bun (used by @have/sql package)..."

if command -v bun &> /dev/null; then
    cd "$(dirname "$0")/../../packages/sql"

    echo "   Testing SQLite..."
    if bun test src/sqlite.spec.ts --reporter=minimal 2>/dev/null; then
        echo "   ✅ SQLite tests passed"
    else
        echo "   ❌ SQLite tests failed"
    fi

    echo "   Testing PostgreSQL..."
    if bun test src/postgres.spec.ts --reporter=minimal 2>/dev/null; then
        echo "   ✅ PostgreSQL tests passed"
    else
        echo "   ❌ PostgreSQL tests failed (check connection and environment)"
    fi
else
    echo "   ⚠️  Bun not available for testing"
fi

echo ""
echo "🏁 Connection testing complete!"
echo "💡 If any connections failed, check that the devcontainer is running"
echo "💡 PostgreSQL should be accessible at both db:5432 (container) and localhost:65432 (host)"