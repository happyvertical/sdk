#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import url from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs/manual');
const INDEX_PATH = path.join(DOCS_DIR, 'index.html');
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages');

// Parse command line arguments
const args = process.argv.slice(2);
const watchMode = args.includes('--watch') || args.includes('-w');

// Check if documentation exists, generate if needed
if (!fs.existsSync(INDEX_PATH)) {
  console.log('📝 Documentation not found, generating...');
  try {
    const generateCommand = watchMode ? 'node scripts/generate-docs.js --watch' : 'node scripts/generate-docs.js';
    execSync(generateCommand, {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    });
    console.log('✅ Documentation generated successfully!');
  } catch (error) {
    console.error('❌ Error generating documentation:', error.message);
    console.error('💡 You can create basic documentation manually or fix TypeScript errors and try again.');

    // Create a basic index.html if generation fails
    if (!fs.existsSync(DOCS_DIR)) {
      fs.mkdirSync(DOCS_DIR, { recursive: true });
    }

    // Include livereload script if in watch mode
    const livereloadScript = watchMode ? '<script src="http://localhost:35729/livereload.js?snipver=1"></script>' : '';

    const basicHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HAVE SDK Documentation - Generation Failed</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    .error { background: #fee; border: 1px solid #fcc; padding: 15px; border-radius: 4px; margin: 20px 0; }
    .info { background: #e8f4fd; border: 1px solid #bee5eb; padding: 15px; border-radius: 4px; margin: 20px 0; }
  </style>
  ${livereloadScript}
</head>
<body>
  <h1>HAVE SDK Documentation</h1>
  <div class="error">
    <h3>⚠️ Documentation Generation Failed</h3>
    <p>There were TypeScript compilation errors preventing documentation generation.</p>
  </div>
  <div class="info">
    <h3>🔧 To fix this:</h3>
    <ol>
      <li>Fix TypeScript compilation errors in the packages</li>
      <li>Run <code>bun docs</code> to regenerate documentation</li>
      <li>Or use <code>bun run docs:dev</code> for development server with file watching</li>
    </ol>
  </div>
  <h2>Available Commands</h2>
  <ul>
    <li><code>bun docs</code> - Generate documentation</li>
    <li><code>bun run docs:serve</code> - Serve documentation (opens in browser)</li>
    <li><code>bun run docs:dev</code> - Development server with file watching</li>
  </ul>
  ${watchMode ? '<div class="info"><h3>🔄 File Watching Active</h3><p>Documentation will regenerate when source files change. Refresh the page after regeneration to see updates.</p></div>' : ''}
</body>
</html>`;

    fs.writeFileSync(INDEX_PATH, basicHtml);
    console.log('📄 Created basic documentation page');
  }
}

// Function to open URL in browser based on platform
function openInBrowser(url) {
  let command;

  switch (process.platform) {
    case 'darwin': // macOS
      command = `open "${url}"`;
      break;
    case 'win32': // Windows
      command = `start "${url}"`;
      break;
    case 'linux': // Linux
      command = `xdg-open "${url}"`;
      break;
    default:
      console.error(`Unsupported platform: ${process.platform}`);
      console.log(`Please manually open: ${url}`);
      return false;
  }

  try {
    execSync(command, { stdio: 'ignore' });
    return true;
  } catch (error) {
    console.error('Failed to open browser automatically.');
    console.log(`Please manually open: ${url}`);
    return false;
  }
}

if (watchMode) {
  console.log('🔄 Starting development server with file watching...');

  const PORT = 3030;

  // Simple HTTP server using built-in Node.js modules
  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;

    // Route handling for dual format documentation
    let filePath;

    // Check if this is a request for package-level documentation
    if (pathname.startsWith('/packages/')) {
      // Handle package documentation requests: /packages/ai/docs/index.md
      const packageMatch = pathname.match(/^\/packages\/([^\/]+)\/(.*)/);
      if (packageMatch) {
        const packageName = packageMatch[1];
        const relativePath = packageMatch[2] || 'index.md';
        filePath = path.join(PACKAGES_DIR, packageName, 'docs', relativePath);

        // Security check for package docs
        const packageDocsDir = path.join(PACKAGES_DIR, packageName, 'docs');
        if (!filePath.startsWith(packageDocsDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
      } else {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
    } else {
      // Handle HTML documentation requests
      if (pathname === '/') {
        pathname = '/index.html';
      }
      filePath = path.join(DOCS_DIR, pathname);

      // Security check for HTML docs
      if (!filePath.startsWith(DOCS_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // File not found, try fallbacks
          if (pathname.startsWith('/packages/')) {
            // For package docs, create a simple directory listing
            const packageMatch = pathname.match(/^\/packages\/([^\/]+)/);
            if (packageMatch) {
              const packageName = packageMatch[1];
              const packageDocsDir = path.join(PACKAGES_DIR, packageName, 'docs');

              if (fs.existsSync(packageDocsDir)) {
                try {
                  const files = fs.readdirSync(packageDocsDir)
                    .filter(f => f.endsWith('.md'))
                    .map(f => `<li><a href="/packages/${packageName}/${f}">${f}</a></li>`)
                    .join('\n');

                  const listingHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>@have/${packageName} - Package Documentation</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    .back { margin: 20px 0; }
    .back a { color: #666; text-decoration: none; }
    .back a:hover { text-decoration: underline; }
    ul li { margin: 5px 0; }
  </style>
</head>
<body>
  <div class="back"><a href="/">← Back to HTML Documentation</a></div>
  <h1>@have/${packageName} - Package Documentation</h1>
  <p>Markdown documentation for AI agents:</p>
  <ul>${files}</ul>
</body>
</html>`;

                  res.writeHead(200, { 'Content-Type': 'text/html' });
                  res.end(listingHtml);
                  return;
                } catch (dirError) {
                  console.error('Error reading package docs directory:', dirError);
                }
              }
            }
            res.writeHead(404);
            res.end('Package documentation not found');
          } else {
            // For HTML docs, serve index.html for SPA routing
            fs.readFile(INDEX_PATH, (indexErr, indexData) => {
              if (indexErr) {
                res.writeHead(404);
                res.end('Not Found');
              } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(indexData);
              }
            });
          }
        } else {
          res.writeHead(500);
          res.end('Server Error');
        }
        return;
      }

      // Set content type based on file extension
      const ext = path.extname(filePath);
      const contentTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.md': 'text/plain; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  server.listen(PORT, () => {
    console.log(`📚 Documentation server running at http://localhost:${PORT}`);
  });

  // Watch source files for changes using built-in fs.watch
  const watchedDirs = [
    'packages/utils/src',
    'packages/files/src',
    'packages/spider/src',
    'packages/sql/src',
    'packages/ocr/src',
    'packages/pdf/src',
    'packages/ai/src',
    'packages/smrt/src'
  ];

  let regenerating = false;

  // Watch each directory for changes
  watchedDirs.forEach(dir => {
    const fullPath = path.join(ROOT_DIR, dir);
    if (fs.existsSync(fullPath)) {
      fs.watch(fullPath, { recursive: true }, (eventType, filename) => {
        if (regenerating) return;

        // Only watch TypeScript files, exclude test files
        if (!filename || !filename.endsWith('.ts') ||
            filename.includes('.test.') || filename.includes('.spec.')) {
          return;
        }

        console.log(`📝 Source file changed: ${dir}/${filename}`);
        console.log('🔄 Regenerating documentation...');

        regenerating = true;

        try {
          // Regenerate both package-level docs and HTML docs
          execSync('bun docs:packages && node scripts/generate-docs.js --watch', {
            cwd: ROOT_DIR,
            stdio: 'inherit'
          });
          console.log('✅ Documentation regenerated successfully!');
        } catch (error) {
          console.error('❌ Error regenerating documentation:', error.message);
        } finally {
          regenerating = false;
        }
      });
    }
  });

  // Open browser
  const devUrl = `http://localhost:${PORT}`;
  console.log(`🌐 Opening: ${devUrl}`);

  const success = openInBrowser(devUrl);

  if (success) {
    console.log('✅ Documentation opened successfully in your default browser!');
    console.log('');
    console.log('📚 Dual Format Documentation:');
    console.log('   • HTML Documentation: http://localhost:3030/ (for public website)');
    console.log('   • Package Documentation: http://localhost:3030/packages/<name>/ (for AI agents)');
    console.log('');
    console.log('🔄 File watching is active:');
    console.log('   • Documentation will regenerate when source files change');
    console.log('   • Watching all TypeScript files in packages/*/src/');
    console.log('   • Both HTML and markdown docs regenerate automatically');
    console.log('   • Manually refresh browser after regeneration');
    console.log('');
    console.log('📖 Package Documentation (Markdown for AI agents):');
    console.log('   • http://localhost:3030/packages/ai/ - AI model interfaces');
    console.log('   • http://localhost:3030/packages/files/ - File system operations');
    console.log('   • http://localhost:3030/packages/ocr/ - OCR processing');
    console.log('   • http://localhost:3030/packages/pdf/ - PDF document processing');
    console.log('   • http://localhost:3030/packages/smrt/ - Core AI agent framework');
    console.log('   • http://localhost:3030/packages/spider/ - Web crawling');
    console.log('   • http://localhost:3030/packages/sql/ - Database operations');
    console.log('   • http://localhost:3030/packages/utils/ - Utility functions');
    console.log('');
    console.log('💡 Press Ctrl+C to stop the development server');
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down development server...');
    server.close(() => {
      console.log('✅ Development server stopped');
      process.exit(0);
    });
  });

} else {
  // Original behavior: open file directly in browser
  const absoluteIndexPath = path.resolve(INDEX_PATH);
  const fileUrl = `file://${absoluteIndexPath}`;

  console.log('📚 Opening HAVE SDK documentation...');
  console.log(`📂 Documentation location: ${DOCS_DIR}`);
  console.log(`🌐 Opening: ${fileUrl}`);
  console.log('💡 Use --watch flag for live reload development mode');

  const success = openInBrowser(fileUrl);

  if (success) {
    console.log('✅ Documentation opened successfully in your default browser!');
    console.log('');
    console.log('📖 Navigate through the packages:');
    console.log('   Core SDK:');
    console.log('   • @have/ai - AI model interfaces');
    console.log('   • @have/files - File system operations');
    console.log('   • @have/ocr - OCR processing');
    console.log('   • @have/pdf - PDF document processing');
    console.log('   • @have/smrt - Core AI agent framework');
    console.log('   • @have/spider - Web crawling');
    console.log('   • @have/sql - Database operations');
    console.log('   • @have/utils - Utility functions');
    console.log('   SMRT Modules:');
    console.log('   • @have/content - Content processing');
    console.log('   • @have/products - Microservice template');
    console.log('');
    console.log('💡 Run "bun run docs:dev" for development mode with file watching');
  } else {
    process.exit(1);
  }
}