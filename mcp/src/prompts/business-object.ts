/**
 * Business Object Creation Prompt
 */

export function businessObjectPrompt(args: any) {
  const {
    objectName,
    domain = 'general',
    includeRelationships = false,
    includeAI = true,
  } = args;

  const domainContext = {
    'e-commerce': 'online retail and product management',
    content: 'content management and publishing',
    hr: 'human resources and employee management',
    finance: 'financial management and accounting',
    healthcare: 'healthcare and patient management',
    education: 'educational institutions and learning',
    'real-estate': 'property management and real estate',
    logistics: 'supply chain and logistics management',
    social: 'social networking and community features',
    general: 'general business applications',
  };

  const context =
    domainContext[domain as keyof typeof domainContext] ||
    domainContext.general;

  return {
    description: `Create business object: ${objectName}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I want to create a business object called "${objectName}" for ${context}.

Requirements:
- Domain: ${domain}
- Include relationships: ${includeRelationships ? 'Yes' : 'No'}
- Include AI methods: ${includeAI ? 'Yes' : 'No'}

Please help me create a complete, production-ready SMRT object that includes:

## 1. Object Definition
- Proper @smrt decorator with appropriate configuration
- Field definitions with correct types and validation
- Business logic and domain-specific methods
- Lifecycle hooks for data integrity

## 2. Field Design
- Core business fields relevant to the domain
- Appropriate field types (text, integer, decimal, boolean, datetime, json)
- Validation rules (required, unique, min/max values, patterns)
- Default values and constraints
- Indexed fields for performance

${
  includeRelationships
    ? `## 3. Relationships
- Foreign key relationships to other objects
- One-to-many and many-to-many associations
- Proper cascade and deletion policies
- Navigation properties for easy access`
    : ''
}

## 4. Business Logic
- Domain-specific methods and operations
- Data validation and business rules
- Calculated properties and derived fields
- State management and transitions

${
  includeAI
    ? `## 5. AI Integration
- AI-powered analysis and insights methods
- Content generation and enhancement
- Quality assessment and validation
- Smart categorization and tagging
- Semantic search capabilities`
    : ''
}

## 6. Collection Class
- Custom query methods for common use cases
- Bulk operations and batch processing
- Domain-specific search and filtering
- Analytics and reporting methods

## 7. API Configuration
- REST endpoint configuration
- Security and access control
- Validation middleware
- Error handling

## 8. Usage Examples
- Object creation and manipulation
- Common business workflows
- Integration with other systems
- Testing patterns

Please ensure the code follows SMRT framework best practices, includes comprehensive error handling, and is optimized for the specific domain requirements. Provide real-world examples that demonstrate practical usage patterns.`,
        },
      },
    ],
  };
}
