#!/bin/bash
set -e

echo "🔧 Investigating CI build environment..."

# Function to run a specific step
run_step() {
    local step_name="$1"
    echo "🔍 Testing step: $step_name"
    act -j test --step "$step_name" --verbose || true
    echo ""
}

# Test individual steps
echo "Step 1: Testing dependency installation..."
run_step "Install dependencies"

echo "Step 2: Testing build process..."
run_step "Build packages"

echo "Step 3: Testing test execution..."
run_step "Run tests"

echo ""
echo "🐚 Opening interactive shell for manual investigation..."
echo "Use this to inspect build artifacts, check exports, and debug issues."
echo "Path structure: /home/runner/work/sdk/sdk/"
echo "Exit with 'exit' when done."
echo ""

# Interactive shell at build completion
act --shell -j test --step "Build packages"