---
"@happyvertical/ai": patch
"@happyvertical/spider": patch
---

Fix macOS keychain password prompts in AI and Spider packages

Prevent macOS keychain password prompts during build and runtime:

## AI Package (@happyvertical/ai)

1. Removing all CLI execution during detection (no more `claude --help` calls)
2. Checking for ANTHROPIC_API_KEY environment variable and automatically falling back to Anthropic SDK

**Authentication Priority:**
1. ANTHROPIC_API_KEY environment variable (uses Anthropic SDK, no keychain prompts)
2. Claude CLI with setup-token (for CI/CD, no keychain prompts)
3. Claude CLI with keychain (local development, will fail gracefully if not authenticated)

**Changes:**
- Remove `claude --help` verification calls in `findCli()` method
- Use `fs.access()` to check file existence instead of executing CLI
- Add automatic fallback to AnthropicProvider when ANTHROPIC_API_KEY is set
- Map claude-cli model names (sonnet, opus, haiku) to full Anthropic model IDs
- Add comprehensive integration tests for fallback behavior
- Update documentation to explain authentication options

## Spider Package (@happyvertical/spider)

Add `--use-mock-keychain` argument to Playwright launch options in Crawlee adapter and tree scraper. This prevents Chromium from accessing the macOS system keychain.

**Changes:**
- Add `args: ['--use-mock-keychain']` to Playwright launchOptions in Crawlee adapter
- Add `args: ['--use-mock-keychain']` to Playwright launchOptions in tree scraper
- No behavioral changes - only prevents keychain access

Both packages will now run without prompting for keychain access on macOS.

Fixes #403
