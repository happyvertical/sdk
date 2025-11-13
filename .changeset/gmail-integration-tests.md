---
'@happyvertical/messages': minor
---

Add Gmail OAuth2 integration tests and fix adapter initialization

- Fix Gmail adapter to properly initialize OAuth2 client with clientId and clientSecret
- Add comprehensive Gmail integration tests covering connections, folders, messages, search, and operations
- Include Gmail token generator script for easy OAuth2 setup
- Adjust tests for Gmail-specific behavior (labels vs flags)
- All 17 Gmail integration tests pass with real credentials
