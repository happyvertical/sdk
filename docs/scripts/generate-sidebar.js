#!/usr/bin/env node
/**
 * Script to generate sidebars.ts from package READMEs
 * Automatically extracts section headings from READMEs and creates sidebar navigation
 */

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const repoRoot = join(__dirname, '../..');
const packagesDir = join(repoRoot, 'packages');
const sidebarPath = join(__dirname, '../sidebars.ts');

// Package names in order
const packages = [
  { id: 'ai', label: '@have/ai', position: 2 },
  { id: 'cache', label: '@have/cache', position: 3 },
  { id: 'config', label: '@have/config', position: 4 },
  { id: 'documents', label: '@have/documents', position: 5 },
  { id: 'files', label: '@have/files', position: 6 },
  { id: 'geo', label: '@have/geo', position: 7 },
  { id: 'logger', label: '@have/logger', position: 8 },
  { id: 'ocr', label: '@have/ocr', position: 9 },
  { id: 'pdf', label: '@have/pdf', position: 10 },
  { id: 'spider', label: '@have/spider', position: 11 },
  { id: 'sql', label: '@have/sql', position: 12 },
  { id: 'translator', label: '@have/translator', position: 13 },
  { id: 'utils', label: '@have/utils', position: 14 },
];

/**
 * Extract section headings from markdown content
 * @param {string} content - Markdown content
 * @returns {Array<{label: string, anchor: string}>} - Section headings
 */
function extractSections(content) {
  const lines = content.split('\n');
  const sections = [];

  // Skip frontmatter
  let inFrontmatter = false;
  let startIndex = 0;

  if (lines[0] === '---') {
    inFrontmatter = true;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        startIndex = i + 1;
        break;
      }
    }
  }

  // Extract ## headings (h2 only)
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^## (.+)$/);

    if (match) {
      const heading = match[1].trim();

      // Skip certain headings
      if (heading.toLowerCase() === 'license') continue;
      if (heading.startsWith('@have/')) continue;

      // Convert heading to anchor
      const anchor = heading
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');

      sections.push({
        label: heading,
        anchor: anchor
      });
    }
  }

  return sections;
}

/**
 * Generate sidebar items for a package
 * @param {Object} pkg - Package info
 * @returns {Promise<Array>} - Sidebar items
 */
async function generatePackageSidebar(pkg) {
  try {
    const readmePath = join(packagesDir, pkg.id, 'README.md');
    const content = await readFile(readmePath, 'utf-8');
    const sections = extractSections(content);

    // Limit to first 5-6 most important sections
    const maxSections = 6;
    const items = sections.slice(0, maxSections).map(section => ({
      type: 'link',
      label: section.label,
      href: `/${pkg.id}#${section.anchor}`
    }));

    // Add API Reference link
    items.push({
      type: 'link',
      label: '📚 API Reference',
      href: `/api/${pkg.id}/globals`
    });

    return items;
  } catch (error) {
    console.warn(`⚠ Warning: Could not read README for ${pkg.id}:`, error.message);
    return [];
  }
}

/**
 * Generate the complete sidebars.ts file
 */
async function generateSidebar() {
  console.log('Generating sidebars.ts from package READMEs...');

  // Generate sidebar items for each package
  const packageSidebars = await Promise.all(
    packages.map(async (pkg) => {
      const items = await generatePackageSidebar(pkg);
      console.log(`✓ Generated sidebar for ${pkg.label} (${items.length} sections)`);
      return { pkg, items };
    })
  );

  // Build the TypeScript content
  const sidebarContent = `import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'doc',
      id: 'index',
      label: 'Introduction',
    },
${packageSidebars.map(({ pkg, items }) => `    {
      type: 'category',
      label: '${pkg.label}',
      link: { type: 'doc', id: '${pkg.id}' },
      collapsed: true,
      items: [
${items.map(item => `        { type: '${item.type}', label: '${item.label}', href: '${item.href}' },`).join('\n')}
      ],
    },`).join('\n')}
    {
      type: 'doc',
      id: 'contributing',
      label: 'Contributing',
    },
    {
      type: 'doc',
      id: 'license',
      label: 'License',
    },
  ],
};

export default sidebars;
`;

  // Write the file
  await writeFile(sidebarPath, sidebarContent, 'utf-8');
  console.log('\n✓ Generated sidebars.ts successfully!');
}

// Run the script
generateSidebar().catch((error) => {
  console.error('Error generating sidebar:', error);
  process.exit(1);
});
