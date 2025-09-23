/**
 * Configure Decorators Tool
 */

interface DecoratorConfig {
  className: string;
  api?: {
    include?: string[];
    exclude?: string[];
    middleware?: string[];
  };
  cli?:
    | boolean
    | {
        include?: string[];
        exclude?: string[];
      };
  mcp?: {
    include?: string[];
    exclude?: string[];
  };
  hooks?: {
    beforeSave?: boolean;
    afterSave?: boolean;
    beforeCreate?: boolean;
    afterCreate?: boolean;
    beforeUpdate?: boolean;
    afterUpdate?: boolean;
    beforeDelete?: boolean;
    afterDelete?: boolean;
  };
}

export async function configureDecorators(
  args: DecoratorConfig,
): Promise<string> {
  const { className, api, cli, mcp, hooks } = args;

  const decoratorCode = generateDecoratorCode({ api, cli, mcp });
  const hooksCode = hooks ? generateHooksCode(hooks) : '';

  return `// Configuration for ${className}

// Decorator configuration
${decoratorCode}

${
  hooksCode
    ? `// Lifecycle hooks to add to your class
${hooksCode}`
    : ''
}

// Example usage:
${generateUsageExample(className, { api, cli, mcp }, hooks)}`;
}

function generateDecoratorCode(
  config: Omit<DecoratorConfig, 'className' | 'hooks'>,
): string {
  const { api, cli, mcp } = config;
  const configParts: string[] = [];

  if (api) {
    const apiParts: string[] = [];

    if (api.include?.length) {
      apiParts.push(
        `include: [${api.include.map((e) => `'${e}'`).join(', ')}]`,
      );
    }

    if (api.exclude?.length) {
      apiParts.push(
        `exclude: [${api.exclude.map((e) => `'${e}'`).join(', ')}]`,
      );
    }

    if (api.middleware?.length) {
      apiParts.push(
        `middleware: [${api.middleware.map((m) => `'${m}'`).join(', ')}]`,
      );
    }

    if (apiParts.length > 0) {
      configParts.push(`  api: {
    ${apiParts.join(',\n    ')}
  }`);
    }
  }

  if (cli !== undefined) {
    if (typeof cli === 'boolean') {
      configParts.push(`  cli: ${cli}`);
    } else if (cli && typeof cli === 'object') {
      const cliParts: string[] = [];

      if (cli.include?.length) {
        cliParts.push(
          `include: [${cli.include.map((e) => `'${e}'`).join(', ')}]`,
        );
      }

      if (cli.exclude?.length) {
        cliParts.push(
          `exclude: [${cli.exclude.map((e) => `'${e}'`).join(', ')}]`,
        );
      }

      if (cliParts.length > 0) {
        configParts.push(`  cli: {
    ${cliParts.join(',\n    ')}
  }`);
      }
    }
  }

  if (mcp) {
    const mcpParts: string[] = [];

    if (mcp.include?.length) {
      mcpParts.push(
        `include: [${mcp.include.map((e) => `'${e}'`).join(', ')}]`,
      );
    }

    if (mcp.exclude?.length) {
      mcpParts.push(
        `exclude: [${mcp.exclude.map((e) => `'${e}'`).join(', ')}]`,
      );
    }

    if (mcpParts.length > 0) {
      configParts.push(`  mcp: {
    ${mcpParts.join(',\n    ')}
  }`);
    }
  }

  if (configParts.length === 0) {
    return '@smrt()';
  }

  return `@smrt({
${configParts.join(',\n')}
})`;
}

function generateHooksCode(
  hooks: NonNullable<DecoratorConfig['hooks']>,
): string {
  const hookMethods: string[] = [];

  if (hooks.beforeSave) {
    hookMethods.push(`  async beforeSave() {
    // Custom logic before saving to database
    // Example: Validate data, set defaults, generate slugs
    if (!this.slug && this.name) {
      this.slug = await this.getSlug();
    }

    // Set updated timestamp
    this.updated_at = new Date();
  }`);
  }

  if (hooks.afterSave) {
    hookMethods.push(`  async afterSave() {
    // Custom logic after saving to database
    // Example: Send notifications, update caches, log events
    console.log(\`Saved \${this.constructor.name}: \${this.id}\`);
  }`);
  }

  if (hooks.beforeCreate) {
    hookMethods.push(`  async beforeCreate() {
    // Custom logic before creating new record
    // Example: Set creation timestamp, generate IDs
    this.created_at = new Date();

    if (!this.id) {
      this.id = await this.generateId();
    }
  }`);
  }

  if (hooks.afterCreate) {
    hookMethods.push(`  async afterCreate() {
    // Custom logic after creating new record
    // Example: Send welcome emails, create related records
    console.log(\`Created new \${this.constructor.name}: \${this.id}\`);
  }`);
  }

  if (hooks.beforeUpdate) {
    hookMethods.push(`  async beforeUpdate() {
    // Custom logic before updating existing record
    // Example: Validate changes, maintain history
    this.updated_at = new Date();
  }`);
  }

  if (hooks.afterUpdate) {
    hookMethods.push(`  async afterUpdate() {
    // Custom logic after updating existing record
    // Example: Invalidate caches, notify subscribers
    console.log(\`Updated \${this.constructor.name}: \${this.id}\`);
  }`);
  }

  if (hooks.beforeDelete) {
    hookMethods.push(`  async beforeDelete() {
    // Custom logic before deleting record
    // Example: Check dependencies, create backups
    console.log(\`Preparing to delete \${this.constructor.name}: \${this.id}\`);
  }`);
  }

  if (hooks.afterDelete) {
    hookMethods.push(`  async afterDelete() {
    // Custom logic after deleting record
    // Example: Clean up related data, log deletion
    console.log(\`Deleted \${this.constructor.name}: \${this.id}\`);
  }`);
  }

  return hookMethods.join('\n\n');
}

function generateUsageExample(
  className: string,
  config: Omit<DecoratorConfig, 'className' | 'hooks'>,
  hooks?: DecoratorConfig['hooks'],
): string {
  const decoratorCode = generateDecoratorCode(config);
  const hooksCode = hooks ? generateHooksCode(hooks) : '';

  return `import { BaseObject, smrt, text, integer } from '@have/smrt';

${decoratorCode}
export class ${className} extends BaseObject {
  name = text({ required: true });
  description = text();
  priority = integer({ min: 1, max: 10, default: 1 });

  constructor(options: any) {
    super(options);
    Object.assign(this, options);
  }

${
  hooksCode
    ? `${hooksCode
        .split('\n')
        .map((line) => line)
        .join('\n')}`
    : '  // Add your custom methods here'
}
}`;
}

// Predefined configuration templates
export const configurationTemplates = {
  'public-api': {
    description: 'Full public API with all endpoints',
    config: {
      api: { include: ['list', 'get', 'create', 'update', 'delete'] },
      cli: true,
      mcp: { include: ['list', 'get', 'create', 'update', 'delete'] },
    },
  },

  'read-only': {
    description: 'Read-only access through API and tools',
    config: {
      api: { include: ['list', 'get'] },
      cli: { include: ['list', 'get'] },
      mcp: { include: ['list', 'get'] },
    },
  },

  'admin-only': {
    description: 'Administrative access with full CRUD',
    config: {
      api: {
        include: ['list', 'get', 'create', 'update', 'delete'],
        middleware: ['auth', 'admin'],
      },
      cli: true,
      mcp: { exclude: ['delete'] },
    },
  },

  'content-management': {
    description: 'Content management with AI assistance',
    config: {
      api: { exclude: ['delete'] },
      cli: true,
      mcp: { include: ['list', 'get', 'create', 'update'] },
      hooks: {
        beforeSave: true,
        afterCreate: true,
      },
    },
  },

  minimal: {
    description: 'Minimal configuration with basic functionality',
    config: {
      api: { include: ['list', 'get'] },
      cli: false,
      mcp: { include: ['list'] },
    },
  },
};
