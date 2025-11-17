---
'@happyvertical/documents': patch
---

Integrate spider for WordPress/CivicWeb/DocuShare PDF detection (#460)

WordPress Download Manager and similar document management systems may return HTML tracking pages instead of actual PDFs, causing `fetchDocument()` to extract 0 characters.

This fix integrates the spider package into `fetchDocument()` to automatically detect and handle document management systems:

**Architectural Changes:**
- `fetchDocument()` now uses `scrapeDocument()` from @happyvertical/spider for web URLs
- Automatically detects WordPress Download Manager, CivicWeb, and DocuShare pages
- Extracts actual PDF download URLs from document management pages
- Falls back to direct download if spider detection fails

**Additional Safety:**
- Added PDF magic byte validation (`%PDF-`) to catch HTML files disguised as PDFs
- Provides clear error messages when servers return HTML with PDF content-type
- Prevents silent failures where 0 chars are extracted

**New Options:**
All spider options now pass through to `fetchDocument()`:
- `scraper`: 'basic' | 'crawlee' - scraping strategy
- `spider`: 'simple' | 'dom' | 'crawlee' - spider adapter
- `cache`, `cacheExpiry` - caching control
- `headers`, `timeout` - HTTP options
- `maxDuration`, `maxInteractions` - advanced scraper options

**Testing:**
- Verified WordPress PDFs extract text correctly (2060 chars from test URL)
- Verified HTML files are properly rejected with helpful error messages
- All existing documents package tests pass
