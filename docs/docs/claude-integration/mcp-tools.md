# MCP Tools Reference

The SMRT MCP server provides a comprehensive set of tools for code generation, validation, and development assistance. This reference documents all available tools and their usage.

## Code Generation Tools

### generate-smrt-class

Create a complete SMRT object class with proper decorators and field definitions.

**Input Schema:**
```json
{
  "className": "string (required)",
  "fields": [
    {
      "name": "string (required)",
      "type": "text|integer|decimal|boolean|datetime|json|foreignKey",
      "options": {
        "required": "boolean",
        "unique": "boolean",
        "default": "any",
        "maxLength": "number",
        "min": "number",
        "max": "number"
      }
    }
  ],
  "decoratorConfig": {
    "api": {
      "exclude": ["delete"],
      "middleware": ["auth"]
    },
    "cli": true,
    "mcp": {
      "include": ["list", "get", "create"]
    }
  },
  "includeAIMethods": "boolean"
}
```

**Example Usage:**
> "Create a Product class with name (required text), price (decimal with min 0), and inStock (boolean defaulting to true)"

### add-ai-methods

Add AI-powered methods to existing SMRT objects.

**Input Schema:**
```json
{
  "className": "string (required)",
  "methods": [
    {
      "name": "string (required)",
      "type": "do|is|describe|custom",
      "description": "string",
      "prompt": "string"
    }
  ],
  "existingCode": "string (optional)"
}
```

**Common AI Method Types:**
- **do**: Performs actions and transformations
- **is**: Returns boolean validation results
- **describe**: Generates descriptions and analysis
- **custom**: Custom logic with inferred return types

**Example Usage:**
> "Add AI methods to analyze product quality and generate descriptions"

### generate-field-definitions

Generate field definitions for SMRT objects with proper validation.

**Input Schema:**
```json
{
  "fields": [
    {
      "name": "string (required)",
      "type": "string (required)",
      "options": "object"
    }
  ]
}
```

**Supported Field Types:**
- `text`: String fields with validation
- `integer`: Whole numbers with constraints
- `decimal`: Floating point numbers
- `boolean`: True/false values
- `datetime`: Date and time fields
- `json`: Structured data objects
- `foreignKey`: References to other objects
- `oneToMany`: One-to-many relationships
- `manyToMany`: Many-to-many relationships

### generate-collection

Create collection classes for managing SMRT objects.

**Input Schema:**
```json
{
  "objectClassName": "string (required)",
  "collectionName": "string (optional)",
  "customMethods": [
    {
      "name": "string",
      "description": "string",
      "parameters": [
        {
          "name": "string",
          "type": "string",
          "description": "string"
        }
      ]
    }
  ]
}
```

**Generated Methods:**
- Basic CRUD operations
- Custom query methods
- AI-enhanced search
- Bulk operations
- Analytics methods

## Configuration Tools

### configure-decorators

Configure @smrt decorator options for API, CLI, and MCP generation.

**Input Schema:**
```json
{
  "className": "string (required)",
  "api": {
    "include": ["list", "get", "create", "update", "delete"],
    "exclude": ["delete"],
    "middleware": ["auth", "validation"]
  },
  "cli": true,
  "mcp": {
    "include": ["list", "get", "search"],
    "exclude": ["delete"]
  },
  "hooks": {
    "beforeSave": true,
    "afterCreate": true
  }
}
```

**Configuration Templates:**
- `public-api`: Full REST API access
- `read-only`: List and get operations only
- `admin-only`: Full CRUD with authentication
- `content-management`: CRUD with AI assistance
- `minimal`: Basic read operations

## Validation Tools

### validate-smrt-object

Validate SMRT object code for correct structure and best practices.

**Input Schema:**
```json
{
  "code": "string (required)"
}
```

**Validation Checks:**
- Required imports from @have/smrt
- Proper @smrt decorator usage
- Correct class structure
- Field definition patterns
- Constructor implementation
- Lifecycle hook patterns
- AI method implementations

**Output Format:**
- Validation status (pass/fail)
- Error messages with fix suggestions
- Warning messages for improvements
- Best practice recommendations

## Preview Tools

### preview-api-endpoints

Preview REST API endpoints that would be generated for a SMRT object.

**Input Schema:**
```json
{
  "className": "string (required)",
  "decoratorConfig": {
    "api": {
      "exclude": ["delete"],
      "middleware": ["auth"]
    }
  }
}
```

**Generated Preview:**
- Complete endpoint specifications
- HTTP methods and paths
- Request/response schemas
- Authentication requirements
- OpenAPI documentation
- Usage examples with curl

### preview-mcp-tools

Preview MCP tools that would be generated for a SMRT object.

**Input Schema:**
```json
{
  "className": "string (required)",
  "decoratorConfig": {
    "mcp": {
      "include": ["list", "get", "create"],
      "exclude": ["delete"]
    }
  }
}
```

**Generated Preview:**
- MCP tool definitions
- Input/output schemas
- Usage examples
- Claude integration examples
- Server configuration

## Field Definition Reference

### Text Fields

```typescript
text({
  required: boolean,
  unique: boolean,
  maxLength: number,
  minLength: number,
  pattern: string,     // RegExp pattern
  encrypted: boolean,
  index: boolean
})
```

**Common Patterns:**
- Email: `pattern: '^[^@]+@[^@]+\\.[^@]+$'`
- Phone: `pattern: '^\\+?[1-9]\\d{1,14}$'`
- URL: `pattern: '^https?://.*'`
- Slug: `pattern: '^[a-z0-9-]+$'`

### Numeric Fields

```typescript
integer({
  required: boolean,
  min: number,
  max: number,
  default: number
})

decimal({
  required: boolean,
  min: number,
  max: number,
  default: number
})
```

### Relationship Fields

```typescript
foreignKey(RelatedClass, {
  required: boolean,
  onDelete: 'cascade' | 'restrict' | 'set_null'
})

oneToMany(RelatedClass, {
  onDelete: 'cascade' | 'restrict' | 'set_null'
})

manyToMany(RelatedClass, {
  onDelete: 'cascade' | 'restrict' | 'set_null'
})
```

### Special Fields

```typescript
datetime({
  required: boolean,
  default: Date | 'NOW()'
})

json({
  required: boolean,
  default: {} | []
})

boolean({
  required: boolean,
  default: boolean
})
```

## AI Method Patterns

### Content Analysis

```typescript
async analyzeQuality(): Promise<number> {
  return await this.do(`
    Rate the quality of this content on a scale of 1-10.
    Consider completeness, accuracy, and usefulness.
    Respond with only the number.
  `);
}
```

### Validation

```typescript
async isComplete(): Promise<boolean> {
  return await this.is(`
    This object has all required fields filled and
    meets the minimum quality standards for publication.
  `);
}
```

### Content Generation

```typescript
async generateSummary(): Promise<string> {
  return await this.describe(`
    Create a 2-3 sentence summary highlighting
    the most important aspects of this object.
  `);
}
```

### Business Logic

```typescript
async suggestPrice(): Promise<number> {
  const suggestion = await this.do(`
    Analyze this product and suggest an optimal price
    based on features, category, and market rates.
    Respond with just the number.
  `);

  return parseFloat(suggestion);
}
```

## Error Handling

All tools include comprehensive error handling:

### Common Error Types

1. **Validation Errors**: Invalid input parameters
2. **Generation Errors**: Code generation failures
3. **AI Errors**: AI service timeouts or failures
4. **System Errors**: File system or dependency issues

### Error Response Format

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Error description with fix suggestions"
    }
  ]
}
```

### Best Practices

1. **Provide complete input**: Ensure all required parameters are included
2. **Use valid field types**: Stick to supported field types and options
3. **Test generated code**: Always validate generated code before use
4. **Handle AI failures**: Include fallbacks for AI-powered methods
5. **Check dependencies**: Ensure SMRT framework is properly installed

## Tool Chaining

Tools can be used together for complex workflows:

### Complete Object Creation

1. `generate-smrt-class` → Create basic object
2. `add-ai-methods` → Add intelligence
3. `configure-decorators` → Set up API/CLI
4. `validate-smrt-object` → Verify implementation
5. `preview-api-endpoints` → Review generated API

### Migration Workflow

1. `validate-smrt-object` → Check existing code
2. `generate-field-definitions` → Update field patterns
3. `add-ai-methods` → Enhance with AI
4. `configure-decorators` → Add generation config
5. `preview-mcp-tools` → See new capabilities

This comprehensive toolset enables rapid development of sophisticated SMRT applications with AI-powered capabilities.