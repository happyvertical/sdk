import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'validate-workspace-consistency.js',
);

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createWorkspace({ docs, packages }) {
  const root = mkdtempSync(join(tmpdir(), 'sdk-workspace-consistency-'));
  mkdirSync(join(root, '.changeset'));
  writeJson(join(root, '.changeset', 'config.json'), {
    fixed: [['@happyvertical/*']],
    updateInternalDependencies: 'patch',
  });
  writeJson(join(root, 'package.json'), {
    name: 'sdk-workspace',
    private: true,
  });

  if (docs) {
    mkdirSync(join(root, 'docs'));
    writeJson(join(root, 'docs', 'package.json'), docs);
  }

  for (const [directory, manifest] of Object.entries(packages)) {
    const packageDirectory = join(root, 'packages', directory);
    mkdirSync(packageDirectory, { recursive: true });
    writeJson(join(packageDirectory, 'package.json'), manifest);
  }

  return root;
}

function validateWorkspace(root) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('published version alignment ignores private workspaces', () => {
  const root = createWorkspace({
    docs: {
      name: '@happyvertical/docs',
      version: '0.78.0',
      private: true,
    },
    packages: {
      files: {
        name: '@happyvertical/files',
        version: '0.78.1',
      },
    },
  });

  try {
    const result = validateWorkspace(root);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /published internal package versions are aligned/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('private workspaces still enforce internal workspace dependency specs', () => {
  const root = createWorkspace({
    docs: {
      name: '@happyvertical/docs',
      version: '0.78.0',
      private: true,
      dependencies: {
        '@happyvertical/files': '^0.78.1',
      },
    },
    packages: {
      files: {
        name: '@happyvertical/files',
        version: '0.78.1',
      },
    },
  });

  try {
    const result = validateWorkspace(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /docs\/package\.json: dependencies\.@happyvertical\/files must use "workspace:\*"/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('published version alignment still rejects public workspace drift', () => {
  const root = createWorkspace({
    packages: {
      files: {
        name: '@happyvertical/files',
        version: '0.78.1',
      },
      sql: {
        name: '@happyvertical/sql',
        version: '0.78.0',
      },
    },
  });

  try {
    const result = validateWorkspace(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Published @happyvertical workspace packages must share one version/,
    );
    assert.match(result.stderr, /@happyvertical\/files -> 0\.78\.1/);
    assert.match(result.stderr, /@happyvertical\/sql -> 0\.78\.0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
