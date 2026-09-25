#!/usr/bin/env node
// Mirrors SDK releases from our primary registry to npmjs (#1266).
//
// A release is complete once it is on the primary. This job is a separate,
// best-effort, idempotent follow-up that never fails the release, but it must
// never claim success it did not achieve either: happyvertical/smrt's mirror
// reported green while npmjs fell eleven releases behind (smrt#3086). So the
// result here is decided by the END STATE of npmjs, re-read after publishing,
// not by whether each publish call returned without error:
//   status=complete      every package's newest primary version is on npmjs
//   status=not-mirrored  anything else, with each gap listed
// The workflow turns `not-mirrored` into a red (continue-on-error) job, an
// error annotation, and a step summary headed "NOT MIRRORED".
//
// Like smrt's mirror it publishes the EXACT tarball the primary serves (so
// lockfile integrity matches across registries) and works from the
// difference between the registries, so a mirror that failed while npmjs was
// unavailable is repaired by a later run without a version bump.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverExpectedPackages } from './publish-artifacts-lib.mjs';
import { NPMJS_REGISTRY, normalizeRegistry, primaryRegistry, registryArgs } from './release-registry.mjs';

function npm(args, { allowNotFound = false } = {}) {
  const result = spawnSync('npm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (allowNotFound && /E404|404 Not Found/.test(result.stderr)) return null;
    throw new Error(result.stderr.trim() || `npm ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function newest(versions) {
  return versions.filter(parseVersion).sort(compareVersions).at(-1);
}

// `npm view <name> versions --json` prints a bare string for a package with
// exactly one version and an array otherwise. A 404 means the package does
// not exist on that registry ("no versions"); any other failure throws, and
// the caller must never mistake an unreadable registry for an empty one.
function listVersions(name, registry, runNpm) {
  const raw = runNpm(['view', name, 'versions', '--json', ...registryArgs(registry), '--prefer-online'], {
    allowNotFound: true,
  });
  if (raw === null || raw === '') return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function isPermanentlyRejected(message) {
  return /cannot publish over (the )?previously published version|cannot be republished/i.test(message);
}

// npm prints `npm notice` tarball details (and `npm warn` lines) before the
// real failure, so the first stderr line is usually not the reason (#1272).
// Prefer the first `npm error` / `npm ERR!` / `E<status>` line, then the first
// line that is not a notice or warning, then the first line.
function firstLine(error) {
  const lines = (error instanceof Error ? error.message : String(error))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    lines.find((line) => /^npm (error|ERR!)\s/i.test(line) || /\bE\d{3}\b/.test(line)) ??
    lines.find((line) => !/^npm (notice|warn|WARN)\b/.test(line)) ??
    lines[0] ??
    ''
  );
}

async function downloadTarball({ spec, primary, runNpm, fetchImpl }) {
  const meta = JSON.parse(runNpm(['view', spec, 'dist', '--json', ...registryArgs(primary), '--prefer-online']));
  // The primary proxies npmjs; never publish bytes fetched from anywhere else.
  if (new URL(meta.tarball).origin !== new URL(primary).origin) {
    throw new Error(`primary reports a tarball outside itself for ${spec}: ${meta.tarball}`);
  }
  const response = await fetchImpl(meta.tarball, { redirect: 'manual', signal: AbortSignal.timeout(120_000) });
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`the primary redirected the download of ${spec} (HTTP ${response.status}); refusing to follow it`);
  }
  if (!response.ok) throw new Error(`downloading ${spec} from the primary failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const shasum = createHash('sha1').update(bytes).digest('hex');
  if (shasum !== meta.shasum) {
    throw new Error(`${spec} from the primary has sha1 ${shasum}, but its metadata says ${meta.shasum}`);
  }
  return bytes;
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export async function mirrorRelease({
  packages,
  primary = primaryRegistry(),
  mirror = NPMJS_REGISTRY,
  releaseVersion = process.env.MIRROR_RELEASE_VERSION || undefined,
  canPublish = Boolean(process.env.NODE_AUTH_TOKEN),
  runNpm = npm,
  fetchImpl = fetch,
  log = console.log,
  wait = sleep,
  verifyAttempts = 6,
  verifyDelayMs = 10_000,
  workDir = mkdtempSync(join(tmpdir(), 'npm-mirror-')),
} = {}) {
  const source = normalizeRegistry(primary);
  const target = normalizeRegistry(mirror);
  const result = { status: 'complete', mirrored: [], skipped: [], notMirrored: [] };
  if (source === target) {
    log(`Primary and mirror are both ${source}; nothing to mirror.`);
    return result;
  }

  // name -> newest primary version that npmjs must end up holding.
  const expected = new Map();
  const failedPackages = new Set();
  const fail = (name, message) => {
    failedPackages.add(name);
    result.notMirrored.push(message);
  };

  try {
    for (const name of packages) {
      let onPrimary;
      let onMirror;
      try {
        onPrimary = listVersions(name, source, runNpm);
        onMirror = listVersions(name, target, runNpm);
      } catch (error) {
        fail(name, `${name}: could not read versions (${firstLine(error)})`);
        continue;
      }
      const primaryNewest = newest(onPrimary);
      if (!primaryNewest) continue;
      expected.set(name, primaryNewest);

      const have = new Set(onMirror);
      // Same version, different bytes on the two registries breaks lockfiles
      // resolved against the other one; it can never be reconciled, only
      // superseded by a new version.
      if (releaseVersion && have.has(releaseVersion) && onPrimary.includes(releaseVersion)) {
        try {
          const spec = `${name}@${releaseVersion}`;
          const [a, b] = [source, target].map((registry) =>
            runNpm(['view', spec, 'dist.shasum', ...registryArgs(registry), '--prefer-online']));
          if (a !== b) fail(name, `${spec}: DIVERGED (primary sha1 ${a}, npmjs sha1 ${b}); needs a new version`);
        } catch (error) {
          fail(name, `${name}@${releaseVersion}: could not compare checksums (${firstLine(error)})`);
        }
      }

      // Forward-only: the primary keeps what it cached from npmjs, so a
      // version npmjs deliberately removed can still be listed here. Only
      // versions newer than anything on npmjs can only have been released here.
      let highestOnMirror = newest(onMirror);
      const publishable = onPrimary
        .filter((version) => !have.has(version) && parseVersion(version))
        .filter((version) => !highestOnMirror || compareVersions(version, highestOnMirror) > 0)
        .sort(compareVersions);
      if (publishable.length === 0) continue;
      if (!canPublish) {
        fail(name, `${name}@${publishable.join(', ')}: NPM_TOKEN is unavailable, so nothing was published to npmjs`);
        continue;
      }

      for (const version of publishable) {
        const spec = `${name}@${version}`;
        try {
          const bytes = await downloadTarball({ spec, primary: source, runNpm, fetchImpl });
          const file = join(workDir, `${name.replace(/[@/]/g, '_')}-${version}.tgz`);
          writeFileSync(file, bytes);
          runNpm(['publish', file, ...registryArgs(target), '--access', 'public']);
          rmSync(file, { force: true });
          highestOnMirror = version;
          result.mirrored.push(spec);
          log(`Mirrored ${spec} to ${target}`);
        } catch (error) {
          const message = firstLine(error);
          if (isPermanentlyRejected(error instanceof Error ? error.message : String(error))) {
            // npmjs reserves an unpublished version forever; retrying cannot
            // help. An older one is skipped so later versions still mirror,
            // but if it is the newest, npmjs is genuinely behind: report it.
            const detail = `${spec}: npmjs permanently refuses this version (published there before and removed)`;
            if (expected.get(name) === version) fail(name, `${detail}; only a new version can fix npmjs`);
            else result.skipped.push(detail);
            continue;
          }
          fail(name, `${spec}: ${message}`);
          // Publishing later versions would move npmjs's `latest` past one
          // that is still missing; stop this package until the next run.
          break;
        }
      }
    }

    // Decide from npmjs's actual state, allowing for propagation delay.
    let pending = [...expected].filter(([name]) => !failedPackages.has(name));
    for (let attempt = 1; pending.length > 0; attempt += 1) {
      const still = [];
      for (const [name, version] of pending) {
        try {
          if (!listVersions(name, target, runNpm).includes(version)) still.push([name, version]);
        } catch (error) {
          still.push([name, version, firstLine(error)]);
        }
      }
      pending = still;
      if (pending.length === 0 || attempt >= verifyAttempts) break;
      log(`Waiting for npmjs to show ${pending.length} version(s) (attempt ${attempt}/${verifyAttempts})`);
      await wait(attempt * verifyDelayMs);
    }
    for (const [name, version, error] of pending) {
      result.notMirrored.push(`${name}@${version}: not on npmjs${error ? ` (${error})` : ''}`);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  if (result.notMirrored.length > 0) result.status = 'not-mirrored';
  return result;
}

export function reportMirror(result, { env = process.env, append = appendFileSync, log = console.log } = {}) {
  const complete = result.status === 'complete';
  log(`npmjs mirror: ${complete ? 'complete' : 'NOT MIRRORED'} `
    + `(${result.mirrored.length} mirrored, ${result.skipped.length} skipped, ${result.notMirrored.length} not mirrored)`);
  for (const item of result.notMirrored) log(`  not mirrored: ${item}`);
  if (!complete) {
    log(`::error title=npmjs mirror incomplete::NOT MIRRORED to npmjs: ${result.notMirrored.length} item(s). `
      + 'The release is complete on npm.happyvertical.com; the next release run (or a Publish workflow dispatch) retries.');
  }
  const list = (items) => items.map((item) => `- ${item}`).join('\n');
  const summary = [
    complete ? '\n### npmjs mirror: complete\n' : '\n### npmjs mirror: NOT MIRRORED\n',
    complete ? 'npmjs holds the newest primary version of every package.\n' : `\n${list(result.notMirrored)}\n`,
    result.mirrored.length ? `\n**Mirrored**\n\n${list(result.mirrored)}\n` : '',
    result.skipped.length ? `\n**Skipped**\n\n${list(result.skipped)}\n` : '',
  ].join('');
  try {
    if (env.GITHUB_STEP_SUMMARY) append(env.GITHUB_STEP_SUMMARY, summary);
    if (env.GITHUB_OUTPUT) append(env.GITHUB_OUTPUT, `status=${result.status}\n`);
  } catch (error) {
    log(`::warning::could not write mirror report: ${firstLine(error)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try {
    result = await mirrorRelease({ packages: discoverExpectedPackages(process.cwd()) });
  } catch (error) {
    result = { status: 'not-mirrored', mirrored: [], skipped: [], notMirrored: [`mirror run failed: ${firstLine(error)}`] };
  }
  reportMirror(result);
  // Exit 0 either way: the workflow's next step turns `not-mirrored` into a
  // visible failure of this (continue-on-error) job, never of the release.
}
