import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

// Publish credentials live only in the main-only `release` environment
// (happyvertical/iac#2165): a pull_request run executes the PR's own workflow
// files, so any repository or organisation secret is readable by PR code.
const PUBLISH_SECRET = /secrets\.(NPM_HAPPYVERTICAL_PUBLISH_TOKEN|NPM_TOKEN)\b/;
const workflowDir = new URL('../.github/workflows/', import.meta.url);

function allWorkflows() {
  return readdirSync(workflowDir, { recursive: true })
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => ({
      file: f,
      source: readFileSync(new URL(f, workflowDir), 'utf8'),
    }));
}

function jobsOf(source) {
  const start = source.search(/^jobs:\s*$/m);
  if (start < 0) return [];
  const body = source.slice(start).replace(/^jobs:\s*\n/, '');
  return body
    .split(/^(?=  [A-Za-z_][\w-]*:\s*$)/m)
    .filter((chunk) => /^  [A-Za-z_][\w-]*:\s*$/m.test(chunk));
}

test('every job that reads a publish token runs in the release environment', () => {
  let seen = 0;
  for (const { file, source } of allWorkflows()) {
    for (const chunk of jobsOf(source)) {
      if (!PUBLISH_SECRET.test(chunk)) continue;
      // A job that calls a reusable workflow only forwards the secret; the
      // environment is declared on the called job that uses it.
      if (/^    uses: /m.test(chunk)) continue;
      seen += 1;
      const id = chunk.split('\n', 1)[0].trim();
      assert.match(
        chunk,
        /^    environment: release$/m,
        `${file} job ${id} reads a publish secret and must declare environment: release`,
      );
      assert.match(
        chunk,
        /github\.ref == 'refs\/heads\/main'/,
        `${file} job ${id} must be skipped outside main`,
      );
    }
  }
  assert.ok(seen >= 5, 'publish.yml publish jobs must be found');
});

test('no pull_request, pull_request_target or merge_group workflow references a publish secret', () => {
  for (const { file, source } of allWorkflows()) {
    const head = source.slice(0, source.search(/^jobs:\s*$/m));
    if (!/^\s+(pull_request|pull_request_target|merge_group):|^on:.*(pull_request|merge_group)/m.test(head)) {
      continue;
    }
    assert.doesNotMatch(source, PUBLISH_SECRET, `${file} must not reference a publish secret`);
  }
});
