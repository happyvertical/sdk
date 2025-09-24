/**
 * AI Integration Prompt
 */

export function aiIntegrationPrompt(args: any) {
  const {
    objectName,
    aiCapabilities = 'analysis,validation,generation',
    aiProvider = 'openai',
  } = args;

  const capabilities = aiCapabilities.split(',').map((c: string) => c.trim());

  const capabilityDescriptions = {
    analysis:
      'Content analysis, sentiment analysis, quality assessment, insights generation',
    validation:
      'Data validation, business rule checking, consistency verification',
    generation:
      'Content generation, text enhancement, auto-completion, suggestions',
    classification: 'Automatic categorization, tagging, content organization',
    summarization: 'Content summarization, key points extraction, abstracts',
    translation: 'Multi-language support, content localization',
    search: 'Semantic search, similarity matching, content discovery',
    recommendation: 'Personalized recommendations, content suggestions',
  };

  return {
    description: `Add AI capabilities to ${objectName}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I want to add AI capabilities to my existing "${objectName}" SMRT object.

Target AI capabilities:
${capabilities.map((cap: string) => `- ${cap}: ${capabilityDescriptions[cap as keyof typeof capabilityDescriptions] || 'Custom AI functionality'}`).join('\n')}

AI Provider: ${aiProvider}

Please help me implement comprehensive AI integration that includes:

## 1. AI Method Design
For each capability, provide:
- Well-designed AI methods using this.do(), this.is(), and this.describe()
- Clear method names that indicate their purpose and return types
- Proper error handling and fallback strategies
- Performance optimization and caching where appropriate

## 2. Smart Prompts
Create effective AI prompts that:
- Are specific to the business domain and object type
- Include relevant context from object properties
- Handle edge cases and invalid data gracefully
- Provide consistent and reliable results
- Are optimized for the chosen AI provider

## 3. Integration Patterns
Implement AI methods that:
- Leverage object data effectively
- Work well with the SMRT framework lifecycle
- Can be chained and combined for complex workflows
- Support batch processing for multiple objects
- Maintain data integrity and consistency

## 4. Advanced Features
${
  capabilities.includes('analysis')
    ? `
### Analysis Capabilities
- Content quality assessment
- Data completeness scoring
- Business rule compliance checking
- Performance metrics and insights
- Trend analysis and pattern detection`
    : ''
}

${
  capabilities.includes('validation')
    ? `
### Validation Capabilities
- Real-time data validation
- Business logic verification
- Cross-field consistency checking
- External data source validation
- Regulatory compliance checking`
    : ''
}

${
  capabilities.includes('generation')
    ? `
### Generation Capabilities
- Content creation and enhancement
- Template-based generation
- Personalized content creation
- Auto-completion and suggestions
- Dynamic content optimization`
    : ''
}

${
  capabilities.includes('search')
    ? `
### Search Capabilities
- Semantic similarity search
- Content recommendation
- Fuzzy matching and suggestions
- Multi-criteria search optimization
- Relevance scoring and ranking`
    : ''
}

## 5. Collection-Level AI
Extend the collection class with:
- Bulk AI operations for multiple objects
- Aggregate analysis and insights
- Smart filtering and search
- Batch content enhancement
- Collection-wide quality assessment

## 6. Performance Optimization
Implement:
- Response caching for expensive operations
- Batch processing for bulk operations
- Asynchronous processing for long-running tasks
- Rate limiting and quota management
- Error recovery and retry logic

## 7. Configuration and Customization
Provide:
- Configurable AI model selection
- Customizable prompt templates
- Adjustable confidence thresholds
- Provider-specific optimizations
- Environment-based configuration

## 8. Testing and Validation
Include:
- Unit tests for AI method reliability
- Integration tests with different data types
- Performance benchmarks
- Error handling verification
- Mock implementations for testing

## 9. Usage Examples
Demonstrate:
- Common AI workflow patterns
- Integration with business processes
- Error handling and edge cases
- Performance optimization techniques
- Real-world application scenarios

Please provide production-ready code that follows SMRT framework best practices, includes comprehensive error handling, and demonstrates the full potential of AI integration with the specified capabilities.`,
        },
      },
    ],
  };
}
