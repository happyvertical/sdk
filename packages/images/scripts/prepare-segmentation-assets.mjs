/** Explicit optional download; all model bytes are pinned and verified. Never reads user images. */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, 'segmentation-assets');
await mkdir(destination, { recursive: true });
const name = 'selfie_multiclass_256x256.tflite';
const expected = 'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0';
const maxBytes = 17_500_000;
async function readBounded(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) { await response.body?.cancel(); throw new Error('Model download exceeds the byte limit; please retry.'); }
  if (!response.body) throw new Error('Model download has no body; please retry.');
  const reader = response.body.getReader(), chunks = []; let total = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > maxBytes) { await reader.cancel(); throw new Error('Model download exceeds the byte limit; please retry.'); } chunks.push(next.value); } } finally { reader.releaseLock(); }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), total);
}
let bytes = await readFile(resolve(destination, name)).catch(() => null);
if (!bytes || createHash('sha256').update(bytes).digest('hex') !== expected) {
  const response = await fetch(`https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/${name}`);
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  bytes = await readBounded(response);
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Model digest mismatch');
  await writeFile(resolve(destination, name), bytes);
}
const runtime = dirname(fileURLToPath(import.meta.resolve('@mediapipe/tasks-vision')));
for (const asset of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  await copyFile(resolve(runtime, 'wasm', asset), resolve(destination, asset));
}
console.log('Prepared pinned Apache-2.0 segmentation model and MediaPipe WASM assets.');
