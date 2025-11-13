---
'@happyvertical/messages': patch
---

Fix Gmail adapter attachment handling - buildRFC2822Message now properly encodes email attachments using MIME multipart/mixed format with base64 encoding
