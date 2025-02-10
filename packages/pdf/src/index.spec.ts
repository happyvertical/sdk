import { it, expect } from 'vitest';
import scribe from 'scribe.js-ocr';
import path from 'path';
import { extractTextFromPDF } from './index';
// skipping because it takes too long and doesnt provide much value
it.skip('should extract text from an image pdf', async () => {
  // const pdfPath = path.join(
  //   __dirname,
  //   '..',
  //   '/Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
  // );

  // const text = await scribe.extractText([pdfPath]);
  // console.log(text);
  const pdfPath = path.join(
    __dirname,
    '..',
    '/Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
  );
  const text = await extractTextFromPDF(pdfPath);
  // console.log(text);
}, 30000);
