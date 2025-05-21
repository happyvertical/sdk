# HAppy VEertical _SDK_

# what

- a dangerous library for fools and madmen (currently)
- pure ts, never want to worry about cjs vs esm agin
- test cheap scale easy
- minimise dependencies with monorepo maintained by robots .. shadcdn philosophy applied to backend
- re-useable libraries for building vertical ai agents
- code compartmentalised to keep robots lean
- i want to be able to run stuff in cicd jobs and as part of a (sveltekit) site build

# why

i want to replace dependency hell with robots work
i want to test a crazy idea cheap and if it gets traction move to production without requiring a massive refactor
if shadcdn can do it on the frontend, why not

# how

i hate vendor lock
i hate overhead
i hate dependencies
sqlite is cool and can be useful on the edge

# packages

- ai: a library for interacting with ai models, provides a standardised interface
- sql: a library for interacting with sql databases, provides a standardised interface (sqlite and postgres)
  - not trying to be an orm
- web: tools for crawling the web, scraping content, and parsing it into a standardised format - maybe rename to spider
- files: a library for interacting with file systems, provides a standardised interface for local and remote file systems
- smrt: a library for building vertical ai agents, probably anything but
  - standardised collection, object, classes .. all include db, fs, ai interfaces and options
  - fast and loose database schemas defined by class properties supporting sqlite first and an eye on postgres

# Development

Check the CONTRIBUTING.md file for detailed contribution guidelines.

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build all packages in correct order
pnpm build

# Generate documentation only
pnpm docs

# Watch mode development
pnpm dev

# Lint code
pnpm lint

# Format code
pnpm format
```

# Documentation

## Local Documentation

The SDK provides automatically generated HTML documentation in the `docs/manual` directory.
This is generated during the build process and can be viewed by opening `docs/manual/index.html` in your browser.

You can generate the documentation separately by running:

```bash
pnpm docs
```

## Online Documentation

The latest API documentation is also available online at:

```
https://happyvertical.github.io/sdk/
```

This documentation is automatically updated whenever changes are merged to the master branch.
