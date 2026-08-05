import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  extractRunnerLabels,
  findRetiredRunnerLabels,
  isRetiredRunnerLabel,
} from './validate-workflow-runners.mjs';

const WORKFLOWS_DIR = fileURLToPath(
  new URL('../.github/workflows', import.meta.url),
);

test('flags exactly the retired GitHub-hosted runner labels', () => {
  for (const retired of [
    'macos-11',
    'macos-12',
    'macos-13',
    'macos-13-xlarge',
    'ubuntu-18.04',
    'ubuntu-20.04',
    'windows-2016',
    'windows-2019',
  ]) {
    assert.equal(isRetiredRunnerLabel(retired), true, retired);
  }
  for (const live of [
    'macos-14',
    'macos-15',
    'macos-15-intel',
    'macos-26',
    'ubuntu-22.04',
    'ubuntu-24.04',
    'ubuntu-latest',
    'windows-2022',
    'windows-2025',
    'arc-happyvertical',
    'self-hosted',
  ]) {
    assert.equal(isRetiredRunnerLabel(live), false, live);
  }
});

test('extracts runs-on scalars, flow lists, and matrix os entries', () => {
  const source = [
    'jobs:',
    '  a:',
    '    runs-on: ubuntu-24.04',
    '  b:',
    '    runs-on: [self-hosted, arc-happyvertical]',
    '  c:',
    '    runs-on: ${{ matrix.os }}',
    '    strategy:',
    '      matrix:',
    '        include:',
    '          - os: macos-13',
    '            target: x86_64-apple-darwin',
    '          - os: "macos-15-intel"',
  ].join('\n');
  assert.deepEqual(extractRunnerLabels(source), [
    { line: 3, label: 'ubuntu-24.04' },
    { line: 5, label: 'self-hosted' },
    { line: 5, label: 'arc-happyvertical' },
    { line: 11, label: 'macos-13' },
    { line: 13, label: 'macos-15-intel' },
  ]);
});

test('extracts flow-list matrix os, inline comments, and block runs-on', () => {
  const source = [
    'jobs:',
    '  a:',
    '    strategy:',
    '      matrix:',
    '        os: [macos-13, "macos-15-intel"]',
    '    runs-on: ${{ matrix.os }}',
    '  b:',
    '    runs-on: macos-13 # keep pinned for now',
    '  c:',
    '    runs-on:',
    '      - self-hosted',
    '      - windows-2019',
    '    steps:',
    '      - run: echo done',
  ].join('\n');
  assert.deepEqual(extractRunnerLabels(source), [
    { line: 5, label: 'macos-13' },
    { line: 5, label: 'macos-15-intel' },
    { line: 8, label: 'macos-13' },
    { line: 11, label: 'self-hosted' },
    { line: 12, label: 'windows-2019' },
  ]);
});

test('repository workflows reference no retired runner labels', () => {
  assert.deepEqual(findRetiredRunnerLabels(WORKFLOWS_DIR), []);
});
