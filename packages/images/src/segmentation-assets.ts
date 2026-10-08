/**
 * Returns the absolute path for one allowlisted optional local segmentation asset.
 *
 * @throws {Error} When `name` is not a known model or MediaPipe runtime asset.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = new Set([
  'selfie_multiclass_256x256.tflite',
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]);
export function segmentationAssetPath(name: string): string {
  if (!assets.has(name)) throw new Error('Unknown segmentation asset.');
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../segmentation-assets',
    name,
  );
}
