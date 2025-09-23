/**
 * Generate Field Definitions Tool
 */

interface FieldDefinition {
  name: string;
  type:
    | 'text'
    | 'integer'
    | 'decimal'
    | 'boolean'
    | 'datetime'
    | 'json'
    | 'foreignKey'
    | 'oneToMany'
    | 'manyToMany';
  options?: Record<string, any>;
}

interface GenerateFieldsArgs {
  fields: FieldDefinition[];
}

export async function generateFieldDefinitions(
  args: GenerateFieldsArgs,
): Promise<string> {
  const { fields } = args;

  const imports = generateFieldImports(fields);
  const definitions = generateDefinitions(fields);
  const usage = generateUsageExample(fields);

  return `${imports}

// Field definitions
${definitions}

// Usage example:
${usage}`;
}

function generateFieldImports(fields: FieldDefinition[]): string {
  const fieldTypes = new Set<string>();

  for (const field of fields) {
    fieldTypes.add(field.type);
  }

  const imports = ['BaseObject', 'smrt', ...Array.from(fieldTypes)];
  return `import { ${imports.join(', ')} } from '@have/smrt';`;
}

function generateDefinitions(fields: FieldDefinition[]): string {
  return fields.map((field) => generateFieldDefinition(field)).join('\n');
}

function generateFieldDefinition(field: FieldDefinition): string {
  const { name, type, options = {} } = field;

  const optionsParts: string[] = [];

  // Handle common options
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === 'string') {
      optionsParts.push(`${key}: '${value}'`);
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      optionsParts.push(`${key}: ${value}`);
    } else if (value === null) {
      optionsParts.push(`${key}: null`);
    } else if (Array.isArray(value)) {
      optionsParts.push(
        `${key}: [${value.map((v) => (typeof v === 'string' ? `'${v}'` : v)).join(', ')}]`,
      );
    } else if (typeof value === 'object') {
      optionsParts.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  const optionsStr =
    optionsParts.length > 0 ? `{ ${optionsParts.join(', ')} }` : '';
  const comment = generateFieldComment(field);

  return `${comment}
${name} = ${type}(${optionsStr});`;
}

function generateFieldComment(field: FieldDefinition): string {
  const { name, type, options = {} } = field;

  const constraints: string[] = [];

  if (options.required) constraints.push('required');
  if (options.unique) constraints.push('unique');
  if (options.index) constraints.push('indexed');

  if (type === 'text') {
    if (options.maxLength) constraints.push(`max ${options.maxLength} chars`);
    if (options.minLength) constraints.push(`min ${options.minLength} chars`);
    if (options.pattern) constraints.push('pattern validated');
    if (options.encrypted) constraints.push('encrypted');
  }

  if (type === 'integer' || type === 'decimal') {
    if (options.min !== undefined) constraints.push(`min ${options.min}`);
    if (options.max !== undefined) constraints.push(`max ${options.max}`);
  }

  if (options.default !== undefined) {
    constraints.push(`default: ${JSON.stringify(options.default)}`);
  }

  const constraintStr =
    constraints.length > 0 ? ` (${constraints.join(', ')})` : '';
  const description = options.description || `${type} field`;

  return `// ${description}${constraintStr}`;
}

function generateUsageExample(fields: FieldDefinition[]): string {
  const className = 'ExampleObject';
  const fieldDefinitions = fields
    .map((field) => generateFieldDefinition(field))
    .join('\n  ');

  return `@smrt()
export class ${className} extends BaseObject {
  ${fieldDefinitions}

  constructor(options: any) {
    super(options);
    Object.assign(this, options);
  }
}`;
}

// Field templates for common use cases
export const fieldTemplates = {
  // Basic fields
  id: {
    name: 'id',
    type: 'text' as const,
    options: { required: true, unique: true },
  },

  name: {
    name: 'name',
    type: 'text' as const,
    options: { required: true, maxLength: 100 },
  },

  title: {
    name: 'title',
    type: 'text' as const,
    options: { required: true, maxLength: 200 },
  },

  description: {
    name: 'description',
    type: 'text' as const,
    options: { maxLength: 1000 },
  },

  content: {
    name: 'content',
    type: 'text' as const,
    options: {},
  },

  slug: {
    name: 'slug',
    type: 'text' as const,
    options: { unique: true, index: true, pattern: '^[a-z0-9-]+$' },
  },

  email: {
    name: 'email',
    type: 'text' as const,
    options: {
      unique: true,
      pattern: '^[^@]+@[^@]+\\.[^@]+$',
      description: 'Email address',
    },
  },

  phone: {
    name: 'phone',
    type: 'text' as const,
    options: {
      pattern: '^\\+?[1-9]\\d{1,14}$',
      description: 'Phone number in international format',
    },
  },

  url: {
    name: 'url',
    type: 'text' as const,
    options: {
      pattern: '^https?://.*',
      description: 'Valid HTTP/HTTPS URL',
    },
  },

  // Numeric fields
  price: {
    name: 'price',
    type: 'decimal' as const,
    options: { min: 0, required: true },
  },

  quantity: {
    name: 'quantity',
    type: 'integer' as const,
    options: { min: 0, default: 0 },
  },

  priority: {
    name: 'priority',
    type: 'integer' as const,
    options: { min: 1, max: 10, default: 5 },
  },

  score: {
    name: 'score',
    type: 'decimal' as const,
    options: { min: 0, max: 100 },
  },

  // Boolean fields
  isActive: {
    name: 'isActive',
    type: 'boolean' as const,
    options: { default: true },
  },

  isPublished: {
    name: 'isPublished',
    type: 'boolean' as const,
    options: { default: false },
  },

  isDeleted: {
    name: 'isDeleted',
    type: 'boolean' as const,
    options: { default: false, index: true },
  },

  // Date fields
  createdAt: {
    name: 'createdAt',
    type: 'datetime' as const,
    options: { required: true, default: 'NOW()' },
  },

  updatedAt: {
    name: 'updatedAt',
    type: 'datetime' as const,
    options: { required: true },
  },

  publishedAt: {
    name: 'publishedAt',
    type: 'datetime' as const,
    options: {},
  },

  expiresAt: {
    name: 'expiresAt',
    type: 'datetime' as const,
    options: { index: true },
  },

  // JSON fields
  metadata: {
    name: 'metadata',
    type: 'json' as const,
    options: { default: {} },
  },

  settings: {
    name: 'settings',
    type: 'json' as const,
    options: { default: {} },
  },

  tags: {
    name: 'tags',
    type: 'json' as const,
    options: { default: [] },
  },

  // Encrypted fields
  password: {
    name: 'password',
    type: 'text' as const,
    options: { required: true, encrypted: true },
  },

  apiKey: {
    name: 'apiKey',
    type: 'text' as const,
    options: { encrypted: true, unique: true },
  },

  secretToken: {
    name: 'secretToken',
    type: 'text' as const,
    options: { encrypted: true },
  },
};

// Domain-specific field sets
export const domainFieldSets = {
  user: [
    fieldTemplates.email,
    fieldTemplates.name,
    fieldTemplates.phone,
    fieldTemplates.isActive,
    fieldTemplates.createdAt,
    fieldTemplates.updatedAt,
  ],

  product: [
    fieldTemplates.name,
    fieldTemplates.description,
    fieldTemplates.price,
    fieldTemplates.quantity,
    fieldTemplates.isActive,
    fieldTemplates.slug,
    fieldTemplates.createdAt,
  ],

  article: [
    fieldTemplates.title,
    fieldTemplates.content,
    fieldTemplates.slug,
    fieldTemplates.isPublished,
    fieldTemplates.publishedAt,
    fieldTemplates.createdAt,
    fieldTemplates.updatedAt,
  ],

  task: [
    fieldTemplates.title,
    fieldTemplates.description,
    fieldTemplates.priority,
    fieldTemplates.isActive,
    fieldTemplates.createdAt,
    fieldTemplates.updatedAt,
  ],

  event: [
    fieldTemplates.title,
    fieldTemplates.description,
    {
      name: 'startDate',
      type: 'datetime' as const,
      options: { required: true },
    },
    { name: 'endDate', type: 'datetime' as const, options: {} },
    fieldTemplates.isActive,
    fieldTemplates.createdAt,
  ],
};
