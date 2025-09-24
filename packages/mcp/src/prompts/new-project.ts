/**
 * New SMRT Project Prompt
 */

export function newSmrtProjectPrompt(args: any) {
  const {
    projectName,
    projectType = 'web-app',
    useTypeScript = true,
    includeDatabase = true,
  } = args;

  const projectTypes = {
    'web-app': 'a full-stack web application with frontend and API',
    'api-server': 'a REST API server with database integration',
    'cli-tool': 'a command-line tool with interactive features',
    'mcp-server': 'an MCP server for AI integration',
  };

  const typeDescription =
    projectTypes[projectType as keyof typeof projectTypes] ||
    projectTypes['web-app'];

  return {
    description: `Initialize new SMRT project: ${projectName}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I want to create a new project called "${projectName}" using the SMRT framework. This will be ${typeDescription}.

Project specifications:
- Language: ${useTypeScript ? 'TypeScript' : 'JavaScript'}
- Database: ${includeDatabase ? 'Yes (SQLite for development, PostgreSQL for production)' : 'No'}
- Project type: ${projectType}

Please help me set up:

## 1. Project Structure
Create the complete directory structure including:
- Source code organization
- Configuration files (package.json, tsconfig.json, etc.)
- Development and build scripts
- Testing setup

## 2. Core Dependencies
Set up the essential dependencies:
- SMRT framework packages (@have/smrt, @have/ai, etc.)
- Database drivers and ORM setup
- Development tools (TypeScript, testing, linting)
- Build and deployment tools

## 3. Initial Configuration
Configure:
- TypeScript settings optimized for SMRT
- Database connection and migration setup
- Environment variable management
- Development server and hot reload

## 4. Starter Code
Provide:
- Basic project entry point
- Example SMRT object with proper patterns
- Database initialization and connection
- Configuration for different environments

## 5. Development Workflow
Set up:
- Scripts for development, testing, and building
- Code formatting and linting rules
- Git hooks and commit standards
- Documentation templates

## 6. Deployment Preparation
Include:
- Production build configuration
- Environment-specific settings
- Docker setup (if applicable)
- Deployment scripts and CI/CD templates

Please provide complete, production-ready code that follows SMRT framework best practices and modern development standards.`,
        },
      },
    ],
  };
}
