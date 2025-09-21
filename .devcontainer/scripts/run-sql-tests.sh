#!/usr/bin/env bash
set -euo pipefail

# Run @have/sql tests for both SQLite and PostgreSQL
echo "🧪 Running @have/sql package tests..."

# Change to sql package directory
cd "$(dirname "$0")/../../packages/sql"

echo "📍 Current directory: $(pwd)"
echo "🔍 Available test files:"
ls -la src/*.spec.ts 2>/dev/null || echo "   No test files found"

# Check environment
echo ""
echo "🌍 Database environment:"
echo "   SQLOO_HOST=${SQLOO_HOST:-not set}"
echo "   SQLOO_USER=${SQLOO_USER:-not set}"
echo "   SQLOO_DATABASE=${SQLOO_DATABASE:-not set}"
echo "   SQLOO_PORT=${SQLOO_PORT:-not set}"

# Function to run tests with error handling
run_test() {
    local test_name=$1
    local test_file=$2

    echo ""
    echo "🏃 Running $test_name tests..."
    echo "   File: $test_file"

    if [[ ! -f "$test_file" ]]; then
        echo "   ❌ Test file not found: $test_file"
        return 1
    fi

    if bun test "$test_file" --reporter=verbose; then
        echo "   ✅ $test_name tests passed"
        return 0
    else
        echo "   ❌ $test_name tests failed"
        return 1
    fi
}

# Run SQLite tests (should always work)
if ! run_test "SQLite" "src/sqlite.spec.ts"; then
    echo "⚠️  SQLite tests failed - this indicates a serious issue"
fi

# Run PostgreSQL tests (requires database connection)
if ! run_test "PostgreSQL" "src/postgres.spec.ts"; then
    echo "⚠️  PostgreSQL tests failed - check database connection"
    echo "💡 Try running: .devcontainer/scripts/test-postgres-connection.sh"
fi

# Run all tests together
echo ""
echo "🏃 Running all SQL tests together..."
if bun test --reporter=verbose; then
    echo "✅ All @have/sql tests passed!"
else
    echo "❌ Some @have/sql tests failed"
    echo "💡 Check individual test results above"
fi

echo ""
echo "🏁 @have/sql test run complete!"
echo "💡 SQLite tests should always pass (in-memory database)"
echo "💡 PostgreSQL tests require the devcontainer database to be running"