#!/usr/bin/env node
/**
 * Build guard: the core entry (`dist/index.js`) and every module it can reach,
 * statically or through dynamic `import()`, must never reference the optional
 * `@huggingface/transformers` peer. Bundlers resolve dynamic imports too, so a
 * reachable reference would break apps that did not install the peer.
 *
 * Also asserts the `./local` entry does reference it, so the check cannot pass
 * vacuously.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PEER = '@huggingface/transformers';
const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const RELATIVE_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{1,2}\/[^"']+)\1/g;

/** Returns every dist module reachable from `entry`. */
function reachableModules(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(RELATIVE_SPECIFIER)) {
      const target = resolve(dirname(file), match[2]);
      if (existsSync(target)) queue.push(target);
    }
  }
  return [...seen];
}

function referencesPeer(file) {
  return readFileSync(file, 'utf8').includes(PEER);
}

const coreEntry = resolve(distDir, 'index.js');
const localEntry = resolve(distDir, 'local.js');
for (const entry of [coreEntry, localEntry]) {
  if (!existsSync(entry)) {
    console.error(`check-core-isolation: missing ${relative(distDir, entry)}`);
    process.exit(1);
  }
}

const leaks = reachableModules(coreEntry).filter(referencesPeer);
if (leaks.length > 0) {
  console.error(
    `check-core-isolation: the core entry reaches ${PEER} through:\n` +
      leaks.map((file) => `  dist/${relative(distDir, file)}`).join('\n'),
  );
  process.exit(1);
}

if (!reachableModules(localEntry).some(referencesPeer)) {
  console.error(
    `check-core-isolation: dist/local.js no longer references ${PEER}; update this check`,
  );
  process.exit(1);
}

console.log(`check-core-isolation: core entry does not reference ${PEER}`);
