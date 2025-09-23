/**
 * Generate Collection Tool
 */

interface CustomMethod {
  name: string;
  description: string;
  parameters?: Array<{
    name: string;
    type: string;
    description?: string;
  }>;
}

interface GenerateCollectionArgs {
  objectClassName: string;
  collectionName?: string;
  customMethods?: CustomMethod[];
}

export async function generateCollection(
  args: GenerateCollectionArgs,
): Promise<string> {
  const { objectClassName, collectionName, customMethods = [] } = args;

  const actualCollectionName = collectionName || `${objectClassName}Collection`;
  const imports = generateImports(objectClassName);
  const classDefinition = generateClassDefinition(
    actualCollectionName,
    objectClassName,
  );
  const methods = generateMethods(objectClassName, customMethods);

  return `${imports}

${classDefinition}
${methods}
}`;
}

function generateImports(objectClassName: string): string {
  return `import { BaseCollection } from '@have/smrt';
import { ${objectClassName} } from './${objectClassName.toLowerCase()}';`;
}

function generateClassDefinition(
  collectionName: string,
  objectClassName: string,
): string {
  return `export class ${collectionName} extends BaseCollection<${objectClassName}> {
  static readonly _itemClass = ${objectClassName};

  constructor(options: any) {
    super(options);
  }`;
}

function generateMethods(
  objectClassName: string,
  customMethods: CustomMethod[],
): string {
  const methods: string[] = [];

  // Add common query methods
  methods.push(generateFindActiveMethod());
  methods.push(generateFindByNameMethod());
  methods.push(generateSearchMethod());
  methods.push(generateBulkUpdateMethod());

  // Add custom methods
  for (const method of customMethods) {
    methods.push(generateCustomMethod(method, objectClassName));
  }

  // Add AI-enhanced methods
  methods.push(generateAISearchMethod(objectClassName));
  methods.push(generateAIAnalysisMethod(objectClassName));

  return methods.join('\n\n');
}

function generateFindActiveMethod(): string {
  return `  // Find active items (assumes an 'isActive' or 'active' field exists)
  async findActive() {
    return this.list({
      where: { isActive: true },
      orderBy: 'created_at DESC'
    });
  }`;
}

function generateFindByNameMethod(): string {
  return `  // Find by name or title (assumes 'name' or 'title' field exists)
  async findByName(name: string) {
    return this.list({
      where: {
        'name like': \`%\${name}%\`
      },
      orderBy: 'name ASC'
    });
  }`;
}

function generateSearchMethod(): string {
  return `  // Generic search across multiple fields
  async search(query: string, fields: string[] = ['name', 'title', 'description']) {
    const conditions: Record<string, any> = {};

    for (const field of fields) {
      conditions[\`\${field} like\`] = \`%\${query}%\`;
    }

    return this.list({
      where: conditions,
      orderBy: 'created_at DESC'
    });
  }`;
}

function generateBulkUpdateMethod(): string {
  return `  // Bulk update multiple items
  async bulkUpdate(filter: Record<string, any>, updates: Record<string, any>) {
    const items = await this.list({ where: filter });
    const results = [];

    for (const item of items) {
      Object.assign(item, updates);
      await item.save();
      results.push(item);
    }

    return results;
  }`;
}

function generateCustomMethod(
  method: CustomMethod,
  objectClassName: string,
): string {
  const { name, description, parameters = [] } = method;

  const paramStrings = parameters.map((p) => `${p.name}: ${p.type}`);
  const paramList = paramStrings.join(', ');

  const comment = `  // ${description}`;

  // Generate basic method structure based on common patterns
  let methodBody = '';

  if (name.startsWith('findBy') || name.startsWith('getBy')) {
    const fieldName = name.replace(/^(findBy|getBy)/, '').toLowerCase();
    methodBody = `    return this.list({
      where: { ${fieldName}: ${parameters[0]?.name || 'value'} },
      orderBy: 'created_at DESC'
    });`;
  } else if (name.startsWith('count')) {
    methodBody = `    const items = await this.list({ where: {} });
    return items.length;`;
  } else if (name.includes('Recent')) {
    methodBody = `    return this.list({
      orderBy: 'created_at DESC',
      limit: ${parameters.find((p) => p.name.includes('limit'))?.name || '10'}
    });`;
  } else {
    methodBody = `    // TODO: Implement ${name} logic
    const items = await this.list({});
    return items;`;
  }

  return `${comment}
  async ${name}(${paramList}) {
${methodBody}
  }`;
}

function generateAISearchMethod(objectClassName: string): string {
  return `  // AI-enhanced semantic search
  async searchSemantic(query: string, threshold: number = 7) {
    const allItems = await this.list({});
    const results = [];

    for (const item of allItems) {
      const relevance = await item.do(\`
        Rate the relevance of this \${this.constructor.name.replace('Collection', '')}
        to the query "\${query}" on a scale of 1-10.
        Consider all available fields and content.
        Respond with only the number.
      \`);

      const score = parseInt(relevance);
      if (score >= threshold) {
        results.push({ item, relevance: score });
      }
    }

    // Sort by relevance score (highest first)
    return results
      .sort((a, b) => b.relevance - a.relevance)
      .map(r => r.item);
  }`;
}

function generateAIAnalysisMethod(objectClassName: string): string {
  return `  // AI-powered collection analysis
  async analyze(criteria?: string) {
    const items = await this.list({});

    if (items.length === 0) {
      return { summary: 'Collection is empty', insights: [] };
    }

    const sampleSize = Math.min(items.length, 10);
    const sample = items.slice(0, sampleSize);

    const analysis = await items[0].do(\`
      Analyze this collection of \${items.length} \${this.constructor.name.replace('Collection', '')} items.
      \${criteria ? \`Focus on: \${criteria}\` : ''}

      Sample items:
      \${sample.map((item, i) => \`\${i + 1}. \${JSON.stringify(item, null, 2)}\`).join('\\n')}

      Provide:
      1. A brief summary of the collection
      2. Key patterns or trends
      3. Insights and recommendations

      Format as JSON with 'summary' and 'insights' fields.
    \`);

    try {
      return JSON.parse(analysis);
    } catch {
      return {
        summary: analysis,
        insights: ['Analysis completed successfully']
      };
    }
  }`;
}

// Predefined collection templates
export const collectionTemplates = {
  'user-management': {
    description: 'User management collection with authentication helpers',
    methods: [
      {
        name: 'findByEmail',
        description: 'Find user by email address',
        parameters: [{ name: 'email', type: 'string' }],
      },
      {
        name: 'findActiveUsers',
        description: 'Find all active users',
        parameters: [],
      },
      {
        name: 'findByRole',
        description: 'Find users by role',
        parameters: [{ name: 'role', type: 'string' }],
      },
    ],
  },

  'content-management': {
    description: 'Content management collection with publishing workflows',
    methods: [
      {
        name: 'findPublished',
        description: 'Find published content',
        parameters: [],
      },
      {
        name: 'findByCategory',
        description: 'Find content by category',
        parameters: [{ name: 'category', type: 'string' }],
      },
      {
        name: 'findByAuthor',
        description: 'Find content by author',
        parameters: [{ name: 'authorId', type: 'string' }],
      },
    ],
  },

  'e-commerce': {
    description: 'E-commerce collection with inventory management',
    methods: [
      {
        name: 'findInStock',
        description: 'Find products in stock',
        parameters: [],
      },
      {
        name: 'findByPriceRange',
        description: 'Find products within price range',
        parameters: [
          { name: 'minPrice', type: 'number' },
          { name: 'maxPrice', type: 'number' },
        ],
      },
      {
        name: 'findByCategory',
        description: 'Find products by category',
        parameters: [{ name: 'category', type: 'string' }],
      },
    ],
  },

  'task-management': {
    description: 'Task management collection with workflow helpers',
    methods: [
      {
        name: 'findByStatus',
        description: 'Find tasks by status',
        parameters: [{ name: 'status', type: 'string' }],
      },
      {
        name: 'findByPriority',
        description: 'Find tasks by priority level',
        parameters: [{ name: 'priority', type: 'number' }],
      },
      {
        name: 'findOverdue',
        description: 'Find overdue tasks',
        parameters: [],
      },
    ],
  },

  analytics: {
    description: 'Analytics collection with reporting methods',
    methods: [
      {
        name: 'findByDateRange',
        description: 'Find items within date range',
        parameters: [
          { name: 'startDate', type: 'Date' },
          { name: 'endDate', type: 'Date' },
        ],
      },
      {
        name: 'getMetrics',
        description: 'Get collection metrics',
        parameters: [],
      },
      {
        name: 'getTrends',
        description: 'Analyze trends over time',
        parameters: [{ name: 'period', type: 'string' }],
      },
    ],
  },
};
