/**
 * @happyvertical/comfyui
 *
 * ComfyUI API client for workflow orchestration and video generation.
 *
 * @example
 * ```typescript
 * import { ComfyUIClient, injectWorkflowParams } from '@happyvertical/comfyui';
 *
 * // Create client
 * const client = new ComfyUIClient({
 *   url: 'http://localhost:8188',
 * });
 *
 * // Connect and execute workflow
 * await client.connect();
 *
 * const workflow = await loadWorkflow('my-workflow.json');
 * const modifiedWorkflow = injectWorkflowParams(workflow, {
 *   seedImage: '3',
 *   prompt: '6',
 * }, {
 *   seedImage: 'input/anchor.png',
 *   prompt: 'professional news anchor speaking',
 * });
 *
 * const result = await client.queuePrompt(modifiedWorkflow);
 *
 * // Wait for completion with progress updates
 * const history = await client.waitForCompletion(result.promptId, {
 *   onProgress: (event) => {
 *     if (event.type === 'progress') {
 *       console.log(`Progress: ${event.value}/${event.max}`);
 *     }
 *   },
 * });
 *
 * // Download output
 * const output = history.outputs['SaveVideo'];
 * if (output?.videos?.[0]) {
 *   const video = await client.downloadOutput(output.videos[0].filename);
 *   fs.writeFileSync('output.mp4', video);
 * }
 *
 * await client.disconnect();
 * ```
 *
 * @packageDocumentation
 */

// Client
export { ComfyUIClient, injectWorkflowParams } from './client.js';

// Types
export type {
  ComfyNode,
  ComfyUIClientOptions,
  ComfyWorkflow,
  HistoryEntry,
  NodeMapping,
  NodeOutput,
  ProgressEvent,
  PromptResult,
  QueueStatus,
  SystemStats,
  UploadResult,
  WaitOptions,
} from './types.js';
