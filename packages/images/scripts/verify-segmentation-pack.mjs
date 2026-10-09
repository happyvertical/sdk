import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(packageDir, 'segmentation-assets');
const tempDir = await mkdtemp(join(tmpdir(), 'happyvertical-images-pack-'));

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' });
}

try {
  await rm(assetsDir, { recursive: true, force: true });
  const packOutput = run('pnpm', ['pack', '--json', '--pack-destination', tempDir], packageDir);
  const packed = JSON.parse(packOutput);
  const tarball = isAbsolute(packed.filename)
    ? packed.filename
    : join(tempDir, basename(packed.filename));
  const contents = run('tar', ['-tzf', tarball], packageDir);
  for (const asset of [
    'face_landmarker.task',
    'selfie_multiclass_256x256.tflite',
    'vision_wasm_internal.wasm',
    'vision_wasm_nosimd_internal.wasm',
  ]) {
    if (!contents.includes(`package/segmentation-assets/${asset}`)) {
      throw new Error(`Packed segmentation asset is missing: ${asset}`);
    }
  }

  await writeFile(
    join(tempDir, 'package.json'),
    '{"private":true,"type":"module"}\n',
  );
  await writeFile(join(tempDir, '.npmrc'), 'ignore-scripts=true\n');
  run('pnpm', ['add', tarball], tempDir);
  const installedAsset = join(
    tempDir,
    'node_modules/@happyvertical/images/segmentation-assets/face_landmarker.task',
  );
  if (!existsSync(installedAsset)) {
    throw new Error('Installed consumer package is missing face_landmarker.task');
  }
  const resolved = run(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "import { segmentationAssetPath } from '@happyvertical/images/segmentation-assets'; import { existsSync } from 'node:fs'; if (!existsSync(segmentationAssetPath('face_landmarker.task'))) process.exit(1);",
    ],
    tempDir,
  );
  if (resolved) process.stdout.write(resolved);
  console.log('Verified clean packed and installed segmentation assets.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
