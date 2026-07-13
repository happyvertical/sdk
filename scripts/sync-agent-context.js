#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const GENERATED_START = '<!-- BEGIN AGENT:GENERATED -->';
const GENERATED_END = '<!-- END AGENT:GENERATED -->';

const rootDir = process.cwd();
const packagesDir = join(rootDir, 'packages');
const rootAgentPath = join(rootDir, 'AGENT.md');
const manifestPath = join(rootDir, 'ecosystem-manifest.json');

const checkMode = process.argv.includes('--check');
const changedPaths = [];

function sanitizeInlineMarkdown(value) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values) {
  return Array.from(
    new Map(
      values.filter(Boolean).map((value) => [value.toLowerCase(), value]),
    ).values(),
  );
}

function expandCompoundValues(values) {
  const expanded = [];

  for (const value of values) {
    if (
      /\sand\s/i.test(value) &&
      !/github actions|measurement protocol|text and image/i.test(value)
    ) {
      const parts = value
        .split(/\s+and\s+/i)
        .map((part) => part.trim())
        .filter(Boolean);
      expanded.push(...parts);
      continue;
    }

    expanded.push(value);
  }

  return expanded;
}

function stripTopHeading(markdown) {
  return markdown
    .replace(/^\uFEFF?# .*?\n+/, '')
    .replace(/^\s+/, '')
    .trim();
}

function parseMarkdownSections(markdown) {
  const body = stripTopHeading(markdown);
  const lines = body.split('\n');
  const introLines = [];
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection) {
        currentSection.content = currentSection.lines.join('\n').trim();
        delete currentSection.lines;
      }

      currentSection = { title: line.replace(/^##\s+/, '').trim(), lines: [] };
      sections.push(currentSection);
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    } else {
      introLines.push(line);
    }
  }

  if (currentSection) {
    currentSection.content = currentSection.lines.join('\n').trim();
    delete currentSection.lines;
  }

  const intro = introLines.join('\n').trim();

  return {
    intro,
    sections: sections.map((section) => ({
      title: section.title,
      content: section.content ?? '',
    })),
  };
}

function firstParagraph(markdown) {
  const text = markdown.trim();
  if (!text) return '';

  const [paragraph] = text.split(/\n\s*\n/);
  return sanitizeInlineMarkdown(paragraph);
}

function splitTopLevel(text) {
  const parts = [];
  let current = '';
  let depth = 0;

  for (const character of text) {
    if (character === '(') depth += 1;
    if (character === ')' && depth > 0) depth -= 1;

    if ((character === ',' || character === ';') && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function splitDelimitedValues(text) {
  return splitTopLevel(text)
    .map((part) =>
      sanitizeInlineMarkdown(part)
        .replace(/\.$/, '')
        .replace(/\s+\(.*?\)\s*$/g, '')
        .replace(/\s+All in .*$/i, '')
        .replace(/\s+are all .*$/i, '')
        .replace(/\s+uses .*$/i, '')
        .trim(),
    )
    .filter(Boolean);
}

function extractSectionList(content) {
  const bulletItems = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^- /, '').trim());

  if (bulletItems.length > 0) {
    return bulletItems.map((item) => sanitizeInlineMarkdown(item));
  }

  const paragraph = firstParagraph(content);
  if (!paragraph) return [];

  return splitDelimitedValues(paragraph);
}

function toCapability(value) {
  const cleaned = sanitizeInlineMarkdown(value)
    .replace(/\.$/, '')
    .replace(/^[A-Z][A-Za-z0-9+/ -]+:\s*/, '')
    .trim();

  if (!cleaned) return '';
  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

function toImplementationName(value) {
  const cleaned = sanitizeInlineMarkdown(value)
    .replace(/\.$/, '')
    .replace(/\s+[—-].*$/, '')
    .trim();

  const directMatch =
    cleaned.match(/^([A-Za-z0-9+./ -]+?)\s*\(/) ??
    cleaned.match(
      /^([A-Za-z0-9+./ -]+?)\s+(?:is|are|uses|supports|requires|accepts|throw|throws)\b/i,
    ) ??
    cleaned.match(/^([A-Za-z0-9+./ -]+?)\s+[—-]/);
  if (directMatch) return directMatch[1].trim();

  if (/\sand\s/i.test(cleaned) && !cleaned.includes('API')) {
    return cleaned;
  }

  return cleaned.replace(/\s+\(.*?\)\s*$/, '').trim();
}

function extractImplements(sections) {
  const implementsSections = new Set([
    'adapters',
    'providers',
    'modules',
    'tools',
    'key exports',
  ]);

  const values = [];
  for (const section of sections) {
    if (!implementsSections.has(section.title.toLowerCase())) continue;

    for (const item of extractSectionList(section.content)) {
      const normalizedItem = sanitizeInlineMarkdown(item);
      const sentences = normalizedItem
        .split(/(?<=\.)\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);

      for (const sentence of sentences) {
        const candidate =
          sentence.match(/^([A-Za-z0-9+./ -]+?)\s*\(/)?.[1] ??
          sentence.match(
            /^([A-Za-z0-9+./ -]+?)\s+(?:is|uses|supports|accepts|throws)\b/i,
          )?.[1];

        if (candidate) {
          const compound = candidate
            .split(/\s+and\s+/i)
            .map((part) => toImplementationName(part))
            .filter(Boolean);
          values.push(...compound);
          continue;
        }

        for (const splitValue of splitDelimitedValues(sentence)) {
          const implementation = toImplementationName(splitValue);
          if (implementation) values.push(implementation);
        }
      }
    }
  }

  return unique(expandCompoundValues(values));
}

function extractProvides({ description, sections, legacyMeta }) {
  if (Array.isArray(legacyMeta?.provides) && legacyMeta.provides.length > 0) {
    return unique(
      legacyMeta.provides.map((item) => sanitizeInlineMarkdown(String(item))),
    );
  }

  if (Array.isArray(legacyMeta?.purpose) && legacyMeta.purpose.length > 0) {
    return unique(
      legacyMeta.purpose.map((item) => sanitizeInlineMarkdown(String(item))),
    );
  }

  const values = [];
  if (description) values.push(description);

  for (const sectionTitle of [
    'Key patterns',
    'Tools',
    'Modules',
    'Key exports',
  ]) {
    const section = sections.find(
      (candidate) =>
        candidate.title.toLowerCase() === sectionTitle.toLowerCase(),
    );

    if (!section) continue;

    for (const item of extractSectionList(section.content).slice(0, 4)) {
      const capability = toCapability(item);
      if (capability) values.push(capability);
    }

    if (values.length >= 4) break;
  }

  return unique(values);
}

function inferStability(markdown) {
  const text = markdown.toLowerCase();

  if (
    /stub|not yet implemented|error-throwing|throw immediately|partial|limited/.test(
      text,
    )
  ) {
    return {
      level: 'mixed',
      reason:
        'Contains stubbed, partial, or intentionally unsupported surface area.',
    };
  }

  if (/experimental|preview|beta/.test(text)) {
    return {
      level: 'experimental',
      reason: 'Marked as preview or experimental in package guidance.',
    };
  }

  return {
    level: 'stable',
    reason:
      'Primary package surface is described as implemented and production-oriented.',
  };
}

function extractLegacyNotes(markdown) {
  if (!markdown.trim()) return '';

  if (markdown.includes(GENERATED_START) && markdown.includes(GENERATED_END)) {
    const endIndex = markdown.indexOf(GENERATED_END);
    return markdown.slice(endIndex + GENERATED_END.length).trim();
  }

  const stripped = stripTopHeading(markdown);
  const match = stripped.match(/(^##\s+[\s\S]*)/m);
  if (match) {
    return match[1].trim();
  }

  return stripped;
}

function loadLegacyMeta(rawText) {
  if (!rawText) return null;

  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function parseCatalogPackageNames(workspaceYaml) {
  const packages = [];
  let inCatalog = false;

  for (const line of workspaceYaml.split('\n')) {
    if (/^catalog:\s*$/.test(line)) {
      inCatalog = true;
      continue;
    }
    if (inCatalog && /^\S/.test(line)) break;
    if (!inCatalog) continue;

    const match = /^\s{2}'(@happyvertical\/[^']+)':/.exec(line);
    if (match) packages.push(match[1]);
  }

  return packages.sort();
}

function formatInlineList(values) {
  if (values.length === 0) return 'none';
  return values.map((value) => `\`${value}\``).join(', ');
}

function formatListSection(title, values) {
  if (values.length === 0) {
    return `- ${title}: none`;
  }

  return `- ${title}: ${values.join(', ')}`;
}

function buildPackageCommands(pkg) {
  const commands = {};
  const scripts = pkg.scripts;

  for (const name of ['build', 'test', 'typecheck', 'lint', 'clean']) {
    if (scripts[name]) {
      commands[name] = `pnpm --filter ${pkg.packageName} ${name}`;
    }
  }

  return commands;
}

function buildCorrectionLoops(pkg, commands) {
  const loops = [];

  if (pkg.requires.workspace.length > 0) {
    loops.push(
      `If module resolution or export errors mention a workspace dependency, build the dependency first (${pkg.requires.workspace
        .map((dependency) => `\`pnpm --filter ${dependency} build\``)
        .join(
          ', ',
        )}) and then rerun \`${commands.build ?? `pnpm --filter ${pkg.packageName} build`}\`.`,
    );
  } else {
    loops.push(
      `If Vite or TypeScript reports missing packages, run \`pnpm install\` at the repo root and rerun \`${commands.build ?? `pnpm --filter ${pkg.packageName} build`}\`.`,
    );
  }

  if (commands.clean) {
    loops.push(
      `If tests or exports fail after API, type, or bundle changes, run \`${commands.clean}\` followed by \`${commands.build ?? `pnpm --filter ${pkg.packageName} build`}\` and \`${commands.test ?? `pnpm --filter ${pkg.packageName} test`}\`.`,
    );
  } else if (commands.typecheck) {
    loops.push(
      `If you hit type-only regressions, run \`${commands.typecheck}\` before rerunning the package build or tests to isolate the failing surface.`,
    );
  } else if (commands.test) {
    loops.push(
      `If a change only affects runtime behavior, rerun \`${commands.test}\` after rebuilding the package to confirm the failure is local.`,
    );
  }

  loops.push(
    `If failures span multiple packages or Turborepo ordering looks wrong, run \`pnpm build\` and \`pnpm typecheck\` from the repo root before retrying package-scoped commands.`,
  );

  return loops;
}

function renderPackageAgent(pkg) {
  const buildLines = Object.entries(pkg.commands)
    .filter(([name]) =>
      ['build', 'test', 'typecheck', 'lint', 'clean'].includes(name),
    )
    .map(([, command]) => command);

  const generatedBlock = [
    GENERATED_START,
    '## Purpose',
    pkg.description,
    '',
    '## Package Map',
    `- Package: \`${pkg.packageName}\``,
    `- Hierarchy path: \`@happyvertical/sdk > packages > ${pkg.shortName}\``,
    `- Workspace position: \`${pkg.position.index} of ${pkg.position.count}\` local packages`,
    `- Internal dependencies: ${formatInlineList(pkg.requires.workspace)}`,
    `- Internal dependents: ${formatInlineList(pkg.dependents)}`,
    '- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`',
    '',
    '## Build & Test',
    '```bash',
    ...buildLines,
    '```',
    '',
    '## Agent Correction Loops',
    ...pkg.correctionLoops.map((loop) => `- ${loop}`),
    '',
    '## Ecosystem Relationships',
    formatListSection('Provides', pkg.provides),
    formatListSection('Implements', pkg.implements),
    formatListSection('Requires', [
      ...pkg.requires.workspace,
      ...pkg.requires.externalHappyVertical,
      ...pkg.requires.external,
    ]),
    `- Stability: ${pkg.stability.level} (${pkg.stability.reason})`,
    GENERATED_END,
  ].join('\n');

  const trailingNotes = pkg.notes.trim();

  return [
    `# ${pkg.packageName}`,
    '',
    generatedBlock,
    trailingNotes ? `\n\n${trailingNotes}` : '',
    '',
  ].join('\n');
}

function renderRootAgent({
  rootDescription,
  packageCount,
  catalogPackages,
  packages,
}) {
  const generatedBlock = [
    GENERATED_START,
    '## Purpose',
    rootDescription,
    '',
    '## Workspace Map',
    '- Package docs standard: `AGENT.md`',
    `- Local workspace packages: \`${packageCount}\``,
    `- External catalog packages: ${formatInlineList(catalogPackages)}`,
    '- Generated manifest: `ecosystem-manifest.json`',
    `- Top-level package order: ${packages.map((pkg) => `\`${pkg.shortName}\``).join(', ')}`,
    '',
    '## Build & Test',
    '```bash',
    'pnpm install',
    'pnpm build',
    'pnpm test',
    'pnpm lint',
    'pnpm typecheck',
    'pnpm agent:sync',
    '```',
    '',
    '## Agent Correction Loops',
    '- If workspace packages or dependency edges change, run `pnpm agent:sync` to refresh `AGENT.md`, `metadata.json`, and `ecosystem-manifest.json` before committing.',
    '- If Turborepo or package filters report stale graph/input errors after package manifest edits, run `pnpm install` and then `pnpm build` from the repo root.',
    '- If package-scoped work fails because a dependency is not built yet, fall back to a root `pnpm build` once, then rerun the filtered package command.',
    GENERATED_END,
  ].join('\n');

  return ['# HAVE SDK', '', generatedBlock, ''].join('\n');
}

function buildManifest({
  rootPackage,
  packageCount,
  catalogPackages,
  packages,
}) {
  const relationships = [];

  for (const pkg of packages) {
    for (const dependency of pkg.requires.workspace) {
      relationships.push({
        type: 'requires',
        from: pkg.packageName,
        to: dependency,
      });
    }

    for (const implementation of pkg.implements) {
      relationships.push({
        type: 'implements',
        from: pkg.packageName,
        to: implementation,
      });
    }

    for (const capability of pkg.provides) {
      relationships.push({
        type: 'provides',
        from: pkg.packageName,
        to: capability,
      });
    }
  }

  return {
    schemaVersion: 1,
    workspace: {
      name: rootPackage.name,
      path: '.',
      packageCount,
      localPackageOrder: packages.map((pkg) => pkg.shortName),
      externalCatalogPackages: catalogPackages,
    },
    packages: packages.map((pkg) => ({
      name: pkg.packageName,
      shortName: pkg.shortName,
      path: `packages/${pkg.shortName}`,
      docs: {
        agent: `packages/${pkg.shortName}/AGENT.md`,
        metadata: `packages/${pkg.shortName}/metadata.json`,
      },
      position: pkg.position,
      description: pkg.description,
      commands: pkg.commands,
      correctionLoops: pkg.correctionLoops,
      provides: pkg.provides,
      implements: pkg.implements,
      requires: pkg.requires,
      dependents: pkg.dependents,
      stability: pkg.stability,
      keywords: pkg.keywords,
    })),
    relationships,
  };
}

async function readIfExists(filePath) {
  if (!existsSync(filePath)) return '';
  return readFile(filePath, 'utf8');
}

async function writeTextFile(filePath, nextContent) {
  const normalized = nextContent.endsWith('\n')
    ? nextContent
    : `${nextContent}\n`;
  const current = await readIfExists(filePath);

  if (current === normalized) return;

  changedPaths.push(filePath);
  if (!checkMode) {
    await writeFile(filePath, normalized, 'utf8');
  }
}

async function writeJsonFile(filePath, value) {
  await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function removeIfExists(filePath) {
  if (!existsSync(filePath)) return;

  changedPaths.push(filePath);
  if (!checkMode) {
    await rm(filePath);
  }
}

async function loadPackages() {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const packageDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const packages = [];

  for (const shortName of packageDirs) {
    const packageDir = join(packagesDir, shortName);
    const packageJsonPath = join(packageDir, 'package.json');
    if (!existsSync(packageJsonPath)) continue;

    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    const claudeText = await readIfExists(join(packageDir, 'CLAUDE.md'));
    const agentText = await readIfExists(join(packageDir, 'AGENT.md'));
    const existingMetadata = loadLegacyMeta(
      await readIfExists(join(packageDir, 'metadata.json')),
    );
    const legacyMeta = loadLegacyMeta(
      await readIfExists(join(packageDir, '.claude-meta.json')),
    );
    const sourceMetadata = existingMetadata ?? legacyMeta;

    const sourceDoc = agentText || claudeText;
    const parsedDoc = parseMarkdownSections(sourceDoc);
    const description =
      sanitizeInlineMarkdown(
        sourceMetadata?.description || firstParagraph(parsedDoc.intro),
      ) ||
      packageJson.description ||
      `${packageJson.name} package`;

    const dependencies = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.peerDependencies ?? {}),
      ...(packageJson.optionalDependencies ?? {}),
    };

    const requiresWorkspace = Object.keys(dependencies)
      .filter((dependency) => dependency.startsWith('@happyvertical/'))
      .sort();
    const requiresExternalHappyVertical = requiresWorkspace.filter(
      (dependency) =>
        !existsSync(
          join(packagesDir, dependency.replace('@happyvertical/', '')),
        ),
    );
    const localWorkspaceDependencies = requiresWorkspace.filter((dependency) =>
      existsSync(join(packagesDir, dependency.replace('@happyvertical/', ''))),
    );

    const externalDependencies = Object.keys(dependencies)
      .filter((dependency) => !dependency.startsWith('@happyvertical/'))
      .sort();

    packages.push({
      shortName,
      packageName: packageJson.name,
      description,
      scripts: packageJson.scripts ?? {},
      legacyMeta: sourceMetadata,
      docText: sourceDoc,
      notes: extractLegacyNotes(sourceDoc),
      sections: parsedDoc.sections,
      keywords: unique([
        ...(sourceMetadata?.keywords ?? []),
        ...shortName.split('-'),
      ]),
      requires: {
        workspace: localWorkspaceDependencies,
        externalHappyVertical: requiresExternalHappyVertical,
        external: externalDependencies,
      },
    });
  }

  const packageCount = packages.length;
  const dependentsMap = new Map(packages.map((pkg) => [pkg.packageName, []]));

  for (const pkg of packages) {
    for (const dependency of pkg.requires.workspace) {
      const dependents = dependentsMap.get(dependency);
      if (dependents) dependents.push(pkg.packageName);
    }
  }

  return packages.map((pkg, index) => {
    const provides = extractProvides({
      description: pkg.description,
      sections: pkg.sections,
      legacyMeta: pkg.legacyMeta,
    });
    const implementsValues = unique([
      ...extractImplements(pkg.sections),
      ...(pkg.legacyMeta?.keyExports?.tools ?? []).map((tool) => tool.name),
    ]);
    const stability = inferStability(pkg.docText);
    const commands = buildPackageCommands(pkg);
    const dependents = unique(
      (dependentsMap.get(pkg.packageName) ?? []).sort(),
    );
    const correctionLoops = buildCorrectionLoops(
      { ...pkg, dependents },
      commands,
    );

    return {
      ...pkg,
      position: {
        index: index + 1,
        count: packageCount,
      },
      provides,
      implements: implementsValues,
      stability,
      commands,
      dependents,
      correctionLoops,
    };
  });
}

async function main() {
  const rootPackage = JSON.parse(
    await readFile(join(rootDir, 'package.json'), 'utf8'),
  );
  const workspaceYaml = await readFile(
    join(rootDir, 'pnpm-workspace.yaml'),
    'utf8',
  );
  const rootSource = await readIfExists(rootAgentPath);
  const rootDescription =
    sanitizeInlineMarkdown(
      firstParagraph(parseMarkdownSections(rootSource).intro),
    ) || rootPackage.description;
  const rootNotes = extractLegacyNotes(rootSource);
  const packages = await loadPackages();
  const catalogPackages = parseCatalogPackageNames(workspaceYaml);

  const rootAgent = renderRootAgent({
    rootDescription,
    packageCount: packages.length,
    catalogPackages,
    packages,
  });
  const rootAgentWithNotes = [
    rootAgent.trimEnd(),
    rootNotes ? `\n\n${rootNotes}` : '',
    '',
  ].join('');

  await writeTextFile(rootAgentPath, rootAgentWithNotes);

  for (const pkg of packages) {
    const packageDir = join(packagesDir, pkg.shortName);
    const agentPath = join(packageDir, 'AGENT.md');
    const claudePath = join(packageDir, 'CLAUDE.md');
    const legacyMetaPath = join(packageDir, '.claude-meta.json');
    const metadataPath = join(packageDir, 'metadata.json');

    await writeTextFile(agentPath, renderPackageAgent(pkg));
    await writeJsonFile(metadataPath, {
      name: pkg.packageName,
      path: `packages/${pkg.shortName}`,
      position: pkg.position,
      description: pkg.description,
      provides: pkg.provides,
      implements: pkg.implements,
      requires: pkg.requires,
      dependents: pkg.dependents,
      stability: pkg.stability,
      keywords: pkg.keywords,
    });

    await removeIfExists(claudePath);
    await removeIfExists(legacyMetaPath);
  }

  await writeJsonFile(
    manifestPath,
    buildManifest({
      rootPackage,
      packageCount: packages.length,
      catalogPackages,
      packages,
    }),
  );

  if (checkMode && changedPaths.length > 0) {
    console.error('Agent context files are out of date:');
    for (const filePath of changedPaths.sort()) {
      console.error(
        `- ${basename(filePath) === filePath ? filePath : filePath.replace(`${rootDir}/`, '')}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  if (!checkMode) {
    console.log(`Synced agent context for ${packages.length} packages.`);
  }
}

await main();
