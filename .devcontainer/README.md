# HAVE SDK Development Container

This directory contains the development container configuration for the HAVE SDK, ensuring a consistent development environment across all platforms with all necessary system dependencies for OCR functionality.

## Features

- **Node.js 22** with TypeScript support
- **Bun** package manager pre-installed
- **Claude Code** AI assistant pre-installed and configured
- **PostgreSQL 16** database for testing and development
- **ONNX Runtime** system dependencies for OCR functionality
- **Build tools** (GCC, G++, CMake) for native dependencies
- **Git LFS** for handling large files
- **GitHub CLI** for repository management
- **VS Code extensions** optimized for TypeScript development

## System Dependencies Included

### OCR and Machine Learning
- `libstdc++6` - C++ Standard Library
- `libgomp1` - OpenMP runtime
- `libprotobuf-dev` - Protocol Buffers

### Build Tools
- `build-essential` - Essential compilation tools
- `gcc` & `g++` - GNU C/C++ compilers
- `cmake` - Cross-platform build system

### Development Tools
- `git-lfs` - Git Large File Storage
- `gh` - GitHub CLI

## Quick Start

### Using VS Code Dev Containers

1. **Install prerequisites:**
   - [Docker](https://docs.docker.com/get-docker/)
   - [VS Code](https://code.visualstudio.com/)
   - [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

2. **Open in container:**
   ```bash
   # Clone the repository
   git clone https://github.com/happyvertical/sdk-ts.git
   cd sdk-ts
   
   # Open in VS Code
   code .
   
   # VS Code will prompt to "Reopen in Container" - click it
   # Or use Command Palette: "Dev Containers: Reopen in Container"
   ```

3. **Verify setup:**
   ```bash
   # Inside the container terminal
   ./.devcontainer/scripts/check-dependencies.sh
   ```

### Manual Docker Setup

```bash
# Build the development container
cd .devcontainer
docker-compose up -d

# Access the container
docker-compose exec app bash

# Verify dependencies
./scripts/check-dependencies.sh
```

## Dependency Verification

The included dependency check script verifies all required components:

```bash
# Run the comprehensive dependency check
./.devcontainer/scripts/check-dependencies.sh
```

This script checks:
- ✅ Runtime environments (Node.js, Bun)
- ✅ Build tools (GCC, G++, CMake)
- ✅ System libraries (libstdc++, ONNX Runtime dependencies)
- ✅ Node.js packages (@gutenye/ocr-node, unpdf)
- ✅ OCR functionality test

## VS Code Integration

The devcontainer includes optimized VS Code settings and extensions:

### Extensions
- **TypeScript** support with latest language server
- **Biome** for formatting and linting
- **Vitest** for test integration
- **GitHub Copilot** for AI-assisted development
- **Tailwind CSS** intellisense

### Settings
- Auto-format on save with Biome
- TypeScript import optimization
- Proper file exclusions for performance
- Test explorer integration

## Platform Support

### Local Development Alternatives

If you prefer not to use containers:

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install libstdc++6 libc6-dev build-essential gcc g++ git-lfs
curl -fsSL https://bun.sh/install | bash
```

#### NixOS
```bash
nix-shell -p onnxruntime stdenv.cc.cc.lib gcc git-lfs
curl -fsSL https://bun.sh/install | bash
```

#### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install Git LFS
brew install git-lfs
```

## Troubleshooting

### Common Issues

**OCR functionality fails:**
- Verify system dependencies with the check script
- Ensure `libstdc++.so.6` is available
- Check that ONNX Runtime can load native binaries

**Container build fails:**
- Ensure Docker has sufficient disk space
- Try rebuilding without cache: `docker-compose build --no-cache`

**VS Code doesn't detect TypeScript properly:**
- Reload the window: `Ctrl+Shift+P` → "Developer: Reload Window"
- Check that the TypeScript extension is enabled

### Getting Help

1. Run the dependency check script for diagnostic information
2. Check the container logs: `docker-compose logs app`
3. Open an issue with the output of the dependency check script

## Architecture

The devcontainer uses a multi-stage approach:

1. **Base Image**: Microsoft's TypeScript Node.js devcontainer
2. **System Dependencies**: ONNX Runtime and build tools
3. **Runtime Setup**: Bun installation and configuration
4. **Development Tools**: VS Code extensions and settings
5. **Project Dependencies**: Automated npm/bun package installation

This ensures a reproducible environment that matches production requirements while providing excellent developer experience.

## Claude Code Integration

The devcontainer includes Claude Code AI assistant pre-installed and configured for seamless development. Claude has full access to the containerized environment, including PostgreSQL database for testing the @have/sql package.

### Two Usage Patterns

#### Option 1: Claude Code Inside Container (Recommended)

**Benefits:**
- Zero setup - Claude ready immediately upon container start
- Complete isolation and security
- Direct database access via container networking
- Consistent team environment

**Usage:**
```bash
# Open in VS Code and select "Reopen in Container"
# Once container starts, Claude is ready:
claude

# Claude automatically has access to:
# - PostgreSQL at db:5432
# - All HAVE SDK packages and dependencies
# - Complete development environment
```

**Environment Variables (Automatic):**
```bash
SQLOO_HOST=db
SQLOO_USER=postgres
SQLOO_PASSWORD=postgres
SQLOO_DATABASE=testdb
SQLOO_PORT=5432
```

#### Option 2: Claude Code on Host + Container Services

**Benefits:**
- Use existing Claude installation
- Lighter container resource usage
- Familiar host environment

**Setup:**
```bash
# 1. Start devcontainer in VS Code (for PostgreSQL service)
# 2. Configure host environment:
./.devcontainer/scripts/setup-claude-host.sh

# 3. Load environment and start Claude:
source ~/.claude-env-host
claude
```

**Environment Variables (Host):**
```bash
SQLOO_HOST=localhost
SQLOO_USER=postgres
SQLOO_PASSWORD=postgres
SQLOO_DATABASE=testdb
SQLOO_PORT=65432  # External port mapping
```

### Database Testing with Claude

The PostgreSQL database is automatically configured for testing the @have/sql package:

```bash
# Test database connections
./.devcontainer/scripts/test-postgres-connection.sh

# Run @have/sql tests
./.devcontainer/scripts/run-sql-tests.sh

# Claude can now help with database operations:
claude "Test the PostgreSQL implementation in @have/sql"
claude "Run the database migration tests"
```

### Setup Scripts

- **`scripts/setup-claude-container.sh`** - Configure Claude inside container
- **`scripts/setup-claude-host.sh`** - Configure host environment for external Claude
- **`scripts/test-postgres-connection.sh`** - Test database connectivity
- **`scripts/run-sql-tests.sh`** - Run @have/sql package tests

### Claude Credentials

Your Claude credentials are automatically mounted and persisted:
- **Container path:** `/home/node/.claude`
- **Host path:** `~/.claude`
- **Persistence:** Survives container rebuilds

### Security Features

- Claude's access is scoped to the container environment
- Database credentials are contained within the development environment
- No production systems accessible from the container
- All network access is controlled and logged