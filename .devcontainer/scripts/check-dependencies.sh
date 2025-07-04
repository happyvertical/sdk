#!/usr/bin/env bash

# HAVE SDK Development Environment Dependency Check
# Verifies all required system dependencies for OCR functionality

set -e

echo "🔍 Checking HAVE SDK system dependencies..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall status
MISSING_DEPS=0

check_command() {
    local cmd=$1
    local name=$2
    local install_hint=$3
    
    if command -v "$cmd" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name is installed"
        return 0
    else
        echo -e "${RED}✗${NC} $name is missing"
        if [ -n "$install_hint" ]; then
            echo -e "  ${YELLOW}Install with:${NC} $install_hint"
        fi
        MISSING_DEPS=$((MISSING_DEPS + 1))
        return 1
    fi
}

check_library() {
    local lib=$1
    local name=$2
    local install_hint=$3
    
    if ldconfig -p | grep -q "$lib" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $name is available"
        return 0
    else
        echo -e "${RED}✗${NC} $name is missing"
        if [ -n "$install_hint" ]; then
            echo -e "  ${YELLOW}Install with:${NC} $install_hint"
        fi
        MISSING_DEPS=$((MISSING_DEPS + 1))
        return 1
    fi
}

check_node_package() {
    local package=$1
    local name=$2
    
    if [ -d "node_modules/$package" ] || bun pm ls | grep -q "$package" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $name is installed"
        return 0
    else
        echo -e "${RED}✗${NC} $name is missing"
        echo -e "  ${YELLOW}Install with:${NC} bun add $package"
        MISSING_DEPS=$((MISSING_DEPS + 1))
        return 1
    fi
}

echo ""
echo "📦 Checking runtime dependencies..."

# Check Node.js and Bun
check_command "node" "Node.js" "https://nodejs.org/"
check_command "bun" "Bun" "curl -fsSL https://bun.sh/install | bash"

echo ""
echo "🏗️  Checking build tools..."

# Check build tools
check_command "gcc" "GCC compiler" "apt-get install gcc (Ubuntu) / nix-shell -p gcc (NixOS)"
check_command "g++" "G++ compiler" "apt-get install g++ (Ubuntu) / nix-shell -p gcc (NixOS)"

echo ""
echo "📚 Checking system libraries..."

# Check C++ standard library
check_library "libstdc++.so.6" "libstdc++ (C++ Standard Library)" "apt-get install libstdc++6 (Ubuntu) / nix-shell -p stdenv.cc.cc.lib (NixOS)"

# Check ONNX Runtime library
check_library "libonnxruntime.so" "ONNX Runtime (ML inference)" "apt-get install onnxruntime (Ubuntu) / nix-shell -p onnxruntime (NixOS)"

# Check if we're in a development environment
if [ -f "package.json" ]; then
    echo ""
    echo "📦 Checking Node.js dependencies..."
    
    # Check OCR dependencies
    check_node_package "@gutenye/ocr-node" "OCR Node package"
    check_node_package "unpdf" "PDF processing library"
fi

echo ""
echo "🧪 Testing OCR functionality..."

# Test basic OCR availability
if [ -f "node_modules/@gutenye/ocr-node/package.json" ]; then
    # Try to load the module to see if dependencies are satisfied
    if timeout 10s node -e "
        import('@gutenye/ocr-node')
        .then(() => console.log('✓ OCR module loads successfully'))
        .catch(err => {
            console.log('✗ OCR module failed to load:', err.message);
            process.exit(1);
        });
    " 2>/dev/null; then
        echo -e "${GREEN}✓${NC} OCR functionality is working"
    else
        echo -e "${RED}✗${NC} OCR functionality failed - likely missing system dependencies"
        MISSING_DEPS=$((MISSING_DEPS + 1))
    fi
else
    echo -e "${YELLOW}⚠${NC} OCR package not installed - run 'bun install' first"
fi

echo ""
echo "📋 Summary"
echo "=========="

if [ $MISSING_DEPS -eq 0 ]; then
    echo -e "${GREEN}🎉 All dependencies are satisfied!${NC}"
    echo "The HAVE SDK development environment is ready for OCR functionality."
    exit 0
else
    echo -e "${RED}❌ $MISSING_DEPS dependencies are missing${NC}"
    echo ""
    echo "System-specific installation commands:"
    echo ""
    echo "🐧 Ubuntu/Debian:"
    echo "  sudo apt-get update"
    echo "  sudo apt-get install libstdc++6 libc6-dev build-essential gcc g++"
    echo ""
    echo "❄️  NixOS:"
    echo "  nix-shell -p onnxruntime stdenv.cc.cc.lib gcc"
    echo "  # Or add to configuration.nix:"
    echo "  # environment.systemPackages = with pkgs; [ onnxruntime stdenv.cc.cc.lib gcc ];"
    echo ""
    echo "🍎 macOS:"
    echo "  # Should work out of the box with Xcode Command Line Tools"
    echo "  xcode-select --install"
    echo ""
    exit 1
fi