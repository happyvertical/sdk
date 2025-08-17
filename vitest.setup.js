import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
export const TMP_DIR = path.resolve(`${tmpdir()}/.have-sdk/tests`);
export async function setup() {
    try {
        await fs.mkdir(TMP_DIR, { recursive: true });
        console.log('Test setup complete');
    }
    catch (error) {
        console.error('Error in test setup', error);
    }
    finally {
        // cleanup
    }
}
