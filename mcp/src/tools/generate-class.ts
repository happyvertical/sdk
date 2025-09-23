/**
 * Generate SMRT Class Tool
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
    | 'foreignKey';
  options?: Record<string, any>;
}

interface DecoratorConfig {
  api?: {
    exclude?: string[];
    include?: string[];
    middleware?: string[];
  };
  cli?: boolean | object;
  mcp?: {
    include?: string[];
    exclude?: string[];
  };
  hooks?: Record<string, boolean>;
}

interface GenerateClassArgs {
  className: string;
  fields: FieldDefinition[];
  decoratorConfig?: DecoratorConfig;
  includeAIMethods?: boolean;
}

export async function generateSmrtClass(
  args: GenerateClassArgs,
): Promise<string> {
  const {
    className,
    fields,
    decoratorConfig = {},
    includeAIMethods = false,
  } = args;

  const imports = generateImports(fields, includeAIMethods);
  const decorator = generateDecorator(decoratorConfig);
  const fieldDefinitions = generateFieldDefinitions(fields);
  const constructorCode = generateConstructor();
  const lifecycleHooks = generateLifecycleHooks(decoratorConfig);
  const aiMethods = includeAIMethods ? generateBasicAIMethods(fields) : '';

  const classCode = `${imports}

${decorator}
export class ${className} extends BaseObject {
${fieldDefinitions}

${constructorCode}
${lifecycleHooks}${aiMethods}
}`;

  return classCode;
}

function generateImports(
  fields: FieldDefinition[],
  _includeAIMethods: boolean,
): string {
  const baseImports = ['BaseObject', 'smrt'];
  const fieldTypes = new Set<string>();

  for (const field of fields) {
    fieldTypes.add(field.type);
  }

  const fieldImports = Array.from(fieldTypes);
  const allImports = [...baseImports, ...fieldImports];

  return `import { ${allImports.join(', ')} } from '@have/smrt';`;
}

function generateDecorator(config: DecoratorConfig): string {
  if (Object.keys(config).length === 0) {
    return '@smrt()';
  }

  const configLines: string[] = [];

  if (config.api) {
    const apiConfig: string[] = [];
    if (config.api.exclude?.length) {
      apiConfig.push(
        `exclude: [${config.api.exclude.map((e) => `'${e}'`).join(', ')}]`,
      );
    }
    if (config.api.include?.length) {
      apiConfig.push(
        `include: [${config.api.include.map((e) => `'${e}'`).join(', ')}]`,
      );
    }
    if (config.api.middleware?.length) {
      apiConfig.push(
        `middleware: [${config.api.middleware.map((m) => `'${m}'`).join(', ')}]`,
      );
    }
    if (apiConfig.length) {
      configLines.push(`  api: { ${apiConfig.join(', ')} }`);
    }
  }

  if (config.cli !== undefined) {
    if (typeof config.cli === 'boolean') {
      configLines.push(`  cli: ${config.cli}`);
    } else {
      configLines.push(`  cli: ${JSON.stringify(config.cli)}`);
    }
  }

  if (config.mcp) {
    const mcpConfig: string[] = [];
    if (config.mcp.include?.length) {
      mcpConfig.push(
        `include: [${config.mcp.include.map((e) => `'${e}'`).join(', ')}]`,
      );
    }
    if (config.mcp.exclude?.length) {
      mcpConfig.push(
        `exclude: [${config.mcp.exclude.map((e) => `'${e}'`).join(', ')}]`,
      );
    }
    if (mcpConfig.length) {
      configLines.push(`  mcp: { ${mcpConfig.join(', ')} }`);
    }
  }

  if (configLines.length === 0) {
    return '@smrt()';
  }

  return `@smrt({
${configLines.join(',\n')}
})`;
}

function generateFieldDefinitions(fields: FieldDefinition[]): string {
  const definitions = fields.map((field) => {
    const options = field.options || {};
    const optionsParts: string[] = [];

    for (const [key, value] of Object.entries(options)) {
      if (typeof value === 'string') {
        optionsParts.push(`${key}: '${value}'`);
      } else if (typeof value === 'boolean' || typeof value === 'number') {
        optionsParts.push(`${key}: ${value}`);
      } else if (value === null) {
        optionsParts.push(`${key}: null`);
      }
    }

    const optionsStr =
      optionsParts.length > 0 ? `{ ${optionsParts.join(', ')} }` : '';
    return `  ${field.name} = ${field.type}(${optionsStr});`;
  });

  return definitions.join('\n');
}

function generateConstructor(): string {
  return `  constructor(options: any) {
    super(options);
    Object.assign(this, options);
  }`;
}

function generateLifecycleHooks(config: DecoratorConfig): string {
  if (!config.hooks) return '';

  const hooks: string[] = [];

  if (config.hooks.beforeSave) {
    hooks.push(`  async beforeSave() {
    // Custom logic before saving
    if (!this.slug && this.name) {
      this.slug = await this.getSlug();
    }
  }`);
  }

  if (config.hooks.afterSave) {
    hooks.push(`  async afterSave() {
    // Custom logic after saving
    console.log(\`Saved \${this.constructor.name}: \${this.id}\`);
  }`);
  }

  if (config.hooks.beforeCreate) {
    hooks.push(`  async beforeCreate() {
    // Custom logic before creating
    this.created_at = new Date();
  }`);
  }

  if (config.hooks.afterCreate) {
    hooks.push(`  async afterCreate() {
    // Custom logic after creating
    console.log(\`Created new \${this.constructor.name}: \${this.id}\`);
  }`);
  }

  return hooks.length > 0 ? `\n${hooks.join('\n\n')}` : '';
}

function generateBasicAIMethods(fields: FieldDefinition[]): string {
  const textFields = fields.filter((f) => f.type === 'text').map((f) => f.name);
  const nameField =
    textFields.find((f) => f.includes('name') || f.includes('title')) ||
    textFields[0];

  if (!nameField) return '';

  return `
  // AI-powered methods
  async summarize(): Promise<string> {
    return await this.do(\`
      Summarize this object in 1-2 sentences:
      \${this.${nameField}}: \${this.${nameField}}
    \`);
  }

  async isValid(criteria?: string): Promise<boolean> {
    const defaultCriteria = 'All required fields are filled and data is consistent';
    return await this.is(criteria || defaultCriteria);
  }

  async getDescription(): Promise<string> {
    return await this.describe(\`
      Generate a brief description of this \${this.constructor.name}
      focusing on its key characteristics and purpose.
    \`);
  }`;
}
