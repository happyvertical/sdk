#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs/manual');

// Parse command line arguments
const args = process.argv.slice(2);
const watchMode = args.includes('--watch') || args.includes('-w');

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
  
  // Ensure .nojekyll file exists to prevent GitHub Pages from using Jekyll
  const nojekyllPath = path.join(DOCS_DIR, '.nojekyll');
  if (!fs.existsSync(nojekyllPath)) {
    fs.writeFileSync(nojekyllPath, '');
    console.log('Created .nojekyll file for GitHub Pages');
  }

  // Generate a custom index.html to replace TypeDoc's default
  const indexPath = path.join(DOCS_DIR, 'index.html');
    const moduleLinks = fs.readdirSync(DOCS_DIR)
      .filter(item => fs.statSync(path.join(DOCS_DIR, item)).isDirectory() && !item.startsWith('.'))
      .map(moduleName => `<li><a href="./${moduleName}/index.html">${moduleName}</a></li>`)
      .join('\n    ');
    
    // Read the package.json to get the current version
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    const version = packageJson.version || 'latest';

    // Include livereload script if in watch mode
    const livereloadScript = watchMode ? '<script src="http://localhost:35729/livereload.js?snipver=1"></script>' : '';

    const indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HAVE SDK API Documentation</title>
  <meta name="description" content="API documentation for HAppy VErtical (HAVE) SDK - a TypeScript monorepo for building vertical AI agents">
  <meta name="keywords" content="AI, TypeScript, SDK, documentation, vertical AI, agent framework">
  <style>
    :root {
      --primary-color: #1a73e8;
      --secondary-color: #34a853;
      --background-color: #f8f9fa;
      --text-color: #202124;
      --card-background: #ffffff;
      --card-border: #e0e0e0;
      --header-background: #f1f3f4;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: var(--text-color);
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background-color: var(--background-color);
    }
    
    header {
      background-color: var(--header-background);
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    h1, h2, h3 {
      color: var(--primary-color);
    }
    
    a {
      color: var(--primary-color);
      text-decoration: none;
      transition: color 0.2s ease;
    }
    
    a:hover {
      text-decoration: underline;
      color: var(--secondary-color);
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
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 20px;
      background-color: var(--card-background);
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    .package-item:hover {
      transform: translateY(-3px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    
    .package-item h3 {
      margin-top: 0;
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
    }
    
    .package-item a {
      display: inline-block;
      margin-top: 10px;
      font-weight: 500;
    }
    
    .github-link {
      display: inline-block;
      margin-top: 15px;
      padding: 8px 16px;
      background-color: var(--primary-color);
      color: white;
      border-radius: 4px;
      font-weight: 500;
      text-align: center;
    }
    
    .github-link:hover {
      background-color: var(--secondary-color);
      text-decoration: none;
    }
    
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid var(--card-border);
      font-size: 0.9em;
      color: #666;
      text-align: center;
    }
    
    @media (max-width: 768px) {
      .package-list {
        grid-template-columns: 1fr;
      }
    }
  </style>
  ${livereloadScript}
</head>
<body>
  <header>
    <h1>HAVE SDK API Documentation</h1>
    <p>
      The HAppy VErtical (HAVE) SDK is a TypeScript monorepo designed for building vertical AI agents.
    </p>
    <a href="https://github.com/happyvertical/sdk" class="github-link" target="_blank">View on GitHub</a>
  </header>
  
  <section>
    <h2>Core Principles</h2>
    <ul>
      <li>Pure TypeScript implementation to avoid CommonJS vs ESM compatibility issues</li>
      <li>Minimized dependencies through a modular monorepo architecture</li>
      <li>Compartmentalized code to keep AI agents lean and focused</li>
      <li>Support for testing and scaling with minimal overhead</li>
      <li>Standardized interfaces across different packages</li>
    </ul>
  </section>

  <section>
    <h2>Package Documentation</h2>
    <div class="package-list">
      <div class="package-item">
        <h3>@have/ai</h3>
        <p>A standardized interface for AI model interactions across multiple providers (OpenAI, Anthropic, Google Gemini, AWS Bedrock)</p>
        <a href="/modules/ai_src.html">View Documentation</a>
      </div>
      <div class="package-item">
        <h3>@have/files</h3>
        <p>Tools for interacting with file systems (local and remote, Node.js-focused)</p>
        <a href="/modules/files_src.html">View Documentation</a>
      </div>
      <div class="package-item">
        <h3>@have/ocr</h3>
        <p>Optical Character Recognition with support for multiple providers including Tesseract.js and ONNX</p>
        <a href="/modules/ocr_src.html">View Documentation</a>
      </div>
      <div class="package-item">
        <h3>@have/pdf</h3>
        <p>Utilities for parsing and processing PDF documents with OCR fallback</p>
        <a href="/modules/pdf_src.html">View Documentation</a>
      </div>
      <div class="package-item">
        <h3>@have/smrt</h3>
        <p>Core AI agent framework with standardized collections, content processing, and code generators</p>
        <a href="/modules/smrt_src.html">View Documentation</a>
      </div>
      <div class="package-item">
        <h3>@have/spider</h3>
        <p>Web scraping and content extraction using happy-dom and undici for lightweight, fast operations</p>
        <a href="/modules/spider_src.html">View Documentation</a>
      </div>
      <div class="package-item">
        <h3>@have/sql</h3>
        <p>Database interface with support for SQLite and PostgreSQL</p>
        <a href="/modules/sql_src.html">View Documentation</a>
      </div>
      <div class="package-item">
        <h3>@have/utils</h3>
        <p>Context-aware utility functions and type definitions</p>
        <a href="/modules/utils_src.html">View Documentation</a>
      </div>
    </div>
  </section>

  <div class="footer">
    <p>Generated on ${new Date().toLocaleDateString()} | HAVE SDK v${version}</p>
    <p>© ${new Date().getFullYear()} Happy Vertical</p>
  </div>
</body>
</html>`;
    
    fs.writeFileSync(indexPath, indexContent);
    console.log('Generated custom index.html');
} catch (error) {
  console.error('Error generating documentation:', error);
  process.exit(1);
}