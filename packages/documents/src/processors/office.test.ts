import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDocument } from '../factory';
import { buildDocx, buildPptx } from '../office.test.helper';
import {
  DOCX_MIME,
  DOCXProcessor,
  extractOffice,
  PPTX_MIME,
  PPTXProcessor,
} from './office';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'documents-office-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const slides = [
  {
    title: 'Welcome',
    body: 'Opening line',
    notes: 'Greet the class',
    image: true,
  },
  { title: 'Middle', body: 'Core idea' },
  { title: 'Wrap up', notes: 'Hand out the worksheet' },
];

describe('extractOffice (docx)', () => {
  const docx = buildDocx({
    title: 'Unit Guide',
    paragraphs: [
      'Preamble text',
      { text: 'Goals', heading: 1 },
      'Learn things',
      { text: 'Pacing', heading: 2 },
      'Two weeks',
      { text: 'Assessment', heading: 1 },
      'A quiz',
    ],
  });

  it('splits text into heading parts and reads the title', async () => {
    const result = await extractOffice(docx, 'docx');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.title).toBe('Unit Guide');
    expect(result.parts.map((p) => p.title)).toEqual([
      'Unit Guide',
      'Goals',
      'Assessment',
    ]);
    expect(result.parts[0].content).toBe('Preamble text');
    const goals = result.parts[1];
    expect(goals.content).toBe('Learn things');
    expect(goals.parts?.map((p) => [p.title, p.content])).toEqual([
      ['Pacing', 'Two weeks'],
    ]);
    expect(result.parts[2].content).toBe('A quiz');
    expect(result.parts.every((p) => p.type === 'markdown')).toBe(true);
  });

  it('reads from a file path', async () => {
    const path = join(dir, 'guide.docx');
    await writeFile(path, docx);
    const result = await extractOffice(path, 'docx');
    expect(result.status).toBe('ok');
  });

  it('keeps embedded images, even for an image-only document', async () => {
    const withText = await extractOffice(
      buildDocx({ paragraphs: ['Words'], image: true }),
      'docx',
    );
    if (withText.status !== 'ok') throw new Error('expected ok');
    expect(withText.parts[0].images?.[0].data?.byteLength).toBeGreaterThan(0);

    const only = await extractOffice(
      buildDocx({ paragraphs: [], title: 'Pictures', image: true }),
      'docx',
    );
    if (only.status !== 'ok') throw new Error('expected ok');
    expect(only.parts).toHaveLength(1);
    expect(only.parts[0].title).toBe('Pictures');
    expect(only.parts[0].images).toHaveLength(1);
  });

  it('rejects a corrupt file instead of reporting unsupported', async () => {
    await expect(
      extractOffice(Buffer.from('not a zip'), 'docx'),
    ).rejects.toThrow();
  });
});

describe('extractOffice (pptx)', () => {
  const pptx = buildPptx(slides);

  it('returns one part per slide with text and speaker notes', async () => {
    const result = await extractOffice(pptx, 'pptx');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.parts).toHaveLength(3);
    expect(result.metadata.slideCount).toBe(3);
    expect(result.parts.map((p) => p.metadata?.slide)).toEqual([1, 2, 3]);
    expect(result.parts.map((p) => p.title)).toEqual([
      'Welcome',
      'Middle',
      'Wrap up',
    ]);
    expect(result.parts[0].content).toBe('Welcome\n\nOpening line');
    expect(result.parts[0].notes).toBe('Greet the class');
    expect(result.parts[1].notes).toBeUndefined();
    expect(result.parts[1].content).toBe('Middle\n\nCore idea');
    expect(result.parts[2].content).toBe('Wrap up');
    expect(result.parts[2].notes).toBe('Hand out the worksheet');
  });

  it('attaches embedded images to their slide', async () => {
    const result = await extractOffice(pptx, 'pptx');
    if (result.status !== 'ok') throw new Error('expected ok');
    const [first, second] = result.parts;
    expect(first.images).toHaveLength(1);
    expect(first.images?.[0].data?.byteLength).toBeGreaterThan(0);
    expect(first.images?.[0].altText).toBe('A tiny picture');
    expect(first.images?.[0].metadata?.format).toBe('png');
    expect(first.images?.[0].metadata?.slide).toBe(1);
    expect(second.images).toBeUndefined();
    expect(result.metadata.hasImages).toBe(true);
  });

  it('skips images when asked', async () => {
    const result = await extractOffice(pptx, 'pptx', { extractImages: false });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.parts[0].images).toBeUndefined();
    expect(result.metadata.hasImages).toBe(false);
  });
});

describe('processors', () => {
  it('claim their mime types and extensions only', () => {
    const docx = new DOCXProcessor();
    const pptx = new PPTXProcessor();
    expect(docx.supports(DOCX_MIME)).toBe(true);
    expect(docx.supports('.docx')).toBe(true);
    expect(docx.supports('FILE.DOCX')).toBe(true);
    expect(docx.supports('application/pdf')).toBe(false);
    expect(docx.supports(PPTX_MIME)).toBe(false);
    expect(pptx.supports(PPTX_MIME)).toBe(true);
    expect(pptx.supports('deck.pptx')).toBe(true);
    expect(pptx.supports(DOCX_MIME)).toBe(false);
  });

  it('process a local pptx into a Document', async () => {
    const path = join(dir, 'deck.pptx');
    await writeFile(path, buildPptx(slides));
    const doc = await new PPTXProcessor().process(`file://${path}`, {
      cacheDir: dir,
    });
    expect(doc.unsupported).toBeUndefined();
    expect(doc.type).toBe(PPTX_MIME);
    expect(doc.parts.map((p) => p.notes)).toEqual([
      'Greet the class',
      undefined,
      'Hand out the worksheet',
    ]);
    expect(doc.metadata?.processor).toBe('pptx');
  });

  it('are picked by fetchDocument from the file extension', async () => {
    const docxPath = join(dir, 'guide.docx');
    const pptxPath = join(dir, 'deck.pptx');
    await writeFile(docxPath, buildDocx({ paragraphs: ['Hello docx'] }));
    await writeFile(pptxPath, buildPptx([{ title: 'Hello pptx' }]));
    const d = await fetchDocument(`file://${docxPath}`, { cacheDir: dir });
    const p = await fetchDocument(`file://${pptxPath}`, { cacheDir: dir });
    expect(d.parts[0].content).toBe('Hello docx');
    expect(p.parts[0].content).toBe('Hello pptx');
  });
});

describe('when Kreuzberg is not installed', () => {
  afterEach(() => {
    vi.doUnmock('@kreuzberg/node');
    vi.resetModules();
  });

  async function withoutKreuzberg() {
    vi.resetModules();
    vi.doMock('@kreuzberg/node', () => {
      throw new Error("Cannot find package '@kreuzberg/node'");
    });
    return import('./office');
  }

  it('extractOffice returns a clear unsupported result', async () => {
    const office = await withoutKreuzberg();
    const result = await office.extractOffice(buildPptx(slides), 'pptx');
    expect(result).toMatchObject({
      status: 'unsupported',
      code: 'dependency-missing',
      format: 'pptx',
      dependency: '@kreuzberg/node',
    });
    expect(result.status === 'unsupported' && result.reason).toMatch(
      /requires the optional @kreuzberg\/node/,
    );
  });

  it('processors resolve with document.unsupported and no parts', async () => {
    const office = await withoutKreuzberg();
    const path = join(dir, 'guide.docx');
    await writeFile(path, buildDocx({ paragraphs: ['x'] }));
    const doc = await new office.DOCXProcessor().process(`file://${path}`, {
      cacheDir: dir,
    });
    expect(doc.parts).toEqual([]);
    expect(doc.unsupported).toMatchObject({
      code: 'dependency-missing',
      dependency: '@kreuzberg/node',
    });
  });
});
