import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

// Publish credentials live only in the main-only `release` environment
// (happyvertical/iac#2165): a pull_request run executes the PR's own workflow
// files, so any repository or organisation secret is readable by PR code.
const PUBLISH_SECRET = /secrets\.(NPM_HAPPYVERTICAL_PUBLISH_TOKEN|NPM_TOKEN)\b/;
const workflowDir = new URL('../.github/workflows/', import.meta.url);

const templateDir = new URL('../.github/workflow-templates/', import.meta.url);

function allWorkflows() {
  return [workflowDir, templateDir].flatMap((dir) =>
    readdirSync(dir, { recursive: true })
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => ({
        file: f,
        source: readFileSync(new URL(f, dir), 'utf8'),
      })),
  );
}

function jobsOf(source) {
  const start = source.search(/^jobs:\s*$/m);
  if (start < 0) return [];
  const body = source.slice(start).replace(/^jobs:\s*\n/, '');
  return body
    .split(/^(?=  [A-Za-z_][\w-]*:\s*$)/m)
    .filter((chunk) => /^  [A-Za-z_][\w-]*:\s*$/m.test(chunk));
}

function jobCondition(chunk) {
  // The job-level `if:` only (4-space indent, plus its indented continuation
  // lines), never a step condition or a comment.
  const match = chunk.match(/^    if:(.*(?:\n {6,}.*)*)/m);
  return match ? match[1].replace(/#.*$/gm, '') : '';
}

function requiresMain(condition) {
  // No YAML parser is a root dependency here, so accept one canonical form
  // only: the literal main comparison as the FIRST operand, followed by the
  // end or a top-level `&&`, and no top-level `||`. Anything else (an
  // inverted or compared-again expression, an `||`, a prefix operand) fails.
  const text = condition
    .replace(/^\s*[|>][-+]?\s*/, '')
    .replace(/\$\{\{|\}\}/g, '')
    .trim();
  let depth = 0;
  let topLevel = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0) topLevel += ch;
  }
  return (
    /^github\.ref == 'refs\/heads\/main'(\s*&&|\s*$)/.test(text) &&
    !topLevel.includes('||')
  );
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
      assert.ok(
        requiresMain(jobCondition(chunk)),
        `${file} job ${id} must be skipped outside main by a job-level if`,
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

test('the main-ref check only counts when it is on the job-level if', () => {
  const guarded = "  j:\n    if: github.ref == 'refs/heads/main'\n    steps:\n";
  const stepOnly = "  j:\n    steps:\n      - if: github.ref == 'refs/heads/main'\n";
  const commentOnly = "  j:\n    # if: github.ref == 'refs/heads/main'\n    if: true\n";
  assert.match(jobCondition(guarded), /refs\/heads\/main/);
  assert.doesNotMatch(jobCondition(stepOnly), /refs\/heads\/main/);
  assert.doesNotMatch(jobCondition(commentOnly), /refs\/heads\/main/);
  assert.ok(requiresMain(jobCondition(guarded)));
  assert.ok(
    requiresMain(
      jobCondition("  j:\n    if: |\n      github.ref == 'refs/heads/main' &&\n      (a == 1 || b == 2)\n"),
    ),
  );
  const offMain = "  j:\n    if: github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'\n";
  assert.ok(!requiresMain(jobCondition(offMain)));
  for (const bad of [
    "github.ref == 'refs/heads/main' == false",
    "${{ github.ref == 'refs/heads/main' == false }}",
    "always() && github.ref == 'refs/heads/main'",
    "!(github.ref == 'refs/heads/main')",
    "github.ref == 'refs/heads/main' || true",
    "github.ref != 'refs/heads/main'",
  ]) {
    assert.ok(!requiresMain(bad), bad);
  }
  assert.ok(requiresMain("${{ github.ref == 'refs/heads/main' && !inputs.dry-run }}"));
});
