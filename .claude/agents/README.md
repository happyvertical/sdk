# HAVE SDK Expert Agents

This directory contains specialized expert agents for each package in the HAVE SDK. Each agent is designed to provide deep expertise in the foundational libraries and core technologies used by their respective packages.

## Available Agents

### Core Library Agents

| Agent | Package | Expertise |
|-------|---------|-----------|
| [utils-expert](./utils-expert.md) | `@have/utils` | cuid2, date-fns, pluralize, uuid |
| [files-expert](./files-expert.md) | `@have/files` | Node.js fs/promises, path utilities |
| [sql-expert](./sql-expert.md) | `@have/sql` | @libsql/client, sqlite-vss, pg |
| [ai-expert](./ai-expert.md) | `@have/ai` | openai, @google/generative-ai, @anthropic-ai/sdk, @aws-sdk/client-bedrock-runtime |
| [spider-expert](./spider-expert.md) | `@have/spider` | @mozilla/readability, cheerio, happy-dom, undici |
| [pdf-expert](./pdf-expert.md) | `@have/pdf` | unpdf, @gutenye/ocr-node |
| [smrt-expert](./smrt-expert.md) | `@have/smrt` | All above packages + @langchain/community, yaml |

### Application Agents

| Agent | Package | Expertise |
|-------|---------|-----------|
| [api-expert](./api-expert.md) | `@have/smrt-api` | express, swagger-ui-express |
| [mcp-expert](./mcp-expert.md) | `@have/smrt-mcp` | Model Context Protocol (MCP) |
| [cli-expert](./cli-expert.md) | `@have/smrt-cli` | commander, chalk, ora, inquirer |
| [template-expert](./template-expert.md) | `@have/smrt-template` | Code generation, scaffolding |

## Agent Capabilities

Each expert agent provides:

1. **Deep Library Knowledge**: Comprehensive understanding of foundational libraries
2. **Best Practices**: Proven patterns and conventions for their domain
3. **Troubleshooting**: Common issues and debugging strategies
4. **Performance Optimization**: Techniques for optimizing performance
5. **Security Guidance**: Security considerations and best practices
6. **Integration Knowledge**: How packages work together in the broader SDK

## Usage

These agents are designed to be invoked when working with specific packages or technologies. They can help with:

- **Development Questions**: "How do I optimize SQLite queries in @have/sql?"
- **Debugging Issues**: "Why is my PDF OCR failing?"
- **Architecture Decisions**: "Should I use streaming for large file operations?"
- **Performance Problems**: "How can I speed up web scraping?"
- **Security Concerns**: "What are the security considerations for AI API integration?"

## Expert Areas by Technology

### Database Technologies
- **SQLite**: `sql-expert` - LibSQL, vector search, query optimization
- **PostgreSQL**: `sql-expert` - Connection pooling, advanced features
- **Schema Management**: `sql-expert`, `smrt-expert` - Auto-generation, migrations

### AI Technologies
- **OpenAI**: `ai-expert` - GPT models, function calling, streaming
- **Google Gemini**: `ai-expert` - Multi-modal capabilities, safety settings
- **Anthropic Claude**: `ai-expert` - Constitutional AI, message formatting
- **AWS Bedrock**: `ai-expert` - Model access, cost optimization

### Web Technologies
- **Web Scraping**: `spider-expert` - Content extraction, browser automation
- **DOM Manipulation**: `spider-expert` - Cheerio, CSS selectors
- **HTTP Clients**: `spider-expert` - Undici, request optimization
- **Content Processing**: `spider-expert` - Readability, cleaning

### File Processing
- **PDF Processing**: `pdf-expert` - Text extraction, OCR, metadata
- **File System**: `files-expert` - Cross-platform operations, temporary files
- **Document Analysis**: `pdf-expert`, `smrt-expert` - Structure extraction

### Development Tools
- **CLI Development**: `cli-expert` - Interactive prompts, progress indicators
- **Code Generation**: `template-expert` - Scaffolding, dynamic templates
- **API Development**: `api-expert` - REST patterns, OpenAPI documentation
- **MCP Integration**: `mcp-expert` - AI tool integration, protocol implementation

### Utility Functions
- **String Processing**: `utils-expert` - Transformations, validation
- **Date Handling**: `utils-expert` - Parsing, formatting, timezone handling
- **ID Generation**: `utils-expert` - CUID2, UUID strategies
- **Type Operations**: `utils-expert` - Validation, conversion

## Integration Examples

### Cross-Package Workflows
```typescript
// Example: Document processing pipeline
// 1. spider-expert: Extract content from web
// 2. pdf-expert: Process PDF documents
// 3. ai-expert: Analyze content with AI
// 4. sql-expert: Store results in database
// 5. api-expert: Expose via REST API
```

### Troubleshooting Workflows
```typescript
// Example: Performance optimization
// 1. Identify bottleneck (sql-expert for queries, spider-expert for scraping)
// 2. Apply domain-specific optimizations
// 3. Monitor with appropriate tools
// 4. Validate improvements with smrt-expert
```

## Best Practices for Agent Usage

1. **Specific Questions**: Ask domain-specific questions to the appropriate expert
2. **Context Sharing**: Provide relevant code and error messages
3. **Multiple Experts**: Consult multiple agents for cross-package issues
4. **Implementation Validation**: Use experts to review proposed solutions
5. **Performance Tuning**: Leverage expert knowledge for optimization

## Maintenance

These expert agents should be updated when:
- New foundational libraries are added to packages
- Best practices evolve in specific domains
- New features are added to packages
- Security vulnerabilities or updates affect libraries
- Performance optimization techniques are discovered

Each agent is maintained as a markdown file with structured knowledge that can be easily updated and referenced during development work.