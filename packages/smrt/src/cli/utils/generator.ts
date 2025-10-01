/**
 * Template Generator Utilities
 *
 * Handles template instantiation:
 * - Run base generators (SvelteKit, Next.js, etc.)
 * - Overlay template files
 * - Merge package.json dependencies
 */

import { spawn } from 'node:child_process';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import glob from 'fast-glob';
import type { TemplateConfig, TemplateSource } from '../loaders/index.js';

export interface GeneratorOptions {
  template: string;
  name: string;
  outputDir: string;
}

/**
 * Generate project from template
 */
export async function generate(
  source: TemplateSource,
  config: TemplateConfig,
  options: GeneratorOptions,
): Promise<void> {
  console.log(`\n🏗️  Creating gnode: ${options.name}`);
  console.log(`📦 Using template: ${config.name} (${config.description})\n`);

  // Step 1: Run base generator if specified
  if (config.baseGenerator) {
    console.log(`📝 Running base generator (${config.framework})...`);
    await runBaseGenerator(config.baseGenerator, options.outputDir);
  } else {
    // Create directory if no base generator
    await mkdir(options.outputDir, { recursive: true });
  }

  // Step 2: Overlay template files
  console.log('📋 Copying template files...');
  await overlayTemplate(source, config, options.outputDir);

  // Step 3: Merge package.json
  console.log('🔧 Configuring package.json...');
  await mergePackageJson(options.outputDir, config, options.name);

  console.log('\n✅ Gnode created successfully!');
  console.log(`\n📍 Next steps:`);
  console.log(`   cd ${options.name}`);
  console.log(`   pnpm install`);
  console.log(`   pnpm dev\n`);
}

/**
 * Run base project generator (e.g., create-svelte, create-next-app)
 */
async function runBaseGenerator(
  baseGen: NonNullable<TemplateConfig['baseGenerator']>,
  outputDir: string,
): Promise<void> {
  const args = baseGen.args.map((arg) => arg.replace('{DIR}', outputDir));

  return new Promise((resolve, reject) => {
    const proc = spawn(baseGen.command, args, {
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Base generator exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Overlay template files onto generated project
 */
async function overlayTemplate(
  source: TemplateSource,
  config: TemplateConfig,
  outputDir: string,
): Promise<void> {
  // Determine overlay directory based on source type
  let overlayDir: string;

  switch (source.type) {
    case 'npm':
      overlayDir = join(dirname(source.resolved), 'overlay');
      break;
    case 'git': {
      // For git templates, the temp directory is stored in config
      const tempDir = (config as any).__tempDir;
      if (!tempDir) {
        throw new Error('Git template temp directory not found');
      }
      overlayDir = join(tempDir, 'overlay');
      break;
    }
    case 'local':
      overlayDir = join(source.resolved, 'overlay');
      break;
    default:
      throw new Error(`Unknown source type: ${source.type}`);
  }

  // Find all files in overlay directory
  const files = await glob('**/*', {
    cwd: overlayDir,
    dot: true,
    onlyFiles: true,
  });

  // Copy each file
  for (const file of files) {
    const src = join(overlayDir, file);
    const dest = join(outputDir, file);

    // Ensure directory exists
    await mkdir(dirname(dest), { recursive: true });

    // Copy file
    await cp(src, dest);
  }
}

/**
 * Merge template dependencies into package.json
 */
async function mergePackageJson(
  outputDir: string,
  config: TemplateConfig,
  projectName: string,
): Promise<void> {
  const pkgPath = join(outputDir, 'package.json');

  let pkg: any;
  try {
    const content = await readFile(pkgPath, 'utf-8');
    pkg = JSON.parse(content);
  } catch {
    // If no package.json exists, create one
    pkg = {
      name: projectName,
      version: '0.1.0',
      private: true,
      scripts: {},
      dependencies: {},
      devDependencies: {},
    };
  }

  // Update name
  pkg.name = projectName;

  // Merge dependencies
  pkg.dependencies = {
    ...pkg.dependencies,
    ...config.dependencies,
  };

  pkg.devDependencies = {
    ...pkg.devDependencies,
    ...config.devDependencies,
  };

  // Add gnode-specific scripts if not present
  if (!pkg.scripts['workflow:research']) {
    pkg.scripts = {
      ...pkg.scripts,
      'workflow:research': 'tsx src/workflows/research.ts',
      'workflow:report': 'tsx src/workflows/report.ts',
    };
  }

  // Write back
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}
