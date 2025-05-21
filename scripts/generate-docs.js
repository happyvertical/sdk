#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs/manual');

// Ensure docs directory exists
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

// Execute TypeDoc to generate documentation
console.log('Generating API documentation...');
try {
  execSync('npx typedoc', { 
    stdio: 'inherit',
    cwd: ROOT_DIR 
  });
  console.log('API documentation generated successfully!');
  
  // Generate an index.html if it doesn't exist
  const indexPath = path.join(DOCS_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    const moduleLinks = fs.readdirSync(DOCS_DIR)
      .filter(item => fs.statSync(path.join(DOCS_DIR, item)).isDirectory() && !item.startsWith('.'))
      .map(moduleName => `<li><a href="./${moduleName}/index.html">${moduleName}</a></li>`)
      .join('\n    ');
    
    // Read the package.json to get the current version
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    const version = packageJson.version || 'latest';
    
    const indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HAVE SDK API Documentation</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3 {
      color: #1a73e8;
    }
    a {
      color: #1a73e8;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    ul {
      padding-left: 20px;
    }
    .package-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .package-item {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 15px;
      background-color: #f9f9f9;
    }
    .package-item h3 {
      margin-top: 0;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 0.9em;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>HAVE SDK API Documentation</h1>
  <p>
    The HAppy VErtical (HAVE) SDK is a TypeScript monorepo designed for building vertical AI agents with these core principles:
  </p>
  <ul>
    <li>Pure TypeScript implementation to avoid CommonJS vs ESM compatibility issues</li>
    <li>Minimized dependencies through a modular monorepo architecture</li>
    <li>Compartmentalized code to keep AI agents lean and focused</li>
    <li>Support for testing and scaling with minimal overhead</li>
    <li>Standardized interfaces across different packages</li>
  </ul>

  <h2>Package Documentation</h2>
  <div class="package-list">
    <div class="package-item">
      <h3>@have/ai</h3>
      <p>A standardized interface for AI model interactions, currently supporting OpenAI</p>
      <a href="./ai/src/README.html">View Documentation</a>
    </div>
    <div class="package-item">
      <h3>@have/files</h3>
      <p>Tools for interacting with file systems (local and remote)</p>
      <a href="./files/src/README.html">View Documentation</a>
    </div>
    <div class="package-item">
      <h3>@have/pdf</h3>
      <p>Utilities for parsing and processing PDF documents</p>
      <a href="./pdf/src/README.html">View Documentation</a>
    </div>
    <div class="package-item">
      <h3>@have/smrt</h3>
      <p>Core library for building AI agents with standardized collections and objects</p>
      <a href="./smrt/src/README.html">View Documentation</a>
    </div>
    <div class="package-item">
      <h3>@have/spider</h3>
      <p>Web crawling and content parsing tools</p>
      <a href="./spider/src/README.html">View Documentation</a>
    </div>
    <div class="package-item">
      <h3>@have/sql</h3>
      <p>Database interaction with support for SQLite and Postgres</p>
      <a href="./sql/src/README.html">View Documentation</a>
    </div>
    <div class="package-item">
      <h3>@have/utils</h3>
      <p>Shared utility functions used across packages</p>
      <a href="./utils/src/README.html">View Documentation</a>
    </div>
  </div>

  <div class="footer">
    <p>Generated on ${new Date().toLocaleDateString()} | HAVE SDK v${version}</p>
  </div>
</body>
</html>`;
    
    fs.writeFileSync(indexPath, indexContent);
    console.log('Generated custom index.html');
  }
} catch (error) {
  console.error('Error generating documentation:', error);
  process.exit(1);
}