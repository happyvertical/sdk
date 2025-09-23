/**
 * Add AI Methods Tool
 */

interface AIMethod {
  name: string;
  type: 'do' | 'is' | 'describe' | 'custom';
  description?: string;
  prompt?: string;
}

interface AddAIMethodsArgs {
  className: string;
  methods: AIMethod[];
  existingCode?: string;
}

export async function addAIMethods(args: AddAIMethodsArgs): Promise<string> {
  const { className, methods, existingCode } = args;

  if (existingCode) {
    return addMethodsToExistingCode(existingCode, methods);
  } else {
    return generateStandaloneMethods(className, methods);
  }
}

function addMethodsToExistingCode(code: string, methods: AIMethod[]): string {
  const lines = code.split('\n');
  const lastBraceIndex = lines.lastIndexOf('}');

  if (lastBraceIndex === -1) {
    throw new Error('Invalid class structure - no closing brace found');
  }

  const methodsCode = methods
    .map((method) => generateMethodCode(method))
    .join('\n\n');
  const aiMethodsSection = `
  // AI-powered methods
${methodsCode}
`;

  lines.splice(lastBraceIndex, 0, aiMethodsSection);
  return lines.join('\n');
}

function generateStandaloneMethods(
  className: string,
  methods: AIMethod[],
): string {
  const methodsCode = methods
    .map((method) => generateMethodCode(method))
    .join('\n\n');

  return `// AI methods to add to ${className} class

${methodsCode}`;
}

function generateMethodCode(method: AIMethod): string {
  const { name, type, description, prompt } = method;

  const comment = description ? `  // ${description}` : '';
  const methodPrompt = prompt || generateDefaultPrompt(name, type);

  switch (type) {
    case 'do':
      return `${comment}
  async ${name}(): Promise<string> {
    return await this.do(\`${methodPrompt}\`);
  }`;

    case 'is':
      return `${comment}
  async ${name}(): Promise<boolean> {
    return await this.is(\`${methodPrompt}\`);
  }`;

    case 'describe':
      return `${comment}
  async ${name}(): Promise<string> {
    return await this.describe(\`${methodPrompt}\`);
  }`;

    case 'custom':
      return generateCustomMethod(name, methodPrompt, description);

    default:
      throw new Error(`Unknown method type: ${type}`);
  }
}

function generateDefaultPrompt(
  name: string,
  type: 'do' | 'is' | 'describe' | 'custom',
): string {
  switch (type) {
    case 'do':
      return `Perform the ${name} operation on this object.`;

    case 'is':
      return `Determine if this object ${name}.`;

    case 'describe':
      return `Describe the ${name} of this object.`;

    case 'custom':
      return `Process this object for ${name}.`;

    default:
      return `Process this object for ${name}.`;
  }
}

function generateCustomMethod(
  name: string,
  prompt: string,
  description?: string,
): string {
  const comment = description ? `  // ${description}` : '';

  // Infer return type from method name and prompt
  const returnType = inferReturnType(name, prompt);

  return `${comment}
  async ${name}(): Promise<${returnType}> {
    const result = await this.do(\`${prompt}\`);
    ${generateReturnStatement(returnType)}
  }`;
}

function inferReturnType(name: string, prompt: string): string {
  const lowerName = name.toLowerCase();
  const lowerPrompt = prompt.toLowerCase();

  // Check for boolean indicators
  if (
    lowerName.includes('is') ||
    lowerName.includes('can') ||
    lowerName.includes('has') ||
    lowerPrompt.includes('true') ||
    lowerPrompt.includes('false') ||
    lowerPrompt.includes('yes') ||
    lowerPrompt.includes('no')
  ) {
    return 'boolean';
  }

  // Check for number indicators
  if (
    lowerName.includes('count') ||
    lowerName.includes('score') ||
    lowerName.includes('rate') ||
    lowerPrompt.includes('number') ||
    lowerPrompt.includes('count') ||
    lowerPrompt.includes('score')
  ) {
    return 'number';
  }

  // Check for array indicators
  if (
    lowerName.includes('list') ||
    lowerName.includes('items') ||
    lowerPrompt.includes('list') ||
    lowerPrompt.includes('array')
  ) {
    return 'string[]';
  }

  // Default to string
  return 'string';
}

function generateReturnStatement(returnType: string): string {
  switch (returnType) {
    case 'boolean':
      return `return result.toLowerCase().includes('true') || result.toLowerCase().includes('yes');`;

    case 'number':
      return `const num = parseFloat(result);
    return isNaN(num) ? 0 : num;`;

    case 'string[]':
      return `try {
      return JSON.parse(result);
    } catch {
      return result.split(',').map(s => s.trim());
    }`;

    default:
      return 'return result;';
  }
}

// Predefined common AI methods
export const commonAIMethods: AIMethod[] = [
  {
    name: 'summarize',
    type: 'do',
    description: 'Generate a concise summary of this object',
    prompt:
      'Summarize this object in 2-3 sentences, focusing on the most important information.',
  },
  {
    name: 'isValid',
    type: 'is',
    description: 'Validate this object meets business rules',
    prompt:
      'Check if this object has all required fields and follows business validation rules.',
  },
  {
    name: 'getKeywords',
    type: 'do',
    description: 'Extract relevant keywords from this object',
    prompt:
      'Extract 5-10 relevant keywords or tags that describe this object. Return as a comma-separated list.',
  },
  {
    name: 'estimateQuality',
    type: 'custom',
    description: 'Rate the quality of this object on a scale of 1-10',
    prompt:
      'Rate the quality and completeness of this object on a scale of 1-10. Consider completeness, accuracy, and usefulness. Respond with only the number.',
  },
  {
    name: 'suggestImprovements',
    type: 'do',
    description: 'Suggest specific improvements for this object',
    prompt:
      'Suggest 3-5 specific improvements that could be made to enhance this object. Be practical and actionable.',
  },
  {
    name: 'categorize',
    type: 'do',
    description: 'Automatically categorize this object',
    prompt:
      'Analyze this object and suggest the most appropriate category or classification. Respond with just the category name.',
  },
  {
    name: 'hasIssues',
    type: 'is',
    description: 'Check if this object has any potential issues',
    prompt:
      'Analyze this object for potential issues, inconsistencies, or missing critical information.',
  },
  {
    name: 'generateTitle',
    type: 'do',
    description: 'Generate an appropriate title for this object',
    prompt:
      'Generate a clear, descriptive title for this object based on its content and purpose.',
  },
];
