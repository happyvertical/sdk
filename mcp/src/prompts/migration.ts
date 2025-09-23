/**
 * Migration to SMRT Prompt
 */

export function migrationPrompt(args: any) {
  const { existingCode, preserveExisting = true, addAI = true } = args;

  return {
    description: 'Migrate existing code to SMRT framework',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I want to migrate my existing TypeScript class to use the SMRT framework.

Existing code:
\`\`\`typescript
${existingCode}
\`\`\`

Migration requirements:
- Preserve existing functionality: ${preserveExisting ? 'Yes' : 'No'}
- Add AI capabilities: ${addAI ? 'Yes' : 'No'}

Please help me migrate this code to the SMRT framework with:

## 1. Code Analysis
First, analyze the existing code to understand:
- Current class structure and inheritance
- Property definitions and types
- Existing methods and business logic
- Database/persistence patterns
- Validation and error handling
- Dependencies and external integrations

## 2. SMRT Migration Strategy
Provide a step-by-step migration plan:
- Convert properties to SMRT field definitions
- Add @smrt decorator with appropriate configuration
- Migrate to BaseObject inheritance
- Update constructor pattern
- Adapt existing methods to SMRT patterns

## 3. Field Conversion
Transform existing properties to SMRT fields:
- Map TypeScript types to appropriate SMRT field types
- Add validation rules based on existing patterns
- Set up constraints (required, unique, defaults)
- Handle complex types and relationships
- Preserve existing business rules

## 4. Method Migration
${
  preserveExisting
    ? `
Preserve and enhance existing methods:
- Keep all existing business logic intact
- Adapt method signatures for SMRT compatibility
- Update database operations to use SMRT patterns
- Maintain existing error handling
- Ensure backward compatibility where possible`
    : `
Refactor methods to SMRT patterns:
- Simplify database operations using SMRT methods
- Adopt SMRT naming conventions
- Implement standard CRUD operations
- Update error handling patterns
- Optimize for SMRT performance`
}

${
  addAI
    ? `## 5. AI Enhancement
Add AI capabilities that complement existing functionality:
- Analyze existing methods to identify AI opportunities
- Add smart validation using this.is()
- Implement content analysis with this.do()
- Add description generation with this.describe()
- Create AI-powered business intelligence methods
- Maintain compatibility with existing workflows`
    : ''
}

## 6. Configuration Migration
Set up SMRT configuration:
- Configure @smrt decorator options
- Set up API endpoint generation
- Configure CLI tools generation
- Set up MCP server capabilities
- Define lifecycle hooks for existing patterns

## 7. Database Migration
Handle data migration if needed:
- Generate migration scripts for schema changes
- Preserve existing data integrity
- Update indexes and constraints
- Handle relationship changes
- Provide rollback strategies

## 8. Testing Migration
Ensure migration correctness:
- Create tests to verify existing functionality
- Test new SMRT-specific features
- Validate database operations
- Test AI method integration
- Performance comparison with original code

## 9. Breaking Changes Documentation
If any breaking changes are necessary:
- Clearly document what changes
- Provide migration scripts for callers
- Suggest refactoring strategies
- Offer compatibility shims if possible
- Timeline for deprecation phases

## 10. Enhanced Capabilities
Showcase new SMRT capabilities:
- Auto-generated REST APIs
- CLI tool generation
- MCP server integration
- Advanced querying capabilities
- Built-in caching and performance optimizations

## 11. Migration Checklist
Provide a complete checklist:
- [ ] Class structure migrated
- [ ] All fields converted
- [ ] Methods updated and tested
- [ ] Database schema updated
- [ ] Tests passing
- [ ] AI methods integrated
- [ ] Configuration completed
- [ ] Documentation updated

## 12. Usage Comparison
Show before/after examples:
- Original usage patterns
- New SMRT-based usage
- Enhanced capabilities
- Performance improvements
- Simplified operations

Please provide complete migrated code that maintains all existing functionality while unlocking the full power of the SMRT framework. Include detailed migration notes and any necessary transformation scripts.`,
        },
      },
    ],
  };
}
