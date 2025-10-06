/**
 * REST-based persistence adapter
 *
 * Implements persistence using REST API endpoints.
 * Maps SMRT operations to HTTP requests for microservice-based backends.
 */

import {
  ErrorUtils,
  NetworkError,
  RuntimeError,
  ValidationError,
} from '../errors';
import type { SmrtObject } from '../object';
import type { PersistenceAdapter } from './adapter';
import type {
  AdapterMetadata,
  CountOptions,
  ListOptions,
  LoadFilter,
  RestPersistenceConfig,
  SaveResult,
} from './types';

/**
 * REST persistence adapter implementation
 *
 * Uses HTTP fetch API to communicate with REST endpoints
 */
export class RestPersistenceAdapter implements PersistenceAdapter {
  readonly metadata: AdapterMetadata = {
    type: 'rest',
    supportsTransactions: false,
    supportsSchemaGeneration: false,
    supportsBatchOperations: false,
  };

  private config: RestPersistenceConfig;
  private objectClass: new (
    ...args: any[]
  ) => SmrtObject;
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;
  private initialized = false;

  constructor(
    config: RestPersistenceConfig,
    objectClass: new (...args: any[]) => SmrtObject,
  ) {
    this.config = config;
    this.objectClass = objectClass;
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = config.timeout || 30000;

    // Build default headers
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...config.headers,
    };

    // Add authentication headers
    if (config.auth) {
      if (config.auth.type === 'bearer') {
        this.headers['Authorization'] = `Bearer ${config.auth.token}`;
      } else if (config.auth.type === 'basic') {
        const credentials = btoa(
          `${config.auth.username}:${config.auth.password}`,
        );
        this.headers['Authorization'] = `Basic ${credentials}`;
      } else if (config.auth.type === 'header') {
        this.headers[config.auth.name] = config.auth.value;
      }
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Validate connection by making a health check or OPTIONS request
    try {
      const response = await this.request('OPTIONS', '');
      if (!response.ok && response.status !== 404) {
        throw NetworkError.serviceUnavailable(
          this.baseUrl,
          `Server returned ${response.status}`,
        );
      }
      this.initialized = true;
    } catch (error) {
      // If OPTIONS fails, we'll assume the server doesn't support it
      // and mark as initialized anyway (will fail on actual operations if broken)
      this.initialized = true;
    }
  }

  async save(object: SmrtObject): Promise<SaveResult> {
    try {
      // Ensure ID and slug are set
      if (!object.id) {
        (object as any)._id = crypto.randomUUID();
      }

      if (!object.slug) {
        // Generate slug from name
        if (!object.name) {
          throw ValidationError.requiredField('name', object.constructor.name);
        }
        (object as any)._slug = object.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
      }

      // Determine if this is create or update
      const isUpdate = !!object.id && (await this.checkExists(object.id));

      let response: Response;

      if (isUpdate) {
        // Update existing object
        const endpoint = this.config.endpoints?.update || `/${object.id}`;
        const method = this.config.usePatchForUpdates ? 'PATCH' : 'PUT';
        response = await this.request(
          method,
          endpoint,
          this.serializeObject(object),
        );
      } else {
        // Create new object
        const endpoint = this.config.endpoints?.create || '/';
        response = await this.request(
          'POST',
          endpoint,
          this.serializeObject(object),
        );
      }

      if (!response.ok) {
        throw NetworkError.requestFailed(
          response.url,
          response.status,
          await response.text(),
        );
      }

      return {
        inserted: !isUpdate,
        affected: 1,
      };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NetworkError) {
        throw error;
      }

      throw RuntimeError.operationFailed(
        'save',
        `${object.constructor.name}#${object.id}`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async load<T extends SmrtObject>(
    filter: LoadFilter,
    objectClass: new (options: any) => T,
  ): Promise<T | null> {
    try {
      let endpoint: string;

      if (typeof filter === 'string') {
        // String filter: check if it's a UUID (id) or slug
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            filter,
          );

        if (isUuid) {
          // Load by ID
          endpoint = this.config.endpoints?.get || `/${filter}`;
        } else {
          // Load by slug
          const params = new URLSearchParams({ slug: filter, context: '' });
          endpoint = `${this.config.endpoints?.list || '/'}?${params.toString()}`;
        }
      } else {
        // Object filter: build query string
        if (filter.id) {
          endpoint = this.config.endpoints?.get || `/${filter.id}`;
        } else {
          const params = this.buildQueryString(filter);
          endpoint = `${this.config.endpoints?.list || '/'}?${params.toString()}`;
        }
      }

      const response = await this.request('GET', endpoint);

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw NetworkError.requestFailed(
          response.url,
          response.status,
          await response.text(),
        );
      }

      const data = await response.json();

      // If we got a list response, take the first item
      const objectData = Array.isArray(data) ? data[0] : data;

      if (!objectData) {
        return null;
      }

      // Create instance with loaded data
      const instance = new objectClass({
        ...objectData,
        _skipLoad: true,
        _persistenceAdapter: this,
      });
      await instance.initialize();

      return instance;
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }

      throw RuntimeError.operationFailed(
        'load',
        JSON.stringify(filter),
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async list<T extends SmrtObject>(
    options: ListOptions,
    objectClass: new (options: any) => T,
  ): Promise<T[]> {
    try {
      const params = new URLSearchParams();

      // Add where filters
      if (options.where) {
        for (const [key, value] of Object.entries(options.where)) {
          // Parse operator from key
          const parts = key.trim().split(/\s+/);
          const field = parts[0];
          const operator = parts[1] || 'eq';

          // Map SQL-style operators to REST query param conventions
          const paramKey =
            operator === 'eq'
              ? field
              : `${field}[${this.mapOperator(operator)}]`;

          if (Array.isArray(value)) {
            params.set(paramKey, value.join(','));
          } else if (value !== null && value !== undefined) {
            params.set(paramKey, String(value));
          } else {
            params.set(paramKey, 'null');
          }
        }
      }

      // Add pagination
      if (options.limit !== undefined) {
        params.set('limit', String(options.limit));
      }
      if (options.offset !== undefined) {
        params.set('offset', String(options.offset));
      }

      // Add ordering
      if (options.orderBy) {
        const orderByArray = Array.isArray(options.orderBy)
          ? options.orderBy
          : [options.orderBy];
        params.set('orderBy', orderByArray.join(','));
      }

      const endpoint = `${this.config.endpoints?.list || '/'}?${params.toString()}`;
      const response = await this.request('GET', endpoint);

      if (!response.ok) {
        throw NetworkError.requestFailed(
          response.url,
          response.status,
          await response.text(),
        );
      }

      const data = (await response.json()) as any;
      const items = Array.isArray(data) ? data : data.items || [];

      // Create instances from response data
      const results: T[] = [];
      for (const item of items) {
        const instance = new objectClass({
          ...item,
          _skipLoad: true,
          _persistenceAdapter: this,
        });
        await instance.initialize();
        results.push(instance);
      }

      return results;
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }

      throw RuntimeError.operationFailed(
        'list',
        JSON.stringify(options),
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const endpoint = this.config.endpoints?.delete || `/${id}`;
      const response = await this.request('DELETE', endpoint);

      if (!response.ok && response.status !== 404) {
        throw NetworkError.requestFailed(
          response.url,
          response.status,
          await response.text(),
        );
      }
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }

      throw RuntimeError.operationFailed(
        'delete',
        id,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async count(options: CountOptions): Promise<number> {
    try {
      const params = new URLSearchParams();

      // Add where filters
      if (options.where) {
        for (const [key, value] of Object.entries(options.where)) {
          const parts = key.trim().split(/\s+/);
          const field = parts[0];
          const operator = parts[1] || 'eq';

          const paramKey =
            operator === 'eq'
              ? field
              : `${field}[${this.mapOperator(operator)}]`;

          if (Array.isArray(value)) {
            params.set(paramKey, value.join(','));
          } else if (value !== null && value !== undefined) {
            params.set(paramKey, String(value));
          } else {
            params.set(paramKey, 'null');
          }
        }
      }

      const endpoint = `${this.config.endpoints?.count || '/count'}?${params.toString()}`;
      const response = await this.request('GET', endpoint);

      if (!response.ok) {
        throw NetworkError.requestFailed(
          response.url,
          response.status,
          await response.text(),
        );
      }

      const data = (await response.json()) as any;

      // Handle different response formats
      if (typeof data === 'number') {
        return data;
      }
      if (data.count !== undefined) {
        return data.count;
      }
      if (data.total !== undefined) {
        return data.total;
      }

      throw new Error('Invalid count response format');
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }

      throw RuntimeError.operationFailed(
        'count',
        JSON.stringify(options),
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async bulkSave(objects: SmrtObject[]): Promise<void> {
    // REST adapter doesn't support bulk operations natively
    // Fall back to sequential saves
    for (const obj of objects) {
      await this.save(obj);
    }
  }

  async close(): Promise<void> {
    // HTTP connections don't need explicit cleanup
  }

  // ===== Private Helper Methods =====

  /**
   * Make HTTP request with retry logic
   */
  private async request(
    method: string,
    endpoint: string,
    body?: any,
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;

    const retryPolicy = this.config.retryPolicy || {};
    const maxRetries = retryPolicy.maxRetries || 3;
    const initialDelay = retryPolicy.initialDelay || 1000;
    const backoff = retryPolicy.backoff || 'exponential';

    return await ErrorUtils.withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const response = await fetch(url, {
            method,
            headers: this.headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          return response;
        } catch (error) {
          clearTimeout(timeoutId);

          if (error instanceof Error && error.name === 'AbortError') {
            throw NetworkError.timeout(url, this.timeout);
          }

          throw error;
        }
      },
      maxRetries,
      initialDelay,
      backoff === 'exponential' ? 2 : 1,
    );
  }

  /**
   * Check if object exists by ID
   */
  private async checkExists(id: string): Promise<boolean> {
    try {
      const endpoint = this.config.endpoints?.get || `/${id}`;
      const response = await this.request('GET', endpoint);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Serialize object for transmission
   */
  private serializeObject(object: SmrtObject): any {
    const fields = (object as any).getFields();
    const data: any = {
      id: object.id,
      slug: object.slug,
      context: object.context,
      name: object.name,
      created_at: object.created_at,
      updated_at: object.updated_at,
    };

    for (const [key, field] of Object.entries(fields)) {
      data[key] = (field as any).value;
    }

    return data;
  }

  /**
   * Build query string from filter object
   */
  private buildQueryString(filter: Record<string, any>): URLSearchParams {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(filter)) {
      if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          params.set(key, value.join(','));
        } else {
          params.set(key, String(value));
        }
      }
    }

    return params;
  }

  /**
   * Map SQL-style operators to REST query param conventions
   */
  private mapOperator(operator: string): string {
    const operatorMap: Record<string, string> = {
      '>': 'gt',
      '>=': 'gte',
      '<': 'lt',
      '<=': 'lte',
      '!=': 'ne',
      '<>': 'ne',
      in: 'in',
      like: 'like',
    };

    return operatorMap[operator] || operator;
  }
}
