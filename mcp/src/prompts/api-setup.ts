/**
 * API Setup Prompt
 */

export function apiSetupPrompt(args: any) {
  const { objects, includeAuth = true, includeSwagger = true } = args;

  const objectList = Array.isArray(objects) ? objects : [objects];

  return {
    description: 'Set up REST API for SMRT objects',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I want to set up a complete REST API for my SMRT objects using the API generator.

Objects to include:
${objectList.map((obj: string) => `- ${obj}`).join('\n')}

Configuration:
- Authentication: ${includeAuth ? 'Yes' : 'No'}
- OpenAPI/Swagger: ${includeSwagger ? 'Yes' : 'No'}

Please help me create a production-ready API that includes:

## 1. API Generator Configuration
Set up the APIGenerator with:
- Comprehensive endpoint configuration for each object
- Security middleware and access controls
- Input validation and sanitization
- Error handling and response formatting
- CORS and rate limiting setup

## 2. Endpoint Design
For each object, generate:
- RESTful endpoints following best practices
- Proper HTTP methods and status codes
- Consistent URL patterns and naming
- Pagination and filtering support
- Bulk operations where appropriate

## 3. Authentication & Authorization
${
  includeAuth
    ? `
Implement:
- JWT-based authentication system
- Role-based access control (RBAC)
- API key management
- Rate limiting per user/key
- Session management and refresh tokens
- Secure password handling and storage`
    : 'Skip authentication setup'
}

## 4. Input Validation & Sanitization
Provide:
- Automatic validation based on SMRT field definitions
- Custom validation rules for complex business logic
- Input sanitization to prevent injection attacks
- Request size limits and file upload handling
- Error messages that don't leak sensitive information

## 5. Response Formatting
Ensure:
- Consistent JSON response structure
- Proper error response formats
- Metadata inclusion (pagination, counts, etc.)
- Content negotiation support
- Compression and caching headers

## 6. OpenAPI Documentation
${
  includeSwagger
    ? `
Generate:
- Complete OpenAPI 3.0 specification
- Interactive Swagger UI interface
- Example requests and responses
- Authentication flow documentation
- SDK generation support
- API versioning strategy`
    : 'Skip OpenAPI documentation'
}

## 7. Middleware Stack
Configure:
- Request logging and monitoring
- Error handling and reporting
- Security headers (CORS, CSP, etc.)
- Request/response transformation
- Health checks and metrics endpoints

## 8. Performance Optimization
Implement:
- Response caching strategies
- Database query optimization
- Connection pooling
- Compression and minification
- CDN integration points

## 9. Testing Infrastructure
Provide:
- Integration test suite for all endpoints
- Authentication and authorization tests
- Performance and load testing setup
- API contract testing
- Mock server for development

## 10. Deployment Configuration
Include:
- Environment-specific configurations
- Docker containerization setup
- CI/CD pipeline integration
- Health monitoring and alerting
- Backup and disaster recovery

## 11. Client SDK Generation
Set up:
- TypeScript/JavaScript client SDK
- Auto-generated API clients
- Type-safe request/response handling
- Error handling and retry logic
- Real-time updates and webhooks

## 12. Usage Examples
Demonstrate:
- Complete API setup and deployment
- Client integration examples
- Authentication flow implementation
- Error handling patterns
- Performance optimization techniques

Please provide complete, production-ready code that follows REST API best practices, includes comprehensive security measures, and integrates seamlessly with the SMRT framework. Include deployment scripts and configuration files for popular hosting platforms.`,
        },
      },
    ],
  };
}
