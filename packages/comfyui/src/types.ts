/**
 * ComfyUI API Types
 *
 * Types for interacting with ComfyUI's REST and WebSocket APIs.
 */

/**
 * Reconnection options for WebSocket
 */
export interface ReconnectOptions {
  /**
   * Whether to automatically reconnect
   * @default true
   */
  enabled: boolean;

  /**
   * Maximum number of reconnection attempts
   * @default 5
   */
  maxAttempts: number;

  /**
   * Delay between reconnection attempts in ms
   * @default 1000
   */
  delay: number;
}

/**
 * Resolved client options with all required fields
 */
export interface ResolvedClientOptions {
  url: string;
  timeout: number;
  headers: Record<string, string>;
  reconnect: ReconnectOptions;
}

/**
 * Configuration for the ComfyUI client
 */
export interface ComfyUIClientOptions {
  /**
   * Base URL for the ComfyUI server
   * @default 'http://localhost:8188'
   */
  url?: string;

  /**
   * Request timeout in milliseconds
   * @default 600000 (10 minutes)
   */
  timeout?: number;

  /**
   * Custom headers for API requests
   */
  headers?: Record<string, string>;

  /**
   * Reconnection options for WebSocket
   */
  reconnect?: Partial<ReconnectOptions>;

  /**
   * Username for HTTP Basic authentication
   */
  username?: string;

  /**
   * Password for HTTP Basic authentication
   */
  password?: string;
}

/**
 * ComfyUI workflow definition (API format JSON)
 */
export interface ComfyWorkflow {
  /**
   * Node definitions in the workflow
   * Keys are node IDs
   */
  [nodeId: string]: ComfyNode;
}

/**
 * A single node in a ComfyUI workflow
 */
export interface ComfyNode {
  /**
   * Node class type (e.g., 'KSampler', 'LoadImage', 'SaveImage')
   */
  class_type: string;

  /**
   * Node input values
   */
  inputs: Record<string, unknown>;

  /**
   * Optional metadata
   */
  _meta?: {
    title?: string;
  };
}

/**
 * Node mapping for dynamic parameter injection
 */
export interface NodeMapping {
  /**
   * Node ID for seed image input
   */
  seedImage?: string;

  /**
   * Node ID for audio file input
   */
  audioFile?: string;

  /**
   * Node ID for base video input
   */
  baseVideo?: string;

  /**
   * Node ID for final output
   */
  outputVideo?: string;

  /**
   * Node ID for text prompt input
   */
  prompt?: string;

  /**
   * Node ID for negative prompt input
   */
  negativePrompt?: string;

  /**
   * Additional custom mappings
   */
  [key: string]: string | undefined;
}

/**
 * Result from queueing a prompt
 */
export interface PromptResult {
  /**
   * Unique ID for this prompt execution
   */
  promptId: string;

  /**
   * Queue number position
   */
  number: number;

  /**
   * Node-specific errors (if any)
   */
  nodeErrors?: Record<string, string[]>;
}

/**
 * Progress event during workflow execution
 */
export interface ProgressEvent {
  /**
   * Type of progress event
   */
  type:
    | 'executing'
    | 'progress'
    | 'execution_cached'
    | 'executed'
    | 'execution_error';

  /**
   * Currently executing node ID. May be `null` on `executed` events
   * — the ComfyUI WebSocket protocol uses `nodeId === null` as a
   * "no more nodes to execute" completion sentinel, which
   * `waitForCompletion` (client.ts) relies on. Treat `null` as
   * "workflow complete", `undefined` as "field absent", and a
   * string as "this node is the subject of the event".
   */
  nodeId?: string | null;

  /**
   * Progress value (0-100 for 'progress' type)
   */
  value?: number;

  /**
   * Maximum value for progress
   */
  max?: number;

  /**
   * Prompt ID this event relates to
   */
  promptId?: string;

  /**
   * Output data for completed nodes
   */
  output?: Record<string, unknown>;

  /**
   * Error message (for 'execution_error' type)
   */
  error?: string;
}

/**
 * History entry for a completed prompt
 */
export interface HistoryEntry {
  /**
   * Prompt ID
   */
  promptId: string;

  /**
   * Status of the execution
   */
  status: {
    completed: boolean;
    status_str: string;
    messages: Array<[string, unknown]>;
  };

  /**
   * Output data from each node
   */
  outputs: Record<string, NodeOutput>;

  /**
   * Original prompt data
   */
  prompt: [number, string, ComfyWorkflow, any, string[]];
}

/**
 * Output data from a single node
 */
export interface NodeOutput {
  /**
   * Images produced by this node
   */
  images?: Array<{
    filename: string;
    subfolder: string;
    type: 'output' | 'temp' | 'input';
  }>;

  /**
   * Other output data
   */
  [key: string]: unknown;
}

/**
 * System information from ComfyUI
 */
export interface SystemStats {
  /**
   * Available CUDA devices
   */
  devices: Array<{
    name: string;
    type: string;
    index: number;
    vram_total: number;
    vram_free: number;
    torch_vram_total: number;
    torch_vram_free: number;
  }>;

  /**
   * System RAM information
   */
  system: {
    os: string;
    python_version: string;
    embedded_python: boolean;
  };
}

/**
 * Queue status from ComfyUI
 */
export interface QueueStatus {
  /**
   * Currently running prompts
   */
  running: Array<[number, string, ComfyWorkflow, any]>;

  /**
   * Pending prompts in queue
   */
  pending: Array<[number, string, ComfyWorkflow, any]>;
}

/**
 * Options for waiting on prompt completion
 */
export interface WaitOptions {
  /**
   * Callback for progress updates
   */
  onProgress?: (event: ProgressEvent) => void;

  /**
   * Timeout in milliseconds (0 = no timeout)
   * @default 600000 (10 minutes)
   */
  timeout?: number;

  /**
   * Polling interval for fallback HTTP polling (if WebSocket fails)
   * @default 1000
   */
  pollInterval?: number;
}

/**
 * File upload result
 */
export interface UploadResult {
  /**
   * Name of the uploaded file
   */
  name: string;

  /**
   * Subfolder where file was uploaded
   */
  subfolder: string;

  /**
   * Type of upload location
   */
  type: 'input' | 'temp' | 'output';
}
