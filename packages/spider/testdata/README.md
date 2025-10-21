# Spider Test Fixtures

This directory contains HTML fixtures for testing the @happyvertical/spider package's URL detection and document scraping capabilities.

## Fixture Files

### WordPress Download Manager Fixtures

These fixtures test the detection of WordPress Download Manager (WPDM) plugin patterns commonly used by town council websites for distributing meeting documents.

- **wordpress-pdf-link.html** - WordPress page with direct PDF link using wpdmdl parameter
  - Pattern: `?wpdmdl=12345` in URL
  - Tests: Direct PDF link detection

- **wordpress-agenda-link.html** - WordPress page with wpdm_view_count script and relative PDF path
  - Pattern: `$.post(wpdm_url.ajax, { action: 'wpdm_view_count' })`
  - Tests: Agenda document detection via WPDM script marker

- **wordpress-document-link.html** - WordPress page with relative PDF URL
  - Pattern: `/files/document.pdf`
  - Tests: Relative URL resolution for PDFs

- **wordpress-meeting-link.html** - WordPress page with wpdmdl parameter (no .pdf extension)
  - Pattern: `?wpdmdl=17656&refresh=...`
  - Tests: WPDM parameter detection without explicit .pdf extension

- **wordpress-html-entities.html** - WordPress page with HTML entities in URL
  - Pattern: `&amp;` encoded ampersands
  - Tests: HTML entity decoding in extracted URLs

### CivicWeb Fixtures

These fixtures test CivicWeb document management system patterns used by school boards and municipalities.

- **civicweb-download.html** - CivicWeb preview page with PDF download link
  - URL Pattern: `civicweb.net/filepro/documents/?preview=`
  - Link Pattern: `/filepro/document/{id}/{filename}.pdf`
  - Tests: CivicWeb preview page detection and PDF extraction

- **civicweb-html-entities.html** - CivicWeb page with HTML entities in filename
  - Pattern: `&amp;` in PDF filename
  - Tests: HTML entity decoding for CivicWeb URLs

- **civicweb-no-pdf.html** - CivicWeb page with no PDF link
  - Tests: Graceful fallback when no PDF is found

- **civicweb-view.html** - CivicWeb document view page
  - URL Pattern: `civicweb.net/filepro/documents/view/{id}`
  - Tests: Alternative CivicWeb URL pattern detection

### DocuShare Fixtures

These fixtures test DocuShare document management system patterns used by various organizations.

- **docushare-download.html** - DocuShare document page with /dsweb/Get/ pattern
  - URL Pattern: `/dsweb/Get/Document-{id}`
  - Link Pattern: `/dsweb/Get/Document-{id}/{filename}.pdf`
  - Tests: DocuShare document detection

- **docushare-serviceslib.html** - DocuShare page with /dsweb/ServicesLib/ pattern
  - Link Pattern: `/dsweb/ServicesLib/Document-{id}/{filename}.pdf`
  - Tests: Alternative DocuShare link pattern

- **docushare-html-entities.html** - DocuShare page with HTML entities in filename
  - Pattern: `&amp;` in filename
  - Tests: HTML entity decoding for DocuShare URLs

- **docushare-xlsx.html** - DocuShare page with non-PDF document (Excel)
  - Pattern: `.xlsx` extension
  - Tests: Non-PDF document type detection

- **docushare-no-link.html** - DocuShare page with no document link
  - Tests: Graceful fallback when no document is found

- **docushare-generator.html** - Page with DocuShare meta generator tag
  - Pattern: `<meta name="generator" content="DocuShare">`
  - Tests: DocuShare detection via HTML meta tags

### Generic Fixtures

- **normal-page.html** - Regular HTML page with no special document patterns
  - Tests: Baseline behavior for standard web pages

- **page-with-title.html** - HTML page with title and meta description
  - Tests: Metadata extraction from standard HTML

## Usage in Tests

These fixtures are used in `scrapeDocument.test.ts` with real scraper instances instead of mocks:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getScraper } from './shared/scraper-factory';

// Load fixture HTML
const fixtureHtml = readFileSync(
  join(__dirname, '../testdata/wordpress-pdf-link.html'),
  'utf-8'
);

// Create real scraper (not mocked)
const scraper = await getScraper({ scraper: 'basic', spider: 'dom' });

// Process HTML with real scraper
const result = await scraper.scrape(url, { html: fixtureHtml });
```

## Adding New Fixtures

When adding new fixtures:

1. Create an HTML file with a descriptive name
2. Include realistic HTML structure from actual websites
3. Add entry to this README documenting:
   - The URL pattern being tested
   - The link/content pattern being detected
   - What behavior is being verified
4. Use the fixture in corresponding test cases

## Real-World Sources

These fixtures are based on actual HTML patterns from:

- Town council websites using WordPress Download Manager
- School board websites using CivicWeb
- Municipal document repositories using DocuShare

The fixtures serve as **executable documentation** of supported URL patterns and detection strategies.
