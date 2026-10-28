/**
 * ComfyUI request errors
 */

import { ApiError } from '@happyvertical/utils';

/**
 * Thrown when a ComfyUI HTTP request returns a non-2xx status.
 *
 * ComfyUI rejects a prompt that fails validation (a missing model file, a bad
 * link between nodes) with HTTP 400 and a JSON body
 * `{ "error": {...}, "node_errors": {...} }`. This error keeps that body so
 * callers can tell a rejected prompt from a network or server failure without
 * parsing the message. The message keeps the earlier
 * `ComfyUI request failed: <status> <body>` text.
 *
 * @example
 * ```typescript
 * try {
 *   await client.queuePrompt(workflow);
 * } catch (error) {
 *   if (error instanceof ComfyUIRequestError && error.nodeErrors) {
 *     // The prompt failed validation; error.nodeErrors names the nodes.
 *   }
 *   throw error;
 * }
 * ```
 */
export class ComfyUIRequestError extends ApiError {
  /** HTTP status ComfyUI answered with. */
  public readonly status: number;
  /** HTTP method of the request. */
  public readonly method: string;
  /** Request path, for example `/prompt`. */
  public readonly path: string;
  /** Response body: parsed JSON when it is JSON, otherwise the raw text. */
  public readonly body: unknown;
  /**
   * The body's `node_errors` (per-node validation errors) when ComfyUI sent
   * any; undefined otherwise.
   */
  public readonly nodeErrors?: Record<string, unknown>;
  /** The body's top-level `error` object (type, message, details), if any. */
  public readonly promptError?: unknown;

  constructor(input: {
    status: number;
    method: string;
    path: string;
    bodyText: string;
  }) {
    super(`ComfyUI request failed: ${input.status} ${input.bodyText}`, {
      status: input.status,
      method: input.method,
      path: input.path,
    });
    this.status = input.status;
    this.method = input.method;
    this.path = input.path;
    this.body = parseBody(input.bodyText);

    if (
      this.body &&
      typeof this.body === 'object' &&
      !Array.isArray(this.body)
    ) {
      const { error, node_errors: nodeErrors } = this.body as {
        error?: unknown;
        // biome-ignore lint/style/useNamingConvention: ComfyUI API field
        node_errors?: unknown;
      };
      if (
        nodeErrors &&
        typeof nodeErrors === 'object' &&
        !Array.isArray(nodeErrors) &&
        Object.keys(nodeErrors).length > 0
      ) {
        this.nodeErrors = nodeErrors as Record<string, unknown>;
      }
      if (error !== undefined) {
        this.promptError = error;
      }
    }
  }
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
