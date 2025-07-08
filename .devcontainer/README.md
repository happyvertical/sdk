# HAVE SDK Development Container

This directory contains the development container configuration for the HAVE SDK, ensuring a consistent development environment across all platforms with all necessary system dependencies for OCR functionality.

## Features

- **Node.js 22** with TypeScript support
- **Bun** package manager pre-installed
- **ONNX Runtime** system dependencies for OCR functionality
- **Ghostscript** for professional PDF ink coverage calculation
- **Build tools** (GCC, G++, CMake) for native dependencies
- **Git LFS** for handling large files
- **GitHub CLI** for repository management
- **VS Code extensions** optimized for TypeScript development
- **GitHub Codespaces** ready

## System Dependencies Included

### OCR and Machine Learning
- `libstdc++6` - C++ Standard Library
- `libgomp1` - OpenMP runtime
- `libprotobuf-dev` - Protocol Buffers

### Build Tools
- `build-essential` - Essential compilation tools
- `gcc` & `g++` - GNU C/C++ compilers
- `cmake` - Cross-platform build system

### PDF Processing
- `ghostscript` - Professional PDF processing and ink coverage calculation

### Development Tools
- `git-lfs` - Git Large File Storage
- `gh` - GitHub CLI (via devcontainer feature)

## Quick Start

### GitHub Codespaces (Recommended)

1. **Create a Codespace:**
   - Navigate to the repository on GitHub
   - Click the green "Code" button
   - Select "Codespaces" tab
   - Click "Create codespace on main"
   - Wait 2-3 minutes for the environment to build

2. **Start developing:**
   ```bash
   # All dependencies are pre-installed!
   bun test  # Run tests
   bun run build  # Build packages
   ```

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