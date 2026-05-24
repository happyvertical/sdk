/**
 * ComfyUI Client
 *
 * WebSocket and REST client for interacting with ComfyUI servers.
 * Supports workflow execution, progress monitoring, and file management.
 */

import { createLogger, type Logger } from '@happyvertical/logger';
import { ValidationError } from '@happyvertical/utils';

import type {
  ComfyUIClientOptions,
  ComfyWorkflow,
  HistoryEntry,
  NodeMapping,
  ProgressEvent,
  PromptResult,
  QueueStatus,
  ResolvedClientOptions,
  SystemStats,
  UploadResult,
  WaitOptions,
} from './types.js';

/**
 * WebSocket message types from ComfyUI.
 *
 * `data` carries the union of fields the various message types
 * use, discriminated by `type` at runtime in `parseProgressEvent`.
 * Previously typed as `unknown`, which made every
 * `message.data?.<field>` access in that switch fail TS2339 — the
 * narrowing would have required parser-side type guards, much
 * heavier than just listing the actual fields here.
 */
interface WSMessage {
  type: string;
  data?: {
    node?: string;
    prompt_id?: string;
    output?: Record<string, unknown>;
    value?: number;
    max?: number;
    exception_message?: string;
  };
}

/**
 * ComfyUI client for workflow execution and management
 *
 * @example
 * ```typescript
 * import { ComfyUIClient } from '@happyvertical/comfyui';
 *
 * const client = new ComfyUIClient({
 *   url: 'http://localhost:8188',
 * });
 *
 * await client.connect();
 *
 * const result = await client.queuePrompt(workflow);
 * await client.waitForCompletion(result.promptId, {
 *   onProgress: (event) => console.log(`Progress: ${event.value}%`),
 * });
 *
 * const output = await client.downloadOutput('video.mp4');
 * await client.disconnect();
 * ```
 */
export class ComfyUIClient {
  private options: ResolvedClientOptions;
  private ws: WebSocket | null = null;
  private logger: Logger;
  private clientId: string;
  private messageHandlers: Map<string, Set<(event: ProgressEvent) => void>> =
    new Map();
  private reconnectAttempts = 0;
  private isConnecting = false;
  private username?: string;
  private password?: string;

  constructor(options: ComfyUIClientOptions = {}) {
    this.options = {
      url: options.url ?? 'http://localhost:8188',
      timeout: options.timeout ?? 600000,
      headers: options.headers ?? {},
      reconnect: {
        enabled: options.reconnect?.enabled ?? true,
        maxAttempts: options.reconnect?.maxAttempts ?? 5,
        delay: options.reconnect?.delay ?? 1000,
      },
    };

    if (options.username && options.password) {
      this.username = options.username;
      this.password = options.password;
      const credentials = btoa(`${options.username}:${options.password}`);
      this.options.headers.Authorization = `Basic ${credentials}`;
    }

    this.logger = createLogger({ level: 'info' });
    this.clientId = crypto.randomUUID();
  }

  /**
   * Get the HTTP base URL
   */
  private get httpUrl(): string {
    return this.options.url;
  }

  /**
   * Get the WebSocket URL
   */
  private get wsUrl(): string {
    const url = new URL(this.options.url);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws';
    url.searchParams.set('clientId', this.clientId);
    if (this.username && this.password) {
      url.username = this.username;
      url.password = this.password;
    }
    return url.toString();
  }

  /**
   * Connect to the ComfyUI WebSocket
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      await new Promise<void>((resolve, reject) => {
        const checkConnection = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection);
            resolve();
          } else if (!this.isConnecting) {
            clearInterval(checkConnection);
            reject(new Error('Connection failed'));
          }
        }, 100);
      });
      return;
    }

    this.isConnecting = true;

    try {
      await this.establishConnection();
      this.reconnectAttempts = 0;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Establish WebSocket connection
   */
  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        const timeout = setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.ws?.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.logger.info('Connected to ComfyUI');
          resolve();
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          this.logger.error('WebSocket error', { error });
          reject(new Error('WebSocket connection error'));
        };

        this.ws.onclose = () => {
          this.logger.info('Disconnected from ComfyUI');
          this.handleDisconnect();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle WebSocket disconnection
   */
  private async handleDisconnect(): Promise<void> {
    const reconnect = this.options.reconnect;
    if (!reconnect.enabled) return;

    if (this.reconnectAttempts < reconnect.maxAttempts) {
      this.reconnectAttempts++;
      this.logger.info(
        `Attempting reconnection ${this.reconnectAttempts}/${reconnect.maxAttempts}`,
      );

      await new Promise((resolve) => setTimeout(resolve, reconnect.delay));

      try {
        await this.connect();
      } catch (error) {
        this.logger.error('Reconnection failed', { error });
      }
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const message: WSMessage = JSON.parse(data);
      const event = this.parseProgressEvent(message);

      if (event?.promptId) {
        const handlers = this.messageHandlers.get(event.promptId);
        if (handlers) {
          for (const handler of handlers) {
            handler(event);
          }
        }
      }
    } catch (error) {
      this.logger.warn('Failed to parse WebSocket message', { error, data });
    }
  }

  /**
   * Parse a WebSocket message into a ProgressEvent
   */
  private parseProgressEvent(message: WSMessage): ProgressEvent | null {
    switch (message.type) {
      case 'executing':
        return {
          type: 'executing',
          nodeId: message.data?.node,
          promptId: message.data?.prompt_id,
        };

      case 'progress':
        return {
          type: 'progress',
          value: message.data?.value,
          max: message.data?.max,
          promptId: message.data?.prompt_id,
        };

      case 'execution_cached':
        return {
          type: 'execution_cached',
          promptId: message.data?.prompt_id,
        };

      case 'executed':
        return {
          type: 'executed',
          nodeId: message.data?.node,
          promptId: message.data?.prompt_id,
          output: message.data?.output,
        };

      case 'execution_error':
        return {
          type: 'execution_error',
          promptId: message.data?.prompt_id,
          error: message.data?.exception_message,
        };

      default:
        return null;
    }
  }

  /**
   * Disconnect from ComfyUI
   */
  async disconnect(): Promise<void> {
    this.options.reconnect.enabled = false; // Prevent auto-reconnect
    this.messageHandlers.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.logger.info('Disconnected from ComfyUI');
  }

  /**
   * Make an HTTP request to ComfyUI
   */
  private async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE';
      body?: unknown;
      formData?: FormData;
    } = {},
  ): Promise<T> {
    const url = `${this.httpUrl}${path}`;

    const headers: Record<string, string> = {
      ...this.options.headers,
    };

    if (options.body && !options.formData) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.formData ??
        (options.body ? JSON.stringify(options.body) : undefined),
      signal: AbortSignal.timeout(this.options.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ComfyUI request failed: ${response.status} ${errorText}`,
      );
    }

    return response.json();
  }

  /**
   * Queue a workflow for execution
   *
   * @param workflow - The ComfyUI workflow to execute
   * @param clientId - Optional client ID (uses default if not provided)
   * @returns Promise resolving to prompt result with ID
   */
  async queuePrompt(
    workflow: ComfyWorkflow,
    clientId?: string,
  ): Promise<PromptResult> {
    const response = await this.request<{
      prompt_id: string;
      number: number;
      node_errors?: Record<string, string[]>;
    }>('/prompt', {
      method: 'POST',
      body: {
        prompt: workflow,
        client_id: clientId ?? this.clientId,
      },
    });

    return {
      promptId: response.prompt_id,
      number: response.number,
      nodeErrors: response.node_errors,
    };
  }

  /**
   * Subscribe to progress events for a prompt
   *
   * @param promptId - The prompt ID to monitor
   * @param handler - Callback for progress events
   * @returns Unsubscribe function
   */
  onProgress(
    promptId: string,
    handler: (event: ProgressEvent) => void,
  ): () => void {
    if (!this.messageHandlers.has(promptId)) {
      this.messageHandlers.set(promptId, new Set());
    }

    this.messageHandlers.get(promptId)?.add(handler);

    return () => {
      this.messageHandlers.get(promptId)?.delete(handler);
      if (this.messageHandlers.get(promptId)?.size === 0) {
        this.messageHandlers.delete(promptId);
      }
    };
  }

  /**
   * Wait for a prompt to complete
   *
   * @param promptId - The prompt ID to wait for
   * @param options - Wait options including progress callback
   * @returns Promise resolving to the history entry
   */
  async waitForCompletion(
    promptId: string,
    options: WaitOptions = {},
  ): Promise<HistoryEntry> {
    const timeout = options.timeout ?? this.options.timeout;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      let resolved = false;

      // Set up timeout
      const timeoutId =
        timeout > 0
          ? setTimeout(() => {
              if (!resolved) {
                resolved = true;
                unsubscribe();
                reject(new Error(`Timeout waiting for prompt ${promptId}`));
              }
            }, timeout)
          : null;

      // Subscribe to progress events
      const unsubscribe = this.onProgress(promptId, async (event) => {
        // Forward progress events
        options.onProgress?.(event);

        // Check for completion or error
        if (event.type === 'executed' && event.nodeId === null) {
          // Workflow completed (null nodeId means no more nodes to execute)
          if (!resolved) {
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            unsubscribe();

            try {
              const history = await this.getHistory(promptId);
              resolve(history);
            } catch (error) {
              reject(error);
            }
          }
        } else if (event.type === 'execution_error') {
          if (!resolved) {
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            unsubscribe();
            reject(new Error(`Workflow execution error: ${event.error}`));
          }
        }
      });

      // Fallback: poll history if WebSocket doesn't give completion
      const pollHistory = async () => {
        while (
          !resolved &&
          (timeout === 0 || Date.now() - startTime < timeout)
        ) {
          await new Promise((r) => setTimeout(r, options.pollInterval ?? 1000));

          if (resolved) break;

          try {
            const history = await this.getHistory(promptId);
            if (history.status.completed) {
              if (!resolved) {
                resolved = true;
                if (timeoutId) clearTimeout(timeoutId);
                unsubscribe();
                resolve(history);
              }
              break;
            }
          } catch {
            // History not available yet, continue polling
          }
        }
      };

      // Start polling as fallback
      pollHistory().catch(() => {});
    });
  }

  /**
   * Get history for a specific prompt
   *
   * @param promptId - The prompt ID to get history for
   * @returns Promise resolving to the history entry
   */
  async getHistory(promptId: string): Promise<HistoryEntry> {
    const response = await this.request<Record<string, any>>(
      `/history/${promptId}`,
    );

    const entry = response[promptId];
    if (!entry) {
      throw new ValidationError(`History not found for prompt ${promptId}`);
    }

    return {
      promptId,
      status: entry.status,
      outputs: entry.outputs,
      prompt: entry.prompt,
    };
  }

  /**
   * Download an output file from ComfyUI
   *
   * @param filename - Name of the file to download
   * @param subfolder - Subfolder where file is located
   * @param type - Type of file location ('output', 'temp', or 'input')
   * @returns Promise resolving to the file buffer
   */
  async downloadOutput(
    filename: string,
    subfolder: string = '',
    type: 'output' | 'temp' | 'input' = 'output',
  ): Promise<Buffer> {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type,
    });

    const url = `${this.httpUrl}/view?${params}`;
    const response = await fetch(url, {
      headers: this.options.headers,
      signal: AbortSignal.timeout(this.options.timeout),
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Upload a file to ComfyUI
   *
   * @param file - File buffer to upload
   * @param filename - Name for the file
   * @param type - Where to upload ('input' or 'temp')
   * @param overwrite - Whether to overwrite existing file
   * @returns Promise resolving to upload result
   */
  async uploadFile(
    file: Buffer,
    filename: string,
    type: 'input' | 'temp' = 'input',
    overwrite = false,
  ): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('image', new Blob([new Uint8Array(file)]), filename);
    formData.append('type', type);
    formData.append('overwrite', String(overwrite));

    const response = await this.request<{
      name: string;
      subfolder: string;
      type: string;
    }>('/upload/image', {
      method: 'POST',
      formData,
    });

    return {
      name: response.name,
      subfolder: response.subfolder,
      type: response.type as 'input' | 'temp' | 'output',
    };
  }

  /**
   * Get system statistics from ComfyUI
   *
   * @returns Promise resolving to system stats
   */
  async getSystemStats(): Promise<SystemStats> {
    return this.request<SystemStats>('/system_stats');
  }

  /**
   * Get the current queue status
   *
   * @returns Promise resolving to queue status
   */
  async getQueue(): Promise<QueueStatus> {
    const response = await this.request<{
      queue_running: any[];
      queue_pending: any[];
    }>('/queue');

    return {
      running: response.queue_running,
      pending: response.queue_pending,
    };
  }

  /**
   * Interrupt the current execution
   */
  async interrupt(): Promise<void> {
    await this.request('/interrupt', { method: 'POST' });
  }

  /**
   * Clear the execution queue
   */
  async clearQueue(): Promise<void> {
    await this.request('/queue', {
      method: 'POST',
      body: { clear: true },
    });
  }

  /**
   * Delete a specific item from the queue
   *
   * @param promptId - The prompt ID to delete
   */
  async deleteFromQueue(promptId: string): Promise<void> {
    await this.request('/queue', {
      method: 'POST',
      body: { delete: [promptId] },
    });
  }
}

/**
 * Helper function to inject parameters into a workflow
 *
 * @param workflow - The base workflow
 * @param mapping - Node mapping defining where to inject
 * @param values - Values to inject
 * @returns Modified workflow with injected values
 */
export function injectWorkflowParams(
  workflow: ComfyWorkflow,
  mapping: NodeMapping,
  values: Record<string, any>,
): ComfyWorkflow {
  const result = JSON.parse(JSON.stringify(workflow));

  for (const [key, nodeId] of Object.entries(mapping)) {
    if (nodeId && values[key] !== undefined && result[nodeId]) {
      // Find the appropriate input field and update it
      const node = result[nodeId];

      // Common input field names for different node types
      const inputFieldMap: Record<string, string> = {
        seedImage: 'image',
        audioFile: 'audio',
        baseVideo: 'video',
        prompt: 'text',
        negativePrompt: 'text',
      };

      const inputField = inputFieldMap[key] ?? key;
      if (node.inputs && inputField in node.inputs) {
        node.inputs[inputField] = values[key];
      }
    }
  }

  return result;
}
