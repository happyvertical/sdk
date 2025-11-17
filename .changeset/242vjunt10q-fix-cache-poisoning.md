---
"@happyvertical/documents": patch
---

fix(documents): prevent cache poisoning when HTML is downloaded as PDF

Fixes #463 - Delete poisoned cache files when PDF validation detects HTML or invalid content. This prevents WordPress Download Manager and similar document management systems from causing persistent failures due to cached HTML tracking pages.
