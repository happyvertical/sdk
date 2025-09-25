/**
 * AST scanner for parsing @smrt() decorated classes
 * Uses TypeScript Compiler API to extract metadata
 */

import * as ts from 'typescript';
import type {
  FieldDefinition,
  MethodDefinition,
  ScanOptions,
  ScanResult,
  SmartObjectDefinition,
} from './types';

export class ASTScanner {
  private program: ts.Program;
  private checker: ts.TypeChecker;
  private options: ScanOptions;

  constructor(filePaths: string[], options: ScanOptions = {}) {
    this.options = {
      includePrivateMethods: false,
      includeStaticMethods: true,
      followImports: false,
      baseClasses: ['SmrtObject', 'SmrtClass', 'SmrtCollection'],
      ...options,
    };

    // Create TypeScript program
    this.program = ts.createProgram(filePaths, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      allowJs: true,
      declaration: true,
      esModuleInterop: true,
      skipLibCheck: true,
      strict: true,
    });

    this.checker = this.program.getTypeChecker();
  }

  /**
   * Scan files for SMRT object definitions
   */
  scanFiles(): ScanResult[] {
    const results: ScanResult[] = [];

    for (const sourceFile of this.program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile) continue;

      const result = this.scanFile(sourceFile);
      if (result.objects.length > 0 || result.errors.length > 0) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Scan a single source file
   */
  private scanFile(sourceFile: ts.SourceFile): ScanResult {
    const result: ScanResult = {
      filePath: sourceFile.fileName,
      objects: [],
      errors: [],
    };

    try {
      ts.forEachChild(sourceFile, (node) => {
        if (ts.isClassDeclaration(node)) {
          const objectDef = this.parseClassDeclaration(node, sourceFile);
          if (objectDef) {
            result.objects.push(objectDef);
          }
        }
      });
    } catch (error) {
      result.errors.push({
        message:
          error instanceof Error ? error.message : 'Unknown parsing error',
        line: 0,
        column: 0,
      });
    }

    return result;
  }

  /**
   * Parse a class declaration for SMRT metadata
   */
  private parseClassDeclaration(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
  ): SmartObjectDefinition | null {
    // Check if class has @smrt() decorator
    const smrtDecorator = this.findSmrtDecorator(node);
    if (!smrtDecorator) return null;

    // Check if class extends a SMRT base class
    if (!this.extendsBaseClass(node)) return null;

    const className = node.name?.text;
    if (!className) return null;

    // Extract decorator configuration
    const decoratorConfig = this.parseDecoratorConfig(smrtDecorator);

    // Generate collection name (pluralized)
    const collection = this.pluralize(className.toLowerCase());

    const objectDef: SmartObjectDefinition = {
      name: className.toLowerCase(),
      className,
      collection,
      filePath: sourceFile.fileName,
      fields: {},
      methods: {},
      decoratorConfig,
    };

    // Parse class members
    for (const member of node.members) {
      if (ts.isPropertyDeclaration(member)) {
        const field = this.parsePropertyDeclaration(member);
        if (field) {
          const fieldName = this.getPropertyName(member);
          if (fieldName) {
            objectDef.fields[fieldName] = field;
          }
        }
      } else if (ts.isMethodDeclaration(member)) {
        const method = this.parseMethodDeclaration(member);
        if (method) {
          objectDef.methods[method.name] = method;
        }
      }
    }

    return objectDef;
  }

  /**
   * Find @smrt() decorator on class
   */
  private findSmrtDecorator(node: ts.ClassDeclaration): ts.Decorator | null {
    if (!node.modifiers) return null;

    for (const modifier of node.modifiers) {
      if (ts.isDecorator(modifier)) {
        const expression = modifier.expression;

        // Handle @smrt() or @smrt
        if (ts.isCallExpression(expression)) {
          if (
            ts.isIdentifier(expression.expression) &&
            expression.expression.text === 'smrt'
          ) {
            return modifier;
          }
        } else if (ts.isIdentifier(expression) && expression.text === 'smrt') {
          return modifier;
        }
      }
    }

    return null;
  }

  /**
   * Check if class extends a SMRT base class
   */
  private extendsBaseClass(node: ts.ClassDeclaration): boolean {
    if (!node.heritageClauses) return false;

    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        for (const type of clause.types) {
          if (ts.isIdentifier(type.expression)) {
            const baseClassName = type.expression.text;
            if (this.options.baseClasses?.includes(baseClassName)) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Parse decorator configuration from @smrt(config)
   */
  private parseDecoratorConfig(decorator: ts.Decorator): any {
    const defaultConfig = { api: {}, mcp: {}, cli: false };

    if (!ts.isCallExpression(decorator.expression)) {
      return defaultConfig;
    }

    const args = decorator.expression.arguments;
    if (args.length === 0) return defaultConfig;

    const configArg = args[0];
    if (!ts.isObjectLiteralExpression(configArg)) {
      return defaultConfig;
    }

    try {
      // Convert AST object literal to JSON
      const configText = configArg.getFullText();
      // Simple extraction - could be more robust
      // biome-ignore lint/security/noGlobalEval: Safe eval for AST configuration parsing
      return eval(`(${configText})`);
    } catch {
      return defaultConfig;
    }
  }

  /**
   * Parse property declaration to field definition
   */
  private parsePropertyDeclaration(
    node: ts.PropertyDeclaration,
  ): FieldDefinition | null {
    // Skip static properties for now
    if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) {
      return null;
    }

    // Determine field type from initializer or type annotation
    const fieldType = this.inferFieldType(node);
    // Required if no question token and no undefined/null type
    const isRequired = !node.questionToken && !this.hasOptionalType(node);

    const field: FieldDefinition = {
      type: fieldType,
      required: isRequired,
    };

    // Extract default value from initializer
    if (node.initializer) {
      field.default = this.extractDefaultValue(node.initializer);
    }

    return field;
  }

  /**
   * Parse method declaration to method definition
   */
  private parseMethodDeclaration(
    node: ts.MethodDeclaration,
  ): MethodDefinition | null {
    const methodName = this.getPropertyName(node);
    if (!methodName) return null;

    // Check visibility modifiers
    const isStatic =
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ??
      false;
    const isPrivate =
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword) ??
      false;
    const isPublic = !isPrivate;

    // Skip based on options
    if (!this.options.includeStaticMethods && isStatic) return null;
    if (!this.options.includePrivateMethods && isPrivate) return null;

    // Parse parameters
    const parameters = node.parameters.map((param) => ({
      name: param.name.getText(),
      type: param.type?.getText() ?? 'any',
      optional: !!param.questionToken,
      default: param.initializer
        ? this.extractDefaultValue(param.initializer)
        : undefined,
    }));

    const method: MethodDefinition = {
      name: methodName,
      async:
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ??
        false,
      parameters,
      returnType: node.type?.getText() ?? 'void',
      isStatic,
      isPublic,
    };

    return method;
  }

  /**
   * Get property/method name as string
   */
  private getPropertyName(
    node: ts.PropertyDeclaration | ts.MethodDeclaration,
  ): string | null {
    if (ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    if (ts.isStringLiteral(node.name)) {
      return node.name.text;
    }
    return null;
  }

  /**
   * Infer field type from TypeScript AST
   */
  private inferFieldType(
    node: ts.PropertyDeclaration,
  ): FieldDefinition['type'] {
    // Check type annotation first
    if (node.type) {
      const typeText = node.type.getText().toLowerCase();
      if (typeText.includes('string')) return 'text';
      if (typeText.includes('number')) return 'decimal';
      if (typeText.includes('boolean')) return 'boolean';
      if (typeText.includes('date')) return 'datetime';
      if (typeText.includes('[]') || typeText.includes('array')) return 'json';
    }

    // Infer from initializer
    if (node.initializer) {
      if (ts.isStringLiteral(node.initializer)) return 'text';
      if (ts.isNumericLiteral(node.initializer)) return 'decimal';
      if (
        node.initializer.kind === ts.SyntaxKind.TrueKeyword ||
        node.initializer.kind === ts.SyntaxKind.FalseKeyword
      )
        return 'boolean';
      if (ts.isArrayLiteralExpression(node.initializer)) return 'json';
      if (ts.isObjectLiteralExpression(node.initializer)) return 'json';
    }

    return 'text'; // Default fallback
  }

  /**
   * Extract default value from initializer
   */
  private extractDefaultValue(node: ts.Expression): any {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isArrayLiteralExpression(node)) return [];
    if (ts.isObjectLiteralExpression(node)) return {};

    return undefined;
  }

  /**
   * Check if type annotation includes undefined or optional types
   */
  private hasOptionalType(node: ts.PropertyDeclaration): boolean {
    if (!node.type) return false;

    const typeText = node.type.getText().toLowerCase();
    return typeText.includes('undefined') || typeText.includes('?');
  }

  /**
   * Simple pluralization (can be enhanced)
   */
  private pluralize(word: string): string {
    if (word.endsWith('y')) {
      return `${word.slice(0, -1)}ies`;
    }
    if (word.endsWith('s') || word.endsWith('sh') || word.endsWith('ch')) {
      return `${word}es`;
    }
    return `${word}s`;
  }
}

/**
 * Convenience function to scan files
 */
export function scanFiles(
  filePaths: string[],
  options?: ScanOptions,
): ScanResult[] {
  const scanner = new ASTScanner(filePaths, options);
  return scanner.scanFiles();
}

/**
 * Scan a single file
 */
export function scanFile(filePath: string, options?: ScanOptions): ScanResult {
  const scanner = new ASTScanner([filePath], options);
  const results = scanner.scanFiles();
  return results[0] || { filePath, objects: [], errors: [] };
}
