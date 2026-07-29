import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(
  new URL(
    '../.github/actions/setup-environment/select-pnpm-store.sh',
    import.meta.url,
  ),
);

// Runner names observed serving the consolidated `arc-happyvertical` pool.
// The retired `arc-happyvertical-node-*` prefix matches none of them, which is
// what silently disabled persistent store reuse. Store selection must not
// consult the runner name at all.
const CONSOLIDATED_RUNNER_NAMES = [
  'landgraf-9175a7e5b7fc301f96cced3d',
  'landgraf-d089e2b07b8f3ffc99eab938',
  'patdown-jit-124ee1a96d100de58647a7be-runner',
  'patdown-jit-0f7aac129209b3507ec6bfee-runner',
];

function runScript(env) {
  const directory = mkdtempSync(join(tmpdir(), 'select-pnpm-store-'));
  const outputPath = join(directory, 'github-output');
  writeFileSync(outputPath, '');

  try {
    let status = 0;
    let stdout = '';

    try {
      stdout = execFileSync('bash', [script], {
        env: {
          HOME: '/home/runner',
          RUNNER_TEMP: '/runner/_temp',
          GITHUB_RUN_ID: '17',
          GITHUB_JOB: 'test',
          GITHUB_RUN_ATTEMPT: '2',
          GITHUB_OUTPUT: outputPath,
          ...env,
        },
        stdio: 'pipe',
        encoding: 'utf8',
      });
    } catch (error) {
      status = error.status;
      stdout = error.stdout ?? '';
    }

    const outputs = Object.fromEntries(
      readFileSync(outputPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );

    return { status, stdout, outputs };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function selectStore(env) {
  const result = runScript(env);
  assert.equal(result.status, 0, `script exited ${result.status}:\n${result.stdout}`);
  return result.outputs;
}

test('reuses the node-local persistent store whatever the runner is named', () => {
  for (const runnerName of CONSOLIDATED_RUNNER_NAMES) {
    assert.deepEqual(
      selectStore({
        RUNNER_ENVIRONMENT: 'self-hosted',
        RUNNER_NAME: runnerName,
        PNPM_STORE_DIR: '/opt/pnpm-store',
      }),
      { 'store-root': '/opt/pnpm-store', 'use-actions-cache': 'false' },
      `${runnerName} must select the persistent store`,
    );
  }
});

test('reuses the persistent store when the runner name is absent entirely', () => {
  assert.deepEqual(
    selectStore({
      RUNNER_ENVIRONMENT: 'self-hosted',
      PNPM_STORE_DIR: '/opt/pnpm-store',
    }),
    { 'store-root': '/opt/pnpm-store', 'use-actions-cache': 'false' },
  );
});

// PNPM_STORE_DIR is not part of the runner target contract, so a provider is
// free to stop exporting it. That must fail the job rather than quietly cost a
// cold store on every run — the silent-degradation shape this script exists to
// eliminate. See .github/CI.md.
test('fails the job when a self-hosted runner advertises no persistent store', () => {
  for (const env of [
    { RUNNER_ENVIRONMENT: 'self-hosted', RUNNER_NAME: 'patdown-jit-abc-runner' },
    // An exported-but-empty PNPM_STORE_DIR advertises nothing.
    { RUNNER_ENVIRONMENT: 'self-hosted', PNPM_STORE_DIR: '' },
    // An explicit opt-out of anything other than `true` is not an opt-out.
    {
      RUNNER_ENVIRONMENT: 'self-hosted',
      CI_ALLOW_EPHEMERAL_PNPM_STORE: 'false',
    },
    { RUNNER_ENVIRONMENT: 'self-hosted', CI_ALLOW_EPHEMERAL_PNPM_STORE: '' },
  ]) {
    const result = runScript(env);
    assert.equal(result.status, 1, `expected failure for ${JSON.stringify(env)}`);
    assert.match(result.stdout, /^::error::.*did not export PNPM_STORE_DIR/m);
    assert.deepEqual(result.outputs, {}, 'a failed selection must write no outputs');

    // The annotation is the whole user experience of this failure, so it must
    // name every way out, including the one that needs no infrastructure access.
    assert.match(result.stdout, /exporting PNPM_STORE_DIR/);
    assert.match(result.stdout, /allow-ephemeral-store: true/);
    assert.match(result.stdout, /CI_ALLOW_EPHEMERAL_PNPM_STORE=true/);
  }
});

test('accepts a cold per-job store only when explicitly allowed, and says so', () => {
  const result = runScript({
    RUNNER_ENVIRONMENT: 'self-hosted',
    RUNNER_NAME: 'patdown-jit-abc-runner',
    CI_ALLOW_EPHEMERAL_PNPM_STORE: 'true',
  });

  assert.equal(result.status, 0);
  assert.deepEqual(result.outputs, {
    'store-root': '/runner/_temp/pnpm-store-17-test-2',
    'use-actions-cache': 'false',
  });
  assert.match(result.stdout, /^::warning::.*did not export PNPM_STORE_DIR/m);
  assert.match(result.stdout, /because CI_ALLOW_EPHEMERAL_PNPM_STORE is set to true/);
});

test('the warning names the opt-out that actually applied', () => {
  // Auditing why a job accepted a cold store means following this message. If
  // it always blamed the environment variable, an input-driven opt-out would
  // send the reader looking for a variable the runner never set.
  const result = runScript({
    RUNNER_ENVIRONMENT: 'self-hosted',
    INPUT_ALLOW_EPHEMERAL_STORE: 'true',
  });

  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /because the allow-ephemeral-store input is set to true/,
  );
  assert.doesNotMatch(result.stdout, /because CI_ALLOW_EPHEMERAL_PNPM_STORE/);
});

test('allow-ephemeral-store input overrides the inherited environment', () => {
  const base = {
    RUNNER_ENVIRONMENT: 'self-hosted',
    RUNNER_NAME: 'patdown-jit-abc-runner',
  };

  // Input opts in over an environment that says otherwise.
  assert.equal(
    runScript({
      ...base,
      INPUT_ALLOW_EPHEMERAL_STORE: 'true',
      CI_ALLOW_EPHEMERAL_PNPM_STORE: 'false',
    }).status,
    0,
  );

  // Input opts out over an environment that says otherwise.
  assert.equal(
    runScript({
      ...base,
      INPUT_ALLOW_EPHEMERAL_STORE: 'false',
      CI_ALLOW_EPHEMERAL_PNPM_STORE: 'true',
    }).status,
    1,
  );

  // An unset input (the action's default) must not clobber the environment.
  assert.equal(
    runScript({
      ...base,
      INPUT_ALLOW_EPHEMERAL_STORE: '',
      CI_ALLOW_EPHEMERAL_PNPM_STORE: 'true',
    }).status,
    0,
  );
});

test('uses the hosted Actions cache on GitHub-hosted runners', () => {
  const expected = {
    'store-root': '/home/runner/.local/share/pnpm/store',
    'use-actions-cache': 'true',
  };

  assert.deepEqual(
    selectStore({
      RUNNER_ENVIRONMENT: 'github-hosted',
      RUNNER_NAME: 'GitHub Actions 4',
    }),
    expected,
  );

  // A hosted runner never owns a node-local store, so an inherited
  // PNPM_STORE_DIR must not divert the Actions-backed cache.
  assert.deepEqual(
    selectStore({
      RUNNER_ENVIRONMENT: 'github-hosted',
      PNPM_STORE_DIR: '/opt/pnpm-store',
    }),
    expected,
  );

  assert.deepEqual(selectStore({}), expected);

  // A hosted runner has no persistent store to lose, so the missing export is
  // not a fault there and must not fail the job.
  assert.deepEqual(
    selectStore({ RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_TEMP: '' }),
    expected,
  );
});
