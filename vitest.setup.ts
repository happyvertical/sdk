import { ensureDirectoryExists } from '@have/files';
import { TMP_DIR } from '@have/utils';
export async function setup() {
  try {
    await ensureDirectoryExists(TMP_DIR);
    console.log('Test setup complete');
  } catch (error) {
    console.error('Error in test setup', error);
  } finally {
    // cleanup
  }
}
