#!/usr/bin/env bash
set -euo pipefail

# Setup script for Claude Code running on host, connecting to devcontainer services
echo "🏠 Setting up Claude Code for host usage with devcontainer services..."

# Check if devcontainer is running
echo "🔍 Checking if devcontainer PostgreSQL is accessible..."

if command -v psql &> /dev/null; then
    if PGPASSWORD=postgres psql -h localhost -p 65432 -U postgres -d testdb -c "SELECT 'PostgreSQL connection successful!' as status;" &> /dev/null 2>&1; then
        echo "✅ PostgreSQL connection successful via localhost:65432"
    else
        echo "❌ PostgreSQL connection failed via localhost:65432"
        echo "   Make sure the devcontainer is running:"
        echo "   1. Open VS Code in this project"
        echo "   2. Select 'Reopen in Container' when prompted"
        echo "   3. Wait for container to fully start"
        exit 1
    fi
else
    echo "⚠️  psql not available for testing, but Claude can still connect"
    echo "   Install PostgreSQL client for testing: brew install postgresql"
fi

# Create environment setup script
ENV_FILE="$HOME/.claude-env-host"
cat > "$ENV_FILE" << 'EOF'
# Environment variables for Claude Code host usage with devcontainer PostgreSQL
export SQLOO_HOST=localhost
export SQLOO_USER=postgres
export SQLOO_PASSWORD=postgres
export SQLOO_DATABASE=testdb
export SQLOO_PORT=65432
EOF

echo "📝 Created environment file: $ENV_FILE"

# Show how to load environment
echo ""
echo "🔧 To use Claude Code with devcontainer PostgreSQL, run:"
echo "   source $ENV_FILE"
echo "   claude"
echo ""
echo "📝 Or add this to your shell profile (~/.bashrc, ~/.zshrc):"
echo "   source $ENV_FILE"

# Show environment variables
echo ""
echo "📝 Host environment variables for Claude:"
echo "   SQLOO_HOST=localhost"
echo "   SQLOO_USER=postgres"
echo "   SQLOO_DATABASE=testdb"
echo "   SQLOO_PORT=65432"

echo ""
echo "✅ Claude Code host setup complete!"
echo "💡 Start the devcontainer first, then source the environment file"
echo "💡 PostgreSQL will be available at localhost:65432"
echo "💡 Run 'source $ENV_FILE && claude' to start Claude with proper database access"