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
