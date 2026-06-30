import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDocument } from './factory';

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  scrapeDocument: vi.fn(),
}));

vi.mock('@happyvertical/spider', () => ({
  scrapeDocument: mocks.scrapeDocument,
}));

vi.mock('./processors/pdf', () => ({
  // biome-ignore lint/style/useNamingConvention: Mock export must match the module export.
  PDFProcessor: class {
    supports(type: string) {
      return type === 'application/pdf';
    }

    process(url: string, options: unknown) {
      return mocks.process(url, options);
    }
  },
}));

describe('fetchDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.scrapeDocument.mockResolvedValue({
      url: 'https://example.test/document.pdf',
      metadata: {
        complete: false,
        isPdf: true,
        strategy: 'wordpress-pdf-link',
      },
    });

    mocks.process.mockResolvedValue({
      metadata: {},
      parts: [],
      type: 'application/pdf',
      url: 'https://example.test/document.pdf',
    });
  });

  it('maps legacy crawlee scraper option to basic scraper with crawlee spider', async () => {
    await fetchDocument('https://example.test/download', {
      scraper: 'crawlee',
    });

    expect(mocks.scrapeDocument).toHaveBeenCalledWith(
      'https://example.test/download',
      expect.objectContaining({
        scraper: 'basic',
        spider: 'crawlee',
      }),
    );
  });

  it('lets explicit spider option override the legacy crawlee scraper alias', async () => {
    await fetchDocument('https://example.test/download', {
      scraper: 'crawlee',
      spider: 'dom',
    });

    expect(mocks.scrapeDocument).toHaveBeenCalledWith(
      'https://example.test/download',
      expect.objectContaining({
        scraper: 'basic',
        spider: 'dom',
      }),
    );
  });
});
