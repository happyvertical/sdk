#!/usr/bin/env bash

# SMRT Development MCP Server Bridge Script
# This script starts the MCP server for SMRT framework development

set -euo pipefail

# Configuration
SERVER_NAME="SMRT Development Server"
SERVER_DIR="${SDK_ROOT:-$(dirname "$0")/../..}/mcp"
SERVER_SCRIPT="$SERVER_DIR/dist/index.js"
LOG_FILE="/tmp/smrt-mcp-server.log"
PID_FILE="/tmp/smrt-mcp-server.pid"

# Utility functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

cleanup() {
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log "Stopping MCP server (PID: $pid)"
            kill "$pid" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
    fi
}

# Set up signal handlers
trap cleanup EXIT INT TERM

# Check dependencies
check_dependencies() {
    if ! command -v node >/dev/null 2>&1; then
        error "Node.js is not installed or not in PATH"
    fi

    if ! command -v bun >/dev/null 2>&1; then
        error "Bun is not installed or not in PATH"
    fi

    if [[ ! -d "$SERVER_DIR" ]]; then
        error "Server directory not found: $SERVER_DIR"
    fi
}

# Build server if needed
build_server() {
    log "Checking if server build is needed..."

    cd "$SERVER_DIR" || error "Cannot change to server directory"

    # Check if dist directory exists and is newer than source
    if [[ ! -f "$SERVER_SCRIPT" ]] || [[ "src" -nt "dist" ]]; then
        log "Building MCP server..."

        # Install dependencies if needed
        if [[ ! -d "node_modules" ]] || [[ "package.json" -nt "node_modules/.package-lock.json" ]]; then
            log "Installing dependencies..."
            bun install || error "Failed to install dependencies"
        fi

        # Build the server
        log "Compiling TypeScript..."
        bun run build || error "Failed to build server"

        log "Server build completed successfully"
    else
        log "Server is up to date"
    fi
}

# Health check
health_check() {
    local max_attempts=5
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        if [[ -f "$PID_FILE" ]]; then
            local pid
            pid=$(cat "$PID_FILE")
            if kill -0 "$pid" 2>/dev/null; then
                log "Health check passed (attempt $attempt/$max_attempts)"
                return 0
            fi
        fi

        log "Health check failed (attempt $attempt/$max_attempts)"
        sleep 1
        ((attempt++))
    done

    error "Server failed health check after $max_attempts attempts"
}

# Start the server
start_server() {
    log "Starting $SERVER_NAME..."

    cd "$SERVER_DIR" || error "Cannot change to server directory"

    # Start the server in the background
    node "$SERVER_SCRIPT" &
    local pid=$!

    # Save PID
    echo "$pid" > "$PID_FILE"
    log "Server started with PID: $pid"

    # Brief startup wait
    sleep 2

    # Verify it's still running
    if ! kill -0 "$pid" 2>/dev/null; then
        error "Server failed to start or crashed immediately"
    fi

    log "$SERVER_NAME is running successfully"
}

# Main execution
main() {
    log "Initializing $SERVER_NAME..."

    # Check environment
    log "Environment check..."
    check_dependencies

    # Build if necessary
    build_server

    # Start the server
    start_server

    # Keep script running (MCP expects the process to stay alive)
    log "Server is ready for MCP connections"

    # Monitor the server process
    while true; do
        if [[ -f "$PID_FILE" ]]; then
            local pid
            pid=$(cat "$PID_FILE")
            if ! kill -0 "$pid" 2>/dev/null; then
                error "Server process died unexpectedly"
            fi
        else
            error "PID file disappeared"
        fi

        sleep 5
    done
}

# Handle special commands
case "${1:-start}" in
    "start")
        main
        ;;
    "stop")
        cleanup
        log "Server stopped"
        ;;
    "restart")
        cleanup
        sleep 1
        main
        ;;
    "status")
        if [[ -f "$PID_FILE" ]]; then
            local pid
            pid=$(cat "$PID_FILE")
            if kill -0 "$pid" 2>/dev/null; then
                log "Server is running (PID: $pid)"
                exit 0
            else
                log "Server is not running (stale PID file)"
                exit 1
            fi
        else
            log "Server is not running"
            exit 1
        fi
        ;;
    "logs")
        tail -f "$LOG_FILE"
        ;;
    "build")
        build_server
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|build}"
        echo ""
        echo "Commands:"
        echo "  start    - Start the MCP server (default)"
        echo "  stop     - Stop the MCP server"
        echo "  restart  - Restart the MCP server"
        echo "  status   - Check server status"
        echo "  logs     - View server logs"
        echo "  build    - Build the server without starting"
        exit 1
        ;;
esac