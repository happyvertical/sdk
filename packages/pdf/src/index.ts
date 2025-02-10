import * as pdfJs from 'pdfjs-dist/legacy/build/pdf';
import scribe from 'scribe.js-ocr';

import fs from 'fs';

// Set up the worker
// pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker';

export async function extractImagesFromPDF(pdfPath: string): Promise<any[]> {
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfJs.getDocument(data);
    const pdf = await loadingTask.promise;

    const page = await pdf.getPage(1);
    const operatorList = await page.getOperatorList();

    const images: any[] = [];
    // Get all image keys and their corresponding objects
    console.log('page.commonObjs', page.commonObjs);
    const keys = page.commonObjs.getKeys();
    for (const key of keys) {
      if (key.startsWith('img_')) {
        const value = page.commonObjs.get(key);
        images.push(value);
      }
    }

    return images;
  } catch (error) {
    console.error('Error extracting images:', error);
    throw error;
  }
}

export async function extractTextFromPDF(pdfPath: string) {
  const loadingTask = pdfJs.getDocument(pdfPath);
  const pdf = await loadingTask.promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: { str: string }) => item.str);
    text += strings.join(' ');
  }
  if (!text.trim()) {
    text = await scribe.extractText([pdfPath]);
  }
  return text;
}

// export function extractImagesFromPDF(pdfPath: string): Promise<string[]> {
//   return Promise.resolve([]);
// }
