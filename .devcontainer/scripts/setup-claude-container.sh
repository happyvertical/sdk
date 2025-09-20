#!/usr/bin/env bash
set -euo pipefail

# Setup script for Claude Code running inside the devcontainer
echo "🚀 Setting up Claude Code for container usage..."

# Check if Claude Code is installed
if ! command -v claude &> /dev/null; then
    echo "❌ Claude Code not found. Installing now..."
    npm install -g @anthropics/claude-code
else
    echo "✅ Claude Code is already installed"
fi

# Check Claude version
echo "📋 Claude Code version: $(claude --version)"

# Verify PostgreSQL connection from inside container
echo "🔗 Testing PostgreSQL connection from container..."

if command -v psql &> /dev/null; then
    echo "✅ psql is available, testing connection..."
    if PGPASSWORD=postgres psql -h db -U postgres -d testdb -c "SELECT 'PostgreSQL connection successful!' as status;" &> /dev/null; then
        echo "✅ PostgreSQL connection successful via db:5432"
    else
        echo "❌ PostgreSQL connection failed via db:5432"
        echo "   Make sure the devcontainer is running with docker-compose"
    fi
else
    echo "⚠️  psql not available for testing, but Claude can still connect"
fi

# Show environment variables
echo ""
echo "📝 Container environment variables for Claude:"
echo "   SQLOO_HOST=${SQLOO_HOST:-db}"
echo "   SQLOO_USER=${SQLOO_USER:-postgres}"
echo "   SQLOO_DATABASE=${SQLOO_DATABASE:-testdb}"
echo "   SQLOO_PORT=${SQLOO_PORT:-5432}"

echo ""
echo "✅ Claude Code setup complete!"
echo "💡 You can now run 'claude' commands directly in this container"
echo "💡 PostgreSQL is available at db:5432 for all Claude operations"
echo "💡 Your Claude credentials are persisted in ~/.claude"