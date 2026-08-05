/**
 * Detects retired GitHub-hosted runner labels in workflow files.
 *
 * The `Validate Workflow Files` CI job lints with a freshly downloaded
 * actionlint, which fails the run when a workflow references a runner label
 * GitHub has retired (for example `macos-13`). A retired label also means the
 * job can never schedule. This module provides the dependency-free check used
 * by `validate-workflow-runners.test.mjs` so the failure is caught by
 * `pnpm test:ci-scripts` before a workflow edit reaches CI.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GitHub-hosted runner labels that have been retired. A label counts as
 * retired when it equals one of these or extends one with a variant suffix
 * (for example `macos-13-xlarge`).
 */
export const RETIRED_RUNNER_LABELS = [
  'macos-11',
  'macos-12',
  'macos-13',
  'ubuntu-18.04',
  'ubuntu-20.04',
  'windows-2019',
];

/**
 * Returns true when `label` is a retired GitHub-hosted runner label.
 *
 * @param {string} label runner label candidate
 * @returns {boolean}
 */
export function isRetiredRunnerLabel(label) {
  return RETIRED_RUNNER_LABELS.some(
    (retired) => label === retired || label.startsWith(`${retired}-`),
  );
}

/**
 * Extracts runner label references from workflow YAML source. Handles
 * `runs-on:` scalars/flow lists and matrix `- os:` entries. Values containing
 * `${{` expressions are skipped because they are not static labels.
 *
 * @param {string} source workflow file contents
 * @returns {Array<{ line: number, label: string }>}
 */
export function extractRunnerLabels(source) {
  const found = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index];
    const runsOn = text.match(/^\s*runs-on:\s*(.+?)\s*$/);
    if (runsOn) {
      const raw = runsOn[1];
      const labels = raw.startsWith('[')
        ? raw
            .slice(1, raw.indexOf(']') === -1 ? undefined : raw.indexOf(']'))
            .split(',')
            .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        : [raw.replace(/^['"]|['"]$/g, '')];
      for (const label of labels) {
        if (label && !label.includes('${{')) {
          found.push({ line: index + 1, label });
        }
      }
    }
    const matrixOs = text.match(/^\s*-?\s*os:\s*(.+?)\s*$/);
    if (matrixOs) {
      const label = matrixOs[1].replace(/^['"]|['"]$/g, '');
      if (label && !label.includes('${{')) {
        found.push({ line: index + 1, label });
      }
    }
  }
  return found;
}

/**
 * Scans every workflow file under `workflowsDir` and returns one finding per
 * retired runner label reference.
 *
 * @param {string} workflowsDir absolute path to `.github/workflows`
 * @returns {Array<{ file: string, line: number, label: string }>}
 */
export function findRetiredRunnerLabels(workflowsDir) {
  const findings = [];
  const files = readdirSync(workflowsDir).filter((name) =>
    /\.(yml|yaml)$/.test(name),
  );
  for (const name of files) {
    const source = readFileSync(join(workflowsDir, name), 'utf8');
    for (const hit of extractRunnerLabels(source)) {
      if (isRetiredRunnerLabel(hit.label)) {
        findings.push({ file: name, line: hit.line, label: hit.label });
      }
    }
  }
  return findings;
}
