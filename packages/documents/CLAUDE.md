# @happyvertical/documents

Document processing. Entry point: `fetchDocument(url, options)`.

## Key patterns

- Produces hierarchical structure: Document -> Parts -> Sections + Images
- Only PDF processing currently implemented (via `@happyvertical/pdf`)
- MIME type detected from URL extension, not Content-Type header

## Gotchas

- Non-PDF MIME types throw — no HTML/Markdown processor yet despite type definitions
- Base64 image encoding for portability
- Spider integration detects WordPress/CivicWeb/DocuShare PDF links, wraps errors silently
