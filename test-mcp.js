#!/usr/bin/env node

// Simple test script to verify MCP server can run
console.log('Testing NixOS-compatible Playwright MCP server...');

// The MCP server should be available via the flake
console.log('Available commands:');
console.log('- mcp-server-playwright (NixOS compatible version)');
console.log('- Use via: npx -y @playwright/mcp@latest (standard version - may not work on NixOS)');

// Test if the Nix version is available
try {
  const { execSync } = require('child_process');
  const version = execSync('mcp-server-playwright --version', { encoding: 'utf8' });
  console.log('✅ NixOS Playwright MCP Server version:', version.trim());
} catch (error) {
  console.log('❌ NixOS Playwright MCP Server not found in PATH');
  console.log('Trying via nix run...');
  
  try {
    const version = execSync('nix run github:akirak/nix-playwright-mcp -- --version', { encoding: 'utf8', timeout: 10000 });
    console.log('✅ Nix Playwright MCP Server version:', version.trim());
  } catch (error) {
    console.log('❌ Could not run Nix Playwright MCP server');
  }
}