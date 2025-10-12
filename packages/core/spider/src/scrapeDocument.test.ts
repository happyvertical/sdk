/**
 * Tests for scrapeDocument functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrapeDocument } from './scrapeDocument';
import * as scraperFactory from './shared/scraper-factory';

// Mock the scraper factory
vi.mock('./shared/scraper-factory');

describe('scrapeDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('WordPress Download Manager detection', () => {
    it('should detect WordPress download pages with wpdmdl parameter pointing to PDF', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValueOnce({
          // First call: WordPress download page with PDF link
          url: 'https://example.com/download/file/',
          content: `
            <html>
              <body>
                <a href="https://example.com/download/file.pdf?wpdmdl=12345&refresh=abc123">Download</a>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/download/file/');

      // Should have called scraper only once (no re-scrape for PDFs)
      expect(mockScraper.scrape).toHaveBeenCalledTimes(1);
      expect(mockScraper.scrape).toHaveBeenCalledWith(
        'https://example.com/download/file/',
        undefined
      );

      // Should return the PDF URL without re-scraping
      expect(result.url).toBe('https://example.com/download/file.pdf?wpdmdl=12345&refresh=abc123');
      expect(result.metadata.isPdf).toBe(true);
      expect(result.metadata.complete).toBe(false); // PDF needs separate processing
      expect(result.metadata.strategy).toBe('wordpress-pdf-link');
    });

    it('should detect WordPress pages with wpdm_view_count and PDF link', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValueOnce({
          url: 'https://example.com/download/agenda/',
          content: `
            <html>
              <body>
                <script>
                  $.post(wpdm_url.ajax, { action: 'wpdm_view_count', id: '17656' });
                </script>
                <a href="/wp-content/uploads/file.pdf">Download PDF</a>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/download/agenda/');

      // Should only call scraper once (detected PDF link, no re-scrape)
      expect(mockScraper.scrape).toHaveBeenCalledTimes(1);
      expect(result.url).toBe('https://example.com/wp-content/uploads/file.pdf');
      expect(result.metadata.isPdf).toBe(true);
      expect(result.metadata.complete).toBe(false);
      expect(result.metadata.strategy).toBe('wordpress-pdf-link');
    });

    it('should handle relative PDF URLs in WordPress pages', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValueOnce({
          url: 'https://example.com/download/document/',
          content: `
            <html>
              <body>
                <a href="/files/document.pdf">Download</a>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/download/document/');

      // Should only call scraper once (detected PDF, no re-scrape)
      expect(mockScraper.scrape).toHaveBeenCalledTimes(1);
      expect(result.url).toBe('https://example.com/files/document.pdf');
      expect(result.metadata.isPdf).toBe(true);
      expect(result.metadata.complete).toBe(false);
      expect(result.metadata.strategy).toBe('wordpress-pdf-link');
    });

    it('should detect wpdmdl parameter URLs without .pdf extension', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValueOnce({
          url: 'https://example.com/download/meeting/',
          content: `
            <html>
              <body>
                <a href="https://example.com/download/meeting/?wpdmdl=17656&refresh=68ebf5c3cf">Download</a>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/download/meeting/');

      // Should only call scraper once (detected wpdmdl parameter, no re-scrape)
      expect(mockScraper.scrape).toHaveBeenCalledTimes(1);
      expect(result.url).toBe('https://example.com/download/meeting/?wpdmdl=17656&refresh=68ebf5c3cf');
      expect(result.metadata.isPdf).toBe(true);
      expect(result.metadata.complete).toBe(false);
      expect(result.metadata.strategy).toBe('wordpress-pdf-link');
      expect(result.text).toBe(''); // No binary content downloaded
    });

    it('should decode HTML entities in extracted WordPress URLs', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValueOnce({
          url: 'https://example.com/download/meeting/',
          content: `
            <html>
              <body>
                <a href="https://example.com/download/meeting/?wpdmdl=17656&amp;refresh=68ebf5c3cf&amp;test=value">Download</a>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/download/meeting/');

      // Should decode &amp; to &
      expect(result.url).toBe('https://example.com/download/meeting/?wpdmdl=17656&refresh=68ebf5c3cf&test=value');
      expect(result.metadata.isPdf).toBe(true);
      expect(result.metadata.strategy).toBe('wordpress-pdf-link');
    });

    it('should not trigger re-scrape for non-WordPress pages', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValue({
          url: 'https://example.com/article',
          content: `
            <html>
              <head><title>Test Article</title></head>
              <body><p>Normal web page content</p></body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/article');

      // Should only scrape once for normal pages
      expect(mockScraper.scrape).toHaveBeenCalledTimes(1);
      expect(result.url).toBe('https://example.com/article');
      expect(result.metadata.isPdf).toBe(false);
    });
  });

  describe('Basic document scraping', () => {
    it('should extract title and description from HTML', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValue({
          url: 'https://example.com/page',
          content: `
            <html>
              <head>
                <title>Test Page Title</title>
                <meta name="description" content="Test page description" />
              </head>
              <body><p>Content here</p></body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/page');

      expect(result.metadata.title).toBe('Test Page Title');
      expect(result.metadata.description).toBe('Test page description');
      expect(result.type).toBe('text/html');
    });

    it('should detect PDFs by extension', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValue({
          url: 'https://example.com/document.pdf',
          content: '%PDF-1.4\n...',
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/document.pdf');

      expect(result.metadata.isPdf).toBe(true);
      expect(result.type).toBe('application/pdf');
    });
  });
});
