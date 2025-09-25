import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const TMP_DIR = path.resolve(`${tmpdir()}/.have-sdk/tests`);

export async function setup() {
  try {
    await fs.mkdir(TMP_DIR, { recursive: true });
    console.log('Test setup complete');
  } catch (error) {
    console.error('Error in test setup', error);
  } finally {
    // cleanup
  }
}
