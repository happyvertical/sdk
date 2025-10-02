---
id: cli
title: CLI Reference
sidebar_label: CLI
sidebar_position: 1
---

# CLI Reference

The SMRT framework provides a unified command-line interface for creating gnodes, generating code, and managing SMRT objects.

## Table of Contents

- [Installation](#installation)
- [Command Structure](#command-structure)
- [Built-in Commands](#built-in-commands)
- [Auto-generated Commands](#auto-generated-commands)
- [Configuration](#configuration)
- [Examples](#examples)

## Installation

The SMRT CLI is included with the `@have/smrt` package:

```bash
npm install @have/smrt
# or
pnpm add @have/smrt
# or
bun add @have/smrt
```

## Command Structure

The CLI follows a hierarchical command structure:

```bash
smrt [command] [subcommand] [arguments] [options]
```

### Examples:
```bash
smrt gnode create my-town --template=town
smrt generate-types ./manifest.json ./output
smrt products list --limit=20
smrt document analyze doc-123
```

## Built-in Commands

### `gnode create`

Create a new gnode project from a template.

**Syntax:**
```bash
smrt gnode create <project-name> [options]
```

**Arguments:**
- `project-name` - Name of the project to create (required)

**Options:**
- `--template=<name>` - Template to use (required)
  - Built-in templates: `town`, `county`, `library`
  - Remote templates: `github:user/repo`, `gitlab:user/repo`
  - Local templates: `../path/to/template`

**Examples:**
```bash
# Create from built-in template
smrt gnode create bentley-town --template=town

# Create from GitHub template
smrt gnode create my-site --template=github:myorg/custom-template

# Create from local template (development)
smrt gnode create test-site --template=../my-template
```

**What it does:**
1. Resolves the template (npm, git, or local filesystem)
2. Runs base generator (e.g., create-svelte) if configured
3. Copies template overlay files
4. Merges package.json dependencies
5. Sets up gnode-specific scripts

**Generated structure:**
```
my-town/
├── src/
│   ├── lib/
│   │   ├── smrt/          # SMRT objects (Council, Meeting, Content)
│   │   └── server/
│   │       └── smrt.ts    # Centralized configuration
│   ├── routes/            # SvelteKit routes
│   └── workflows/         # Research and report workflows
├── praeco.config.ts       # Praeco configuration
├── vite.config.ts         # Vite + smrtPlugin configured
└── package.json           # Merged dependencies
```

### `generate-types`

Generate TypeScript declarations from a SMRT manifest.

**Syntax:**
```bash
smrt generate-types <manifest-path> <output-dir>
```

**Arguments:**
- `manifest-path` - Path to manifest.json or static-manifest.js (required)
- `output-dir` - Output directory for generated types (required)

**Examples:**
```bash
# Generate from runtime manifest
smrt generate-types ./manifest.json ./src/types/generated

# Generate from static manifest
smrt generate-types ./static-manifest.js ./src/types

# Use in package.json scripts
{
  "scripts": {
    "prebuild": "smrt generate-types ./manifest.json src/types",
    "build": "npm run prebuild && tsc"
  }
}
```

**Generated files:**
```
output-dir/
├── smrt-client.d.ts      # API client interfaces
├── smrt-manifest.d.ts    # Manifest metadata
├── smrt-mcp.d.ts        # MCP tool definitions
├── smrt-routes.d.ts     # Route handler types
├── smrt-types.d.ts      # Object type definitions
└── smrt-objects.d.ts    # Individual object interfaces
```

**Use cases:**
- Pre-build type generation for TypeScript compilation
- Library builds that need standalone types
- Federation builds with static manifests
- CI/CD pipelines requiring type checking

## Auto-generated Commands

SMRT automatically generates CLI commands for objects decorated with `@smrt({ cli: true })`.

### Standard CRUD Operations

For each SMRT object, the following commands are available:

**`list`** - List all objects
```bash
smrt <objects> list [options]

Options:
  --limit=<number>   Maximum number of results (default: 50)
  --offset=<number>  Number of results to skip (default: 0)
  --where=<json>     Filter criteria as JSON

Examples:
  smrt documents list
  smrt documents list --limit=20 --offset=40
  smrt documents list --where='{"status":"published"}'
```

**`get`** - Get a specific object
```bash
smrt <objects> get <id>

Arguments:
  id - Object ID or slug

Examples:
  smrt documents get doc-123
  smrt documents get my-document-slug
```

**`create`** - Create a new object
```bash
smrt <objects> create [options]

Options:
  --<field>=<value>  Set field values

Examples:
  smrt documents create --title="New Document" --content="..."
  smrt products create --name="Widget" --price=99.99
```

**`update`** - Update an existing object
```bash
smrt <objects> update <id> [options]

Arguments:
  id - Object ID or slug

Options:
  --<field>=<value>  Field values to update

Examples:
  smrt documents update doc-123 --title="Updated Title"
  smrt products update prod-456 --price=149.99 --active=true
```

**`delete`** - Delete an object
```bash
smrt <objects> delete <id>

Arguments:
  id - Object ID or slug

Examples:
  smrt documents delete doc-123
  smrt products delete old-product
```

### Custom Actions

Custom methods on SMRT objects are automatically exposed as CLI commands:

```typescript
@smrt({
  cli: true,
  mcp: { include: ['analyze', 'summarize'] }
})
class Document extends SmrtObject {
  async analyze(options: any = {}) {
    // Analysis logic
    return { results: await this.performAnalysis(options) };
  }

  async summarize(options: any = {}) {
    // Summarization logic
    return { summary: await this.generateSummary(options) };
  }
}
```

**Generated commands:**
```bash
# Custom action commands
smrt documents analyze <id> [options]
smrt documents summarize <id> [options]

Examples:
  smrt documents analyze doc-123 --type=detailed
  smrt documents summarize doc-456 --length=short
```

### Custom Action Options

Options are passed to custom methods as the first parameter:

```typescript
async analyze(options: any = {}) {
  // Options from CLI: { type: 'detailed', criteria: ['quality'] }
  const type = options.type || 'general';
  const criteria = options.criteria || [];
  // ...
}
```

**CLI usage:**
```bash
smrt documents analyze doc-123 --type=detailed --criteria=quality,grammar
# Passes: { type: 'detailed', criteria: ['quality', 'grammar'] }
```

## Configuration

### Environment Variables

Configure SMRT behavior via environment variables:

```bash
# Database configuration
DATABASE_URL="file:./data.db"
DATABASE_TYPE="sqlite"  # or "postgres"

# AI configuration
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."

# CLI behavior
SMRT_CLI_OUTPUT="json"  # or "table", "csv"
SMRT_CLI_COLOR="true"   # Enable/disable colors
```

### Per-Object Configuration

Override configuration for specific objects in your application:

```typescript
// src/lib/server/smrt.ts
export function getSmrtConfig(className: string): SmrtClassOptions {
  const overrides = {
    Analytics: {
      db: { url: process.env.ANALYTICS_DB_URL!, type: 'postgres' }
    },
    AuditLog: {
      db: { url: process.env.AUDIT_DB_URL!, type: 'postgres' },
      ai: undefined  // No AI for audit logs
    }
  };

  return overrides[className] || getDefaultConfig();
}
```

## Examples

### Creating a Gnode Project

```bash
# Create a new town gnode
smrt gnode create bentley-town --template=town

# Navigate and setup
cd bentley-town
pnpm install

# Start development server
pnpm dev
```

### Working with Objects

```bash
# List all council meetings
smrt meetings list

# Get specific meeting
smrt meetings get meeting-2024-01-15

# Create a new meeting
smrt meetings create \
  --title="City Council Meeting" \
  --date="2024-02-01" \
  --location="City Hall"

# Run custom action
smrt meetings analyze meeting-2024-01-15 --type=sentiment
```

### Pre-build Type Generation

```bash
# Add to package.json
{
  "scripts": {
    "prebuild": "smrt generate-types ./manifest.json src/types",
    "build": "npm run prebuild && tsc",
    "dev": "npm run prebuild && vite dev"
  }
}

# Run build
pnpm build
# Generates types first, then compiles TypeScript
```

### Advanced Filtering

```bash
# Complex where clause
smrt documents list --where='{
  "status": "published",
  "created_at >": "2024-01-01",
  "category in": ["news", "analysis"]
}'

# Pagination
smrt documents list --limit=20 --offset=40

# Combined
smrt documents list \
  --where='{"status":"published"}' \
  --limit=10 \
  --offset=0
```

## Error Handling

The CLI provides clear error messages:

```bash
# Missing required argument
$ smrt gnode create
Error: Project name is required
Usage: smrt gnode create <project-name> --template=<name>

# Invalid template
$ smrt gnode create my-site --template=invalid
Error: Template 'invalid' not found
Available templates: town, county, library

# Object not found
$ smrt documents get nonexistent
Error: Document not found: nonexistent

# Invalid options
$ smrt documents list --limit=abc
Error: Invalid limit value: abc (must be a number)
```

## Exit Codes

The CLI uses standard exit codes:

- `0` - Success
- `1` - General error (invalid arguments, command failed)
- `2` - Invalid command or syntax
- `3` - Object not found
- `4` - Validation error
- `5` - Database error
- `6` - Network error

**Example usage in scripts:**
```bash
#!/bin/bash
smrt documents get doc-123
if [ $? -eq 0 ]; then
  echo "Document found"
else
  echo "Document not found or error occurred"
  exit 1
fi
```

## Shell Completion

Enable shell completion for better CLI experience:

```bash
# Bash
smrt completion bash >> ~/.bashrc

# Zsh
smrt completion zsh >> ~/.zshrc

# Fish
smrt completion fish > ~/.config/fish/completions/smrt.fish
```

## Debugging

Enable verbose output for debugging:

```bash
# Set debug environment variable
DEBUG=smrt:* smrt gnode create my-site --template=town

# Or use verbose flag
smrt --verbose gnode create my-site --template=town
```

## Security Considerations

The CLI includes security hardening:

1. **Command Injection Protection**: Base generators are validated and `shell: true` is not used
2. **Path Traversal Protection**: Local template paths are validated to prevent `../` attacks
3. **SSRF Protection**: Git repository redirects are validated to trusted hosts only
4. **Input Validation**: All user inputs are sanitized before use

**Safe practices:**
- Always validate template sources before using
- Use official templates or templates from trusted sources
- Review generated code before deployment
- Keep `@have/smrt` package updated for security fixes

## Troubleshooting

### Template not found
```bash
Error: Template 'mytemplate' not found
```
**Solution**: Check template name spelling, verify template exists

### Permission denied
```bash
Error: EACCES: permission denied
```
**Solution**: Check directory permissions, use `sudo` if needed (not recommended), or change output directory

### Database connection failed
```bash
Error: Failed to connect to database
```
**Solution**: Verify `DATABASE_URL` environment variable, check database is running

### AI service unavailable
```bash
Error: AI service not configured
```
**Solution**: Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` environment variable

## Further Reading

- [SvelteKit Plugin Documentation](./sveltekit-plugin) - Auto-generate REST APIs from smrt objects
- [s-m-r-t Framework Overview](./overview) - Core concepts and architecture
- [Code Generation Guide](./code-generators) - Generators for APIs, MCP servers, and more
- [smrt Objects](./smrt-objects) - Define your domain models
