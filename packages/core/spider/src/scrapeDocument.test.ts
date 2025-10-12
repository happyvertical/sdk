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
    it('should detect WordPress download pages with wpdmdl parameter', async () => {
      const mockScraper = {
        scrape: vi.fn()
          .mockResolvedValueOnce({
            // First call: WordPress download page
            url: 'https://example.com/download/file/',
            content: `
              <html>
                <body>
                  <a href="https://example.com/download/file/?wpdmdl=12345&refresh=abc123">Download</a>
                </body>
              </html>
            `,
            links: [],
            strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
            metrics: { duration: 100, linkCount: 0, complete: true },
          })
          .mockResolvedValueOnce({
            // Second call: Actual PDF download
            url: 'https://example.com/download/file/?wpdmdl=12345&refresh=abc123',
            content: '%PDF-1.4\n...',
            links: [],
            strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
            metrics: { duration: 100, linkCount: 0, complete: true },
          }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/download/file/');

      // Should have called scraper twice (once for detection, once for actual download)
      expect(mockScraper.scrape).toHaveBeenCalledTimes(2);
      expect(mockScraper.scrape).toHaveBeenNthCalledWith(
        1,
        'https://example.com/download/file/',
        undefined
      );
      expect(mockScraper.scrape).toHaveBeenNthCalledWith(
        2,
        'https://example.com/download/file/?wpdmdl=12345&refresh=abc123',
        undefined
      );

      // Should return the actual download URL
      expect(result.url).toBe('https://example.com/download/file/?wpdmdl=12345&refresh=abc123');
      expect(result.metadata.isPdf).toBe(true);
    });

    it('should detect WordPress pages with wpdm_view_count', async () => {
      const mockScraper = {
        scrape: vi.fn()
          .mockResolvedValueOnce({
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
          })
          .mockResolvedValueOnce({
            url: 'https://example.com/wp-content/uploads/file.pdf',
            content: '%PDF-1.4\n...',
            links: [],
            strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
            metrics: { duration: 100, linkCount: 0, complete: true },
          }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/download/agenda/');

      expect(mockScraper.scrape).toHaveBeenCalledTimes(2);
      expect(result.url).toBe('https://example.com/wp-content/uploads/file.pdf');
      expect(result.metadata.isPdf).toBe(true);
    });

    it('should handle relative PDF URLs in WordPress pages', async () => {
      const mockScraper = {
        scrape: vi.fn()
          .mockResolvedValueOnce({
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
          })
          .mockResolvedValueOnce({
            url: 'https://example.com/files/document.pdf',
            content: '%PDF-1.4\n...',
            links: [],
            strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
            metrics: { duration: 100, linkCount: 0, complete: true },
          }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/download/document/');

      expect(mockScraper.scrape).toHaveBeenCalledTimes(2);
      expect(mockScraper.scrape).toHaveBeenNthCalledWith(
        2,
        'https://example.com/files/document.pdf',
        undefined
      );
      expect(result.url).toBe('https://example.com/files/document.pdf');
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
