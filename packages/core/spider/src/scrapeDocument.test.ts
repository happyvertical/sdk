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

  describe('CivicWeb preview page detection', () => {
    it('should detect CivicWeb preview pages and extract PDF URL', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValueOnce({
          url: 'https://wolfcreekschooldivision72.civicweb.net/filepro/documents/?preview=52835',
          content: `
            <html>
              <head><title>Document Preview</title></head>
              <body>
                <div class="preview-container">
                  <a href="/filepro/document/52835/Regular Board - 16 Oct 2025 - Agenda - Pdf.pdf">
                    Download PDF
                  </a>
                </div>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument(
        'https://wolfcreekschooldivision72.civicweb.net/filepro/documents/?preview=52835'
      );

      // Should only scrape once (detected PDF link, no re-scrape)
      expect(mockScraper.scrape).toHaveBeenCalledTimes(1);

      // Should extract and return the actual PDF URL
      expect(result.url).toBe(
        'https://wolfcreekschooldivision72.civicweb.net/filepro/document/52835/Regular Board - 16 Oct 2025 - Agenda - Pdf.pdf'
      );
      expect(result.metadata.isPdf).toBe(true);
      expect(result.metadata.complete).toBe(false); // PDF needs separate processing
      expect(result.metadata.strategy).toBe('civicweb-pdf-link');
      expect(result.type).toBe('application/pdf');
      expect(result.text).toBe(''); // No binary content downloaded
    });

    it('should handle CivicWeb preview pages with HTML entities in URL', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValueOnce({
          url: 'https://example.civicweb.net/filepro/documents/?preview=12345',
          content: `
            <html>
              <body>
                <a href="/filepro/document/12345/Meeting &amp; Agenda.pdf">Download</a>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument(
        'https://example.civicweb.net/filepro/documents/?preview=12345'
      );

      // Should decode &amp; to &
      expect(result.url).toBe('https://example.civicweb.net/filepro/document/12345/Meeting & Agenda.pdf');
      expect(result.metadata.isPdf).toBe(true);
      expect(result.metadata.strategy).toBe('civicweb-pdf-link');
    });

    it('should not trigger CivicWeb detection for non-CivicWeb URLs', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValue({
          url: 'https://example.com/documents/?preview=12345',
          content: `
            <html>
              <body>
                <a href="/document/12345/file.pdf">Download</a>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/documents/?preview=12345');

      // Should process as regular HTML page (no CivicWeb detection)
      expect(result.url).toBe('https://example.com/documents/?preview=12345');
      expect(result.metadata.isPdf).toBe(false);
      expect(result.type).toBe('text/html');
    });

    it('should handle CivicWeb pages with no PDF link found', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValue({
          url: 'https://example.civicweb.net/filepro/documents/?preview=12345',
          content: `
            <html>
              <body>
                <p>No PDF link available</p>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument(
        'https://example.civicweb.net/filepro/documents/?preview=12345'
      );

      // Should fall back to regular processing when no PDF link found
      expect(result.url).toBe('https://example.civicweb.net/filepro/documents/?preview=12345');
      expect(result.metadata.isPdf).toBe(false);
      expect(result.type).toBe('text/html');
    });

    it('should detect CivicWeb by domain and path pattern', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValueOnce({
          url: 'https://schoolboard.civicweb.net/filepro/documents/view/12345',
          content: `
            <html>
              <body>
                <a href="/filepro/document/12345/Minutes.pdf">View PDF</a>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      // This URL doesn't have ?preview= but matches civicweb.net + /filepro/documents
      const result = await scrapeDocument(
        'https://schoolboard.civicweb.net/filepro/documents/view/12345?preview=12345'
      );

      expect(result.url).toBe('https://schoolboard.civicweb.net/filepro/document/12345/Minutes.pdf');
      expect(result.metadata.isPdf).toBe(true);
      expect(result.metadata.strategy).toBe('civicweb-pdf-link');
    });
  });

  describe('DocuShare document page detection', () => {
    it('should detect DocuShare document pages with /dsweb/Get/ pattern', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValueOnce({
          url: 'https://example.com/docushare/dsweb/Get/Document-12345',
          content: `
            <html>
              <head><title>Document Details</title></head>
              <body>
                <div class="document-details">
                  <a href="/dsweb/Get/Document-12345/Council Minutes - Oct 2025.pdf">
                    Download PDF
                  </a>
                </div>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument(
        'https://example.com/docushare/dsweb/Get/Document-12345'
      );

      expect(mockScraper.scrape).toHaveBeenCalledTimes(1);
      expect(result.url).toBe('https://example.com/dsweb/Get/Document-12345/Council Minutes - Oct 2025.pdf');
      expect(result.metadata.isPdf).toBe(true);
      expect(result.metadata.complete).toBe(false);
      expect(result.metadata.strategy).toBe('docushare-doc-link');
      expect(result.type).toBe('application/pdf');
      expect(result.text).toBe('');
    });

    it('should detect DocuShare with /dsweb/ServicesLib/ pattern', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValueOnce({
          url: 'https://example.com/docushare/dsweb/View/Collection-567',
          content: `
            <html>
              <body>
                <div class="document-list">
                  <a href="/dsweb/ServicesLib/Document-12345/Meeting Agenda.pdf">View Document</a>
                </div>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument(
        'https://example.com/docushare/dsweb/View/Collection-567'
      );

      expect(result.url).toBe('https://example.com/dsweb/ServicesLib/Document-12345/Meeting Agenda.pdf');
      expect(result.metadata.isPdf).toBe(true);
      expect(result.metadata.strategy).toBe('docushare-doc-link');
    });

    it('should handle DocuShare pages with HTML entities in filename', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValueOnce({
          url: 'https://example.com/docushare/dsweb/Get/Document-789',
          content: `
            <html>
              <body>
                <a href="/dsweb/Get/Document-789/Report &amp; Analysis.pdf">Download</a>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument(
        'https://example.com/docushare/dsweb/Get/Document-789'
      );

      expect(result.url).toBe('https://example.com/dsweb/Get/Document-789/Report & Analysis.pdf');
      expect(result.metadata.isPdf).toBe(true);
      expect(result.metadata.strategy).toBe('docushare-doc-link');
    });

    it('should handle DocuShare with various document types', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValueOnce({
          url: 'https://example.com/docushare/dsweb/Get/Document-999',
          content: `
            <html>
              <body>
                <a href="/dsweb/Get/Document-999/Spreadsheet.xlsx">Download Excel</a>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument(
        'https://example.com/docushare/dsweb/Get/Document-999'
      );

      expect(result.url).toBe('https://example.com/dsweb/Get/Document-999/Spreadsheet.xlsx');
      expect(result.metadata.isPdf).toBe(false); // Not a PDF
      expect(result.type).toBe('application/octet-stream'); // Generic document type
      expect(result.metadata.strategy).toBe('docushare-doc-link');
    });

    it('should not trigger DocuShare detection for non-DocuShare URLs', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValue({
          url: 'https://example.com/documents/view/12345',
          content: `
            <html>
              <body>
                <a href="/documents/file.pdf">Download</a>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/documents/view/12345');

      expect(result.url).toBe('https://example.com/documents/view/12345');
      expect(result.metadata.isPdf).toBe(false);
      expect(result.type).toBe('text/html');
    });

    it('should handle DocuShare pages with no document link found', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValue({
          url: 'https://example.com/docushare/dsweb/Get/Document-12345',
          content: `
            <html>
              <body>
                <p>Document not available</p>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument(
        'https://example.com/docushare/dsweb/Get/Document-12345'
      );

      expect(result.url).toBe('https://example.com/docushare/dsweb/Get/Document-12345');
      expect(result.metadata.isPdf).toBe(false);
      expect(result.type).toBe('text/html');
    });

    it('should detect DocuShare by HTML content markers', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValueOnce({
          url: 'https://example.com/documents/view',
          content: `
            <html>
              <head><meta name="generator" content="DocuShare"></head>
              <body>
                <a href="/docushare/Reports/Annual_Report_2025.pdf">Download</a>
              </body>
            </html>
          `,
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const result = await scrapeDocument('https://example.com/documents/view');

      expect(result.url).toBe('https://example.com/docushare/Reports/Annual_Report_2025.pdf');
      expect(result.metadata.isPdf).toBe(true);
      expect(result.metadata.strategy).toBe('docushare-doc-link');
    });
  });

  describe('Scraper configuration options', () => {
    it('should use default basic scraper with dom spider when no options provided', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValue({
          url: 'https://example.com/page',
          content: '<html><body><p>Content</p></body></html>',
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      await scrapeDocument('https://example.com/page');

      // Should request basic scraper with dom spider (defaults)
      expect(scraperFactory.getScraper).toHaveBeenCalledWith({
        scraper: 'basic',
        spider: 'dom',
      });
    });

    it('should use crawlee scraper when specified in options', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValue({
          url: 'https://example.com/js-heavy-page',
          content: '<html><body><p>JavaScript-generated content</p></body></html>',
          links: [],
          strategy: { type: 'basic', spider: 'crawlee', config: {}, confidence: 1 },
          metrics: { duration: 2000, linkCount: 5, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      await scrapeDocument('https://example.com/js-heavy-page', {
        scraper: 'crawlee',
      });

      // Should request basic scraper with crawlee spider
      expect(scraperFactory.getScraper).toHaveBeenCalledWith({
        scraper: 'crawlee',
        spider: 'dom',  // Default spider when scraper specified
      });
    });

    it('should use simple spider when specified in options', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValue({
          url: 'https://example.com/simple-page',
          content: '<html><body><p>Simple HTML</p></body></html>',
          links: [],
          strategy: { type: 'basic', spider: 'simple', config: {}, confidence: 1 },
          metrics: { duration: 50, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      await scrapeDocument('https://example.com/simple-page', {
        spider: 'simple',
      });

      // Should request basic scraper with simple spider
      expect(scraperFactory.getScraper).toHaveBeenCalledWith({
        scraper: 'basic',
        spider: 'simple',
      });
    });

    it('should allow both scraper and spider to be configured', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValue({
          url: 'https://example.com/custom-config',
          content: '<html><body><p>Custom scraper config</p></body></html>',
          links: [],
          strategy: { type: 'basic', spider: 'crawlee', config: {}, confidence: 1 },
          metrics: { duration: 1500, linkCount: 3, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      await scrapeDocument('https://example.com/custom-config', {
        scraper: 'crawlee',
        spider: 'crawlee',
      });

      // Should request specified scraper and spider
      expect(scraperFactory.getScraper).toHaveBeenCalledWith({
        scraper: 'crawlee',
        spider: 'crawlee',
      });
    });

    it('should pass through other options like timeout and cache', async () => {
      const mockScraper = {
        scrape: vi.fn().mockResolvedValue({
          url: 'https://example.com/page-with-options',
          content: '<html><body><p>Content</p></body></html>',
          links: [],
          strategy: { type: 'basic', spider: 'dom', config: {}, confidence: 1 },
          metrics: { duration: 100, linkCount: 0, complete: true },
        }),
      };

      vi.mocked(scraperFactory.getScraper).mockResolvedValue(mockScraper as any);

      const options = {
        scraper: 'basic' as const,
        spider: 'dom' as const,
        timeout: 30000,
        cache: true,
        headers: { 'User-Agent': 'Test/1.0' },
      };

      await scrapeDocument('https://example.com/page-with-options', options);

      // scrape() should receive the full options object
      expect(mockScraper.scrape).toHaveBeenCalledWith(
        'https://example.com/page-with-options',
        options
      );
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
