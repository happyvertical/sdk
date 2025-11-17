---
'@happyvertical/documents': patch
---

Add validation to detect HTML files disguised as PDFs (#460)

WordPress Download Manager and some other servers may return HTML content with `Content-Type: application/pdf` headers, causing PDF text extraction to fail silently with 0 characters extracted.

This fix adds validation after downloading files to check that they actually contain PDF magic bytes (`%PDF-`). If HTML is detected instead, a clear error message is thrown explaining the issue and suggesting it commonly occurs with WordPress Download Manager URLs.

**What was fixed:**
- Added PDF magic byte validation before text extraction
- Provides clear error messages when HTML is returned instead of PDF
- Prevents silent failures where 0 chars are extracted without explanation

**Testing:**
- Verified WordPress PDFs extract text correctly when valid PDFs are returned
- Verified HTML files are properly rejected with helpful error messages
- All existing documents package tests pass
