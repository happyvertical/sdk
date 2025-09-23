/**
 * Validate SMRT Object Tool
 */

interface ValidationIssue {
  type: 'error' | 'warning' | 'suggestion';
  message: string;
  line?: number;
  code?: string;
}

interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  suggestions: string[];
}

interface ValidateObjectArgs {
  code: string;
}

export async function validateSmrtObject(
  args: ValidateObjectArgs,
): Promise<string> {
  const { code } = args;
  const result = validateCode(code);

  return formatValidationResult(result);
}

function validateCode(code: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const suggestions: string[] = [];
  const lines = code.split('\n');

  // Check for required imports
  validateImports(code, issues);

  // Check for @smrt decorator
  validateDecorator(code, issues, suggestions);

  // Check class structure
  validateClassStructure(code, issues, suggestions);

  // Check field definitions
  validateFieldDefinitions(code, issues, suggestions);

  // Check constructor
  validateConstructor(code, issues, suggestions);

  // Check lifecycle hooks
  validateLifecycleHooks(code, issues, suggestions);

  // Check AI methods
  validateAIMethods(code, issues, suggestions);

  const hasErrors = issues.some((issue) => issue.type === 'error');

  return {
    isValid: !hasErrors,
    issues,
    suggestions: [...suggestions, ...generateGeneralSuggestions(code)],
  };
}

function validateImports(code: string, issues: ValidationIssue[]): void {
  const requiredImports = ['BaseObject'];
  const importLine = code
    .split('\n')
    .find(
      (line) =>
        line.includes('from @have/smrt') || line.includes("from '@have/smrt'"),
    );

  if (!importLine) {
    issues.push({
      type: 'error',
      message:
        'Missing import from @have/smrt. Add: import { BaseObject, smrt } from "@have/smrt";',
      code: 'MISSING_IMPORT',
    });
    return;
  }

  for (const required of requiredImports) {
    if (!importLine.includes(required)) {
      issues.push({
        type: 'error',
        message: `Missing required import: ${required}`,
        code: 'MISSING_REQUIRED_IMPORT',
      });
    }
  }

  // Check if using field types without importing them
  const fieldTypes = [
    'text',
    'integer',
    'decimal',
    'boolean',
    'datetime',
    'json',
    'foreignKey',
  ];
  const usedFieldTypes = fieldTypes.filter((type) => code.includes(`${type}(`));

  for (const fieldType of usedFieldTypes) {
    if (!importLine.includes(fieldType)) {
      issues.push({
        type: 'error',
        message: `Using field type '${fieldType}' but not importing it`,
        code: 'MISSING_FIELD_IMPORT',
      });
    }
  }
}

function validateDecorator(
  code: string,
  issues: ValidationIssue[],
  suggestions: string[],
): void {
  const decoratorMatch = code.match(/@smrt\s*\(/);

  if (!decoratorMatch) {
    const hasClass =
      code.includes('class') && code.includes('extends BaseObject');
    if (hasClass) {
      issues.push({
        type: 'warning',
        message: 'Class extends BaseObject but missing @smrt decorator',
        code: 'MISSING_DECORATOR',
      });
      suggestions.push(
        'Add @smrt() decorator before the class declaration for automatic API/CLI/MCP generation',
      );
    }
  }

  // Validate decorator configuration
  if (decoratorMatch) {
    try {
      const decoratorSection = extractDecoratorConfig(code);
      validateDecoratorConfig(decoratorSection, issues);
    } catch (error) {
      issues.push({
        type: 'error',
        message: 'Invalid @smrt decorator configuration',
        code: 'INVALID_DECORATOR',
      });
    }
  }
}

function validateClassStructure(
  code: string,
  issues: ValidationIssue[],
  suggestions: string[],
): void {
  const classMatch = code.match(/class\s+(\w+)\s+extends\s+BaseObject/);

  if (!classMatch) {
    issues.push({
      type: 'error',
      message: 'No class found extending BaseObject',
      code: 'NO_BASE_CLASS',
    });
    return;
  }

  const className = classMatch[1];

  // Check if class name follows conventions
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(className)) {
    issues.push({
      type: 'warning',
      message:
        'Class name should be PascalCase (e.g., ProductItem, not productItem or product_item)',
      code: 'CLASS_NAMING',
    });
  }

  // Check if class is exported
  if (!code.includes(`export class ${className}`)) {
    issues.push({
      type: 'warning',
      message: 'Class should be exported for use in other modules',
      code: 'NOT_EXPORTED',
    });
  }
}

function validateFieldDefinitions(
  code: string,
  issues: ValidationIssue[],
  suggestions: string[],
): void {
  const fieldPattern =
    /(\w+)\s*=\s*(text|integer|decimal|boolean|datetime|json|foreignKey|oneToMany|manyToMany)\s*\(/g;
  const fields: string[] = [];
  let match;

  while ((match = fieldPattern.exec(code)) !== null) {
    const fieldName = match[1];
    const fieldType = match[2];
    fields.push(fieldName);

    // Check field naming conventions
    if (!/^[a-z][a-zA-Z0-9]*$/.test(fieldName)) {
      issues.push({
        type: 'warning',
        message: `Field '${fieldName}' should be camelCase`,
        code: 'FIELD_NAMING',
      });
    }

    // Check for common field validation
    if (fieldName.includes('email') && fieldType !== 'text') {
      issues.push({
        type: 'warning',
        message: `Field '${fieldName}' appears to be an email but is not text type`,
        code: 'FIELD_TYPE_MISMATCH',
      });
    }

    if (fieldName.includes('password') && !code.includes('encrypted: true')) {
      suggestions.push(
        `Consider encrypting the '${fieldName}' field with { encrypted: true }`,
      );
    }
  }

  if (fields.length === 0) {
    issues.push({
      type: 'warning',
      message:
        'No field definitions found. SMRT objects should have at least one field.',
      code: 'NO_FIELDS',
    });
  }

  // Check for required fields
  const hasNameField = fields.some(
    (f) => f.includes('name') || f.includes('title'),
  );
  if (!hasNameField) {
    suggestions.push(
      'Consider adding a name or title field for better object identification',
    );
  }
}

function validateConstructor(
  code: string,
  issues: ValidationIssue[],
  suggestions: string[],
): void {
  const hasConstructor = code.includes('constructor(');

  if (!hasConstructor) {
    issues.push({
      type: 'error',
      message:
        'Missing constructor. SMRT objects require a constructor that calls super() and assigns options.',
      code: 'MISSING_CONSTRUCTOR',
    });
    return;
  }

  const constructorMatch = code.match(/constructor\s*\([^)]*\)\s*{([^}]*)}/s);
  if (constructorMatch) {
    const constructorBody = constructorMatch[1];

    if (!constructorBody.includes('super(')) {
      issues.push({
        type: 'error',
        message: 'Constructor must call super(options)',
        code: 'MISSING_SUPER_CALL',
      });
    }

    if (!constructorBody.includes('Object.assign(this, options)')) {
      issues.push({
        type: 'warning',
        message:
          'Constructor should include Object.assign(this, options) to set properties',
        code: 'MISSING_ASSIGN',
      });
    }
  }
}

function validateLifecycleHooks(
  code: string,
  issues: ValidationIssue[],
  suggestions: string[],
): void {
  const lifecycleHooks = [
    'beforeSave',
    'afterSave',
    'beforeCreate',
    'afterCreate',
    'beforeUpdate',
    'afterUpdate',
    'beforeDelete',
    'afterDelete',
  ];

  for (const hook of lifecycleHooks) {
    if (code.includes(hook)) {
      const hookMatch = code.match(new RegExp(`async\\s+${hook}\\s*\\(`));
      if (!hookMatch) {
        issues.push({
          type: 'warning',
          message: `Lifecycle hook '${hook}' should be async`,
          code: 'HOOK_NOT_ASYNC',
        });
      }
    }
  }

  const hasSlugField = code.includes('slug =');
  const hasSlugGeneration = code.includes('getSlug()');

  if (hasSlugField && !hasSlugGeneration) {
    suggestions.push(
      'Consider adding slug generation in beforeSave hook: if (!this.slug && this.name) { this.slug = await this.getSlug(); }',
    );
  }
}

function validateAIMethods(
  code: string,
  issues: ValidationIssue[],
  suggestions: string[],
): void {
  const aiMethodPattern =
    /async\s+(\w+)\s*\([^)]*\)\s*:\s*Promise<[^>]+>\s*{[^}]*\.(do|is|describe)\s*\(/g;
  let aiMethodCount = 0;
  let match;

  while ((match = aiMethodPattern.exec(code)) !== null) {
    aiMethodCount++;
    const methodName = match[1];
    const aiType = match[2];

    // Check method naming conventions
    if (
      aiType === 'is' &&
      !methodName.startsWith('is') &&
      !methodName.startsWith('can') &&
      !methodName.startsWith('has')
    ) {
      suggestions.push(
        `Method '${methodName}' uses this.is() but name doesn't indicate boolean return (consider is${methodName[0].toUpperCase() + methodName.slice(1)})`,
      );
    }
  }

  if (aiMethodCount === 0) {
    suggestions.push(
      'Consider adding AI-powered methods using this.do(), this.is(), or this.describe() for enhanced functionality',
    );
  }
}

function extractDecoratorConfig(code: string): string {
  const match = code.match(/@smrt\s*\(([^}]*})/s);
  return match ? match[1] : '';
}

function validateDecoratorConfig(
  config: string,
  issues: ValidationIssue[],
): void {
  // Basic validation of decorator configuration
  if (config.includes('exclude') && config.includes('include')) {
    issues.push({
      type: 'warning',
      message:
        'Using both include and exclude in decorator config. Include takes precedence.',
      code: 'CONFLICTING_CONFIG',
    });
  }
}

function generateGeneralSuggestions(code: string): string[] {
  const suggestions: string[] = [];

  // Check for TypeScript features
  if (!code.includes('interface') && code.includes('options: any')) {
    suggestions.push(
      'Consider defining a TypeScript interface for constructor options instead of using "any"',
    );
  }

  // Check for JSDoc comments
  if (!code.includes('/**') && !code.includes('//')) {
    suggestions.push(
      'Consider adding JSDoc comments to document your class and methods',
    );
  }

  // Check for error handling
  if (
    code.includes('await') &&
    !code.includes('try') &&
    !code.includes('catch')
  ) {
    suggestions.push('Consider adding error handling for async operations');
  }

  return suggestions;
}

function formatValidationResult(result: ValidationResult): string {
  let output = `# SMRT Object Validation Result\n\n`;

  if (result.isValid) {
    output += `✅ **Validation passed!** Your SMRT object follows best practices.\n\n`;
  } else {
    output += `❌ **Validation failed.** Please fix the following issues:\n\n`;
  }

  if (result.issues.length > 0) {
    output += `## Issues Found\n\n`;

    const errors = result.issues.filter((i) => i.type === 'error');
    const warnings = result.issues.filter((i) => i.type === 'warning');

    if (errors.length > 0) {
      output += `### ❌ Errors (must fix)\n`;
      for (const error of errors) {
        output += `- **${error.message}**\n`;
        if (error.code) output += `  - Code: \`${error.code}\`\n`;
      }
      output += `\n`;
    }

    if (warnings.length > 0) {
      output += `### ⚠️ Warnings (should fix)\n`;
      for (const warning of warnings) {
        output += `- ${warning.message}\n`;
        if (warning.code) output += `  - Code: \`${warning.code}\`\n`;
      }
      output += `\n`;
    }
  }

  if (result.suggestions.length > 0) {
    output += `## 💡 Suggestions for Improvement\n\n`;
    for (const suggestion of result.suggestions) {
      output += `- ${suggestion}\n`;
    }
    output += `\n`;
  }

  output += `## Next Steps\n\n`;

  if (!result.isValid) {
    output += `1. Fix all errors marked with ❌\n`;
    output += `2. Address warnings marked with ⚠️\n`;
    output += `3. Consider implementing suggestions\n`;
    output += `4. Re-run validation to confirm fixes\n`;
  } else {
    output += `1. Consider implementing suggestions for better code quality\n`;
    output += `2. Add comprehensive tests for your SMRT object\n`;
    output += `3. Generate API/CLI/MCP tools using the SMRT generators\n`;
  }

  return output;
}
