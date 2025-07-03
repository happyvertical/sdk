#!/bin/bash

# Security validation script for GitHub Actions workflows
# This script validates that required secrets are configured and performs basic security checks

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to log with colors
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to validate required secrets
validate_secrets() {
    local secrets=("$@")
    local missing_secrets=()
    
    log_info "Validating required secrets..."
    
    for secret in "${secrets[@]}"; do
        if [ -z "${!secret}" ]; then
            missing_secrets+=("$secret")
        fi
    done
    
    if [ ${#missing_secrets[@]} -gt 0 ]; then
        log_error "Missing required secrets: ${missing_secrets[*]}"
        return 1
    fi
    
    log_info "All required secrets are configured"
    return 0
}

# Function to validate GitHub token permissions
validate_github_token() {
    if [ -z "$GITHUB_TOKEN" ]; then
        log_error "GITHUB_TOKEN is not set"
        return 1
    fi
    
    log_info "Validating GitHub token permissions..."
    
    # Test basic GitHub API access
    if ! gh auth status > /dev/null 2>&1; then
        log_error "GitHub token authentication failed"
        return 1
    fi
    
    log_info "GitHub token authentication successful"
    return 0
}

# Function to validate action versions
validate_action_versions() {
    local workflow_file="$1"
    
    if [ ! -f "$workflow_file" ]; then
        log_error "Workflow file not found: $workflow_file"
        return 1
    fi
    
    log_info "Validating action versions in $workflow_file..."
    
    # Check for unpinned versions
    if grep -q "@beta\|@latest\|@main\|@master" "$workflow_file"; then
        log_warn "Found unpinned action versions in $workflow_file"
        grep -n "@beta\|@latest\|@main\|@master" "$workflow_file" || true
    fi
    
    log_info "Action version validation complete"
    return 0
}

# Main validation function
main() {
    local required_secrets=()
    local workflow_files=()
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --secrets)
                shift
                while [[ $# -gt 0 && ! "$1" =~ ^-- ]]; do
                    required_secrets+=("$1")
                    shift
                done
                ;;
            --workflows)
                shift
                while [[ $# -gt 0 && ! "$1" =~ ^-- ]]; do
                    workflow_files+=("$1")
                    shift
                done
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --secrets SECRET1 SECRET2 ...    List of required secrets to validate"
                echo "  --workflows FILE1 FILE2 ...      List of workflow files to validate"
                echo "  --help                           Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    local validation_failed=false
    
    # Validate secrets if provided
    if [ ${#required_secrets[@]} -gt 0 ]; then
        if ! validate_secrets "${required_secrets[@]}"; then
            validation_failed=true
        fi
    fi
    
    # Validate GitHub token if GITHUB_TOKEN is set
    if [ -n "$GITHUB_TOKEN" ]; then
        if ! validate_github_token; then
            validation_failed=true
        fi
    fi
    
    # Validate workflow files if provided
    for workflow_file in "${workflow_files[@]}"; do
        if ! validate_action_versions "$workflow_file"; then
            validation_failed=true
        fi
    done
    
    if [ "$validation_failed" = true ]; then
        log_error "Security validation failed"
        exit 1
    fi
    
    log_info "Security validation passed"
    exit 0
}

# Run main function with all arguments
main "$@"