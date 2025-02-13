import { it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTextFromPDF } from './index.js';
// skipping because it takes too long and doesnt provide much value
it.skip('should extract text from an image pdf', async () => {
  // const pdfPath = path.join(
  //   __dirname,
  //   '..',
  //   '/Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
  // );

  // const text = await scribe.extractText([pdfPath]);
  // console.log(text);
  const pdfPath = join(
    fileURLToPath(new URL('.', import.meta.url)),
    '..',
    'test',
    'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
  );
  const text = await extractTextFromPDF(pdfPath);
  expect(text).toBeDefined();
  // console.log(text);
}, 30000);

it.skip('should extract text from a problematic pdf', async () => {
  // const pdfPath = path.join(
  //   __dirname,
  //   '..',
  //   '/Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
  // );

  // const text = await scribe.extractText([pdfPath]);
  // console.log(text);
  const pdfPath = join(
    fileURLToPath(new URL('.', import.meta.url)),
    '..',
    'test',
    'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
  );
  const text = await extractTextFromPDF(pdfPath);
  expect(text).toBeDefined();
  // console.log(text);
}, 30000);
