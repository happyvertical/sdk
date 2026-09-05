---
'@happyvertical/files': minor
---

Add bounded provider reads and atomic create-without-overwrite writes. S3
endpoints must explicitly declare an `If-None-Match: *` conditional-write
contract or the operation fails before any request.
