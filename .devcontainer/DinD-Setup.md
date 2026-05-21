# Docker-in-Docker (DinD) Setup for Act Testing

## Overview

This devcontainer now includes Docker-in-Docker support to enable proper testing of GitHub Actions workflows using `act`. This setup allows you to test the pnpm-based CI workflows with full service dependencies including PostgreSQL.

## What Changed

### 1. Docker Compose Services
- **Added DinD service**: Runs Docker daemon inside container
- **Updated app service**: Connects to DinD instead of host Docker socket
- **Maintained PostgreSQL**: Existing database service remains unchanged

### 2. Networking Configuration
- **DinD host**: `tcp://dind:2376` (TLS-enabled)
- **Network**: All services run in shared `devcontainer_default` network
- **Certificates**: TLS certificates managed automatically

### 3. Environment Variables
```bash
DOCKER_HOST=tcp://dind:2376
DOCKER_TLS_VERIFY=1
DOCKER_CERT_PATH=/certs/client
```

## How to Use

### 1. Rebuild Container (Required)
After these changes, you must rebuild the devcontainer:
- VS Code: Command Palette → "Dev Containers: Rebuild Container"
- CLI: `docker-compose down && docker-compose up --build`

### 2. Test DinD Setup
```bash
# Test Docker-in-Docker connectivity
pnpm run test:dind

# Validate act setup
pnpm run validate-act-setup
```

### 3. Run CI Tests with Act
```bash
# Test full CI workflow (with PostgreSQL service)
pnpm run test:ci

# Debug CI issues
pnpm run test:ci-debug

# Clean up act containers
pnpm run test:ci-clean
```

## Expected Performance

### Before (Socket Mount Issues)
❌ Permission denied accessing Docker socket
❌ Act tests fail due to Docker connectivity
❌ Cannot test service-dependent workflows

### After (DinD Working)
✅ Full Docker access within container
✅ Act can test complete workflows with services
✅ pnpm-based CI workflows tested end-to-end
✅ PostgreSQL service tests work in CI simulation

## Troubleshooting

### DinD Service Issues
```bash
# Check DinD service logs
docker-compose logs dind

# Verify DinD is running
docker-compose ps dind

# Test direct connection
docker --host tcp://dind:2376 --tls ps
```

### Certificate Issues
```bash
# Check certificate directory
ls -la /certs/client/

# Verify TLS environment
echo $DOCKER_TLS_VERIFY
echo $DOCKER_CERT_PATH
```

### Network Issues
```bash
# Check networks
docker network ls

# Test container connectivity
ping dind
```

## Benefits

### Development
- **Complete CI simulation** with real service dependencies
- **Faster debugging** of workflow issues
- **Consistent environment** across all developers

### Testing
- **Full service stack** testing (app + PostgreSQL + DinD)
- **pnpm-based workflow validation** with the same package manager used by CI
- **Act integration** working properly with containers

### Security
- **Isolated Docker environment** (no host Docker dependency)
- **TLS encryption** for Docker daemon communication
- **Container-scoped** Docker operations

## Architecture

```
┌─ Host System ─────────────────────────────┐
│                                           │
│  ┌─ DevContainer ──────────────────────┐  │
│  │                                     │  │
│  │  ┌─ App Container ─┐  ┌─ DinD ────┐  │  │
│  │  │                 │  │           │  │  │
│  │  │ • Bun Runtime   │  │ • Docker  │  │  │
│  │  │ • Your Code     │⟷│   Daemon  │  │  │
│  │  │ • Act Runner    │  │ • TLS     │  │  │
│  │  └─────────────────┘  └───────────┘  │  │
│  │           │                          │  │
│  │           ▼                          │  │
│  │  ┌─ PostgreSQL ────┐                 │  │
│  │  │ • Test Database │                 │  │
│  │  │ • SQL Tests     │                 │  │
│  │  └─────────────────┘                 │  │
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
```

The DinD setup is now complete and ready for testing! 🚀
