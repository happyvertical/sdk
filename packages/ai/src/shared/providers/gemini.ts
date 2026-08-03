/**
 * Google Gemini provider implementation
 */

import crypto from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractRetryAfterSeconds } from '../rate-limit';
import {
  normalizeBaseAIOptions,
  normalizeChatOptions,
  normalizeImageGenerationOptions,
  type PreparedRequestControls,
  prepareRequestControls,
} from '../safety';
import type {
  AICapabilities,
  AIInterface,
  AIMessage,
  AIModel,
  AIResponse,
  ChatOptions,
  CompletionOptions,
  EmbeddingOptions,
  EmbeddingResponse,
  GeminiOptions,
  ImageDescriptionOptions,
  ImageEmbeddingOptions,
  ImageGenerationOptions,
  ImageGenerationResponse,
  MessageOptions,
  TokenUsage,
  TTSOptions,
  TTSResponse,
  VideoGenerationJob,
  VideoGenerationOptions,
  VideoGenerationResult,
  VideoGenerationStatusResult,
  Voice,
  VoiceCloneOptions,
  VoiceDesignOptions,
  VoiceListOptions,
} from '../types';
import {
  AIError,
  AuthenticationError,
  extractTextContent,
  ModelNotFoundError,
  RateLimitError,
} from '../types';
import { emitUsage } from './usage';

// Note: This implementation uses the new @google/genai package
// @google/generative-ai is deprecated - migrated to @google/genai

/**
 * Default Veo model for video generation. Veo 2 / Veo 3.0 are deprecated in
 * favor of Veo 3.1 (still "preview" in its model id, but the current
 * non-deprecated generation per Google's docs as of this writing). Veo 3.1
 * supports the `resolution` config field this provider forwards; Veo 2 does
 * not, so callers pinning back to Veo 2 should omit `resolution`.
 */
const DEFAULT_VEO_MODEL = 'veo-3.1-generate-preview';

/**
 * Type-only reference to the real `GenerateVideosOperation` class. The
 * `@google/genai` SDK's `operations.getVideosOperation` calls
 * `operation._fromAPIResponse(...)`, an instance method — passing a plain
 * `{ name }` object literal throws at runtime. Typing the constructed
 * operation against this type (rather than `any`) makes tsc reject a
 * regression back to a plain literal, since `_fromAPIResponse` is a
 * required member of the real class's public shape.
 */
type VideosOperation = import('@google/genai').GenerateVideosOperation;

export class GeminiProvider implements AIInterface {
  private options: GeminiOptions;
  private client: any; // GoogleGenAI instance from @google/genai
  private operationCtor?: new () => VideosOperation;

  constructor(options: GeminiOptions) {
    this.options = normalizeBaseAIOptions({
      defaultModel: 'gemini-2.5-flash',
      ...options,
    });

    // Initialize Google Generative AI client
    this.initializeClientSync();
  }

  private initializeClientSync() {
    try {
      // Dynamic import in constructor - this will work if the package is installed
      import('@google/genai')
        .then(({ GoogleGenAI, GenerateVideosOperation }) => {
          this.client = new GoogleGenAI(this.buildClientConfig());
          this.operationCtor = GenerateVideosOperation;
        })
        .catch(() => {
          // Client will be null and we'll handle it in methods
        });
    } catch (_error) {
      // Client will be null and we'll handle it in methods
    }
  }

  private async ensureClient() {
    if (!this.client) {
      try {
        const { GoogleGenAI, GenerateVideosOperation } = await import(
          '@google/genai'
        );
        this.client = new GoogleGenAI(this.buildClientConfig());
        this.operationCtor = GenerateVideosOperation;
      } catch (_error) {
        throw new AIError(
          'Failed to initialize Gemini client. Make sure @google/genai is installed.',
          'INITIALIZATION_ERROR',
          'gemini',
        );
      }
    }
  }

  /**
   * Build the GoogleGenAI client configuration based on provided options.
   * Supports both Google AI Studio (apiKey only) and Vertex AI (projectId + location).
   */
  private buildClientConfig(): Record<string, any> {
    // If projectId and location are provided, use Vertex AI mode
    if (this.options.projectId && this.options.location) {
      return {
        vertexai: true,
        project: this.options.projectId,
        location: this.options.location,
        apiKey: this.options.apiKey, // Optional for Vertex AI with ADC
        httpOptions: {
          timeout: this.options.timeout,
          retryOptions: { attempts: (this.options.maxRetries || 0) + 1 },
        },
      };
    }

    // Default to Google AI Studio mode with API key
    return {
      apiKey: this.options.apiKey,
      httpOptions: {
        timeout: this.options.timeout,
        retryOptions: { attempts: (this.options.maxRetries || 0) + 1 },
      },
    };
  }

  async chat(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): Promise<AIResponse> {
    const startTime = Date.now();
    let controls: PreparedRequestControls | undefined;
    try {
      await this.ensureClient();

      const model = options.model || this.options.defaultModel;
      options = normalizeChatOptions(this.options, options, 'gemini', model);
      controls = prepareRequestControls(this.options, options);
      const requestConfig: Record<string, any> = {
        model,
        contents: this.messagesToGeminiFormat(messages),
        config: this.buildGenerateContentConfig(options, controls),
      };

      // Call new SDK API: ai.models.generateContent()
      const result = await this.client.models.generateContent(requestConfig);

      // Extract tool calls from response
      let toolCalls: AIResponse['toolCalls'];
      const firstCandidate = result.candidates?.[0];
      if (firstCandidate?.content?.parts) {
        const functionCalls = firstCandidate.content.parts.filter(
          (part: any) => part.functionCall,
        );
        if (functionCalls.length > 0) {
          toolCalls = functionCalls.map((part: any) => ({
            id: `call_${crypto.randomUUID()}`,
            type: 'function' as const,
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
          }));
        }
      }

      // Clean content - remove markdown code blocks if JSON mode was requested
      let content = result.text || '';
      if (options.responseFormat?.type === 'json_object') {
        content = this.stripMarkdownCodeBlock(content);
      }

      const usage: TokenUsage = {
        promptTokens: result.usageMetadata?.promptTokenCount || 0,
        completionTokens: result.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: result.usageMetadata?.totalTokenCount || 0,
      };
      emitUsage(
        this.options,
        'gemini',
        'chat',
        model!,
        usage,
        startTime,
        options.usageTags,
      );

      return {
        content,
        model,
        finishReason: this.mapFinishReason(result),
        usage,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      };
    } catch (error) {
      if (controls?.didTimeout()) {
        throw new AIError(
          `AI request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          'gemini',
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          'gemini',
          options.model,
        );
      }
      throw this.mapError(error);
    } finally {
      controls?.cleanup();
    }
  }

  async complete(
    prompt: string,
    options: CompletionOptions = {},
  ): Promise<AIResponse> {
    return this.chat([{ role: 'user', content: prompt }], {
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      n: options.n,
      stop: options.stop,
      stream: options.stream,
      onProgress: options.onProgress,
      signal: options.signal,
      timeout: options.timeout,
      reasoning: options.reasoning,
      usageTags: options.usageTags,
    });
  }

  /**
   * Simple message interface for single-turn interactions with optional history
   *
   * @param text - The message text to send
   * @param options - Configuration options including history, model, etc.
   * @returns Promise resolving to the response content string
   *
   * @example
   * ```typescript
   * // Simple usage
   * const response = await provider.message('Hello!');
   *
   * // With history
   * const response = await provider.message('What was my question?', {
   *   history: [
   *     { role: 'user', content: 'What is 2+2?' },
   *     { role: 'assistant', content: '4' }
   *   ]
   * });
   * ```
   */
  async message(text: string, options: MessageOptions = {}): Promise<string> {
    // Build messages array from history + current message
    const messages: AIMessage[] = [
      ...(options.history || []),
      { role: options.role || 'user', content: text },
    ];

    const response = await this.chat(messages, {
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      stop: options.stop,
      stream: options.stream,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
      responseFormat: options.responseFormat,
      seed: options.seed,
      tools: options.tools,
      toolChoice: options.toolChoice,
      onProgress: options.onProgress,
      signal: options.signal,
      timeout: options.timeout,
      reasoning: options.reasoning,
      usageTags: options.usageTags,
    });

    return response.content;
  }

  /**
   * Generate embeddings for text using Gemini embedding models
   * @param text - Single text string or array of texts to embed
   * @param options - Optional configuration for embeddings
   * @returns Promise resolving to embeddings response
   *
   * @example
   * ```typescript
   * const embedding = await provider.embed('Hello world');
   * const embeddings = await provider.embed(['Text 1', 'Text 2']);
   * ```
   */
  async embed(
    text: string | string[],
    options: EmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    const startTime = Date.now();
    try {
      await this.ensureClient();

      const model = options.model || 'text-embedding-004';
      const input = Array.isArray(text) ? text : [text];

      const embeddings: number[][] = [];
      let totalTokens = 0;

      for (const content of input) {
        const config: Record<string, any> = {};
        if (options.dimensions) {
          config.outputDimensionality = options.dimensions;
        }

        const result = await this.client.models.embedContent({
          model,
          contents: content,
          config: Object.keys(config).length > 0 ? config : undefined,
        });

        if (result.embeddings?.[0]?.values) {
          embeddings.push(result.embeddings[0].values);
        }
        if (result.metadata?.tokenCount) {
          totalTokens += result.metadata.tokenCount;
        }
      }

      const usage: TokenUsage | undefined =
        totalTokens > 0
          ? {
              promptTokens: totalTokens,
              completionTokens: 0,
              totalTokens,
            }
          : undefined;
      emitUsage(
        this.options,
        'gemini',
        'embed',
        model,
        usage,
        startTime,
        options.usageTags,
      );

      return {
        embeddings,
        model,
        usage,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Decode an image input (URL, base64 data URL, or Buffer) to raw bytes.
   * Shared by the chat/vision inline-data format and the video-generation
   * `imageBytes` format, which use different wrapper shapes around the same
   * base64 payload.
   * @private
   */
  private async decodeImageInput(
    image: string | Buffer,
    signal?: AbortSignal,
  ): Promise<{ mimeType: string; base64Data: string }> {
    let mimeType = 'image/png';
    let base64Data: string;

    if (Buffer.isBuffer(image)) {
      base64Data = image.toString('base64');
    } else if (image.startsWith('data:')) {
      // Parse data URL
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      } else {
        throw new AIError(
          'Invalid base64 data URL format',
          'INVALID_INPUT',
          'gemini',
        );
      }
    } else {
      // Fetch from URL
      const response = await fetch(image, { signal });
      if (!response.ok) {
        throw new AIError(
          `Failed to fetch image: ${response.status} ${response.statusText}`,
          'IMAGE_FETCH_ERROR',
          'gemini',
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString('base64');
      mimeType = response.headers.get('content-type') || 'image/png';
    }

    return { mimeType, base64Data };
  }

  /**
   * Convert an image to Gemini's inline-data format, used by chat/vision
   * `contents` parts (`generateContent`, `embedContent`).
   * @param image - Image as URL, base64 data URL, or Buffer
   * @returns Gemini inline data format
   * @private
   */
  private async imageToGeminiFormat(
    image: string | Buffer,
    signal?: AbortSignal,
  ): Promise<{ inlineData: { mimeType: string; data: string } }> {
    const { mimeType, base64Data } = await this.decodeImageInput(image, signal);
    return {
      inlineData: { mimeType, data: base64Data },
    };
  }

  /**
   * Convert a reference image to the shape `generateVideos`'s `image`
   * parameter expects: `{ imageBytes, mimeType }` (or `{ gcsUri }` for a
   * `gs://` URI in Vertex AI mode). This is a different shape than
   * {@link imageToGeminiFormat}'s `{ inlineData: {...} }` — the SDK's video
   * converters read `imageBytes`/`mimeType`/`gcsUri` directly and silently
   * drop anything else, which previously caused image-to-video requests to
   * convert to `{}` and fall back to text-to-video.
   * @private
   */
  private async imageToGeminiVideoFormat(
    image: string | Buffer,
    signal?: AbortSignal,
  ): Promise<{ imageBytes: string; mimeType: string } | { gcsUri: string }> {
    if (typeof image === 'string' && image.startsWith('gs://')) {
      return { gcsUri: image };
    }
    const { mimeType, base64Data } = await this.decodeImageInput(image, signal);
    return { imageBytes: base64Data, mimeType };
  }

  /**
   * Generate a text description of an image
   * @param image - Image as URL, base64 data URL, or Buffer
   * @param prompt - Custom prompt for description (optional)
   * @param options - Optional configuration
   * @returns Promise resolving to the description string
   *
   * @example
   * ```typescript
   * const description = await provider.describeImage('https://example.com/image.jpg');
   * ```
   */
  async describeImage(
    image: string | Buffer,
    prompt?: string,
    options: ImageDescriptionOptions = {},
  ): Promise<string> {
    let controls: PreparedRequestControls | undefined;
    try {
      await this.ensureClient();

      const defaultPrompt =
        'Describe this image for a search index. Include objects, mood, lighting, and any visible text.';

      const model =
        options.model || this.options.defaultModel || 'gemini-2.5-flash';
      const normalized = normalizeChatOptions(
        this.options,
        { ...options, maxTokens: options.maxTokens ?? 500 },
        'gemini',
        model,
      );
      controls = prepareRequestControls(this.options, normalized);
      const imageData = await this.imageToGeminiFormat(image, controls.signal);

      const response = await this.client.models.generateContent({
        model,
        contents: [{ text: prompt || defaultPrompt }, imageData],
        config: this.buildGenerateContentConfig(normalized, controls),
      });

      return response.text || '';
    } catch (error) {
      if (controls?.didTimeout()) {
        throw new AIError(
          `AI request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          'gemini',
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          'gemini',
          options.model,
        );
      }
      throw this.mapError(error);
    } finally {
      controls?.cleanup();
    }
  }

  /**
   * Generate embeddings for an image using native multimodal embeddings
   * @param image - Image as URL, base64 data URL, or Buffer
   * @param options - Optional configuration for image embeddings
   * @returns Promise resolving to embeddings response
   *
   * @example
   * ```typescript
   * const embedding = await provider.embedImage('https://example.com/image.jpg');
   * ```
   */
  async embedImage(
    image: string | Buffer,
    options: ImageEmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    try {
      await this.ensureClient();

      // Gemini uses multimodal embedding model
      const model = options.model || 'multimodalembedding@001';
      const imageData = await this.imageToGeminiFormat(image);

      const config: Record<string, any> = {};
      if (options.dimensions) {
        config.outputDimensionality = options.dimensions;
      }

      const result = await this.client.models.embedContent({
        model,
        contents: [imageData],
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      return {
        embeddings: result.embeddings?.[0]?.values
          ? [result.embeddings[0].values]
          : [],
        model,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Generate an image from a text prompt using Imagen 3
   * @param prompt - Text description of the image to generate
   * @param options - Optional configuration for image generation
   * @returns Promise resolving to generated image(s)
   *
   * @example
   * ```typescript
   * const result = await provider.generateImage('A sunset over mountains');
   * fs.writeFileSync('image.png', result.images[0].data);
   * ```
   */
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions = {},
  ): Promise<ImageGenerationResponse> {
    let controls: PreparedRequestControls | undefined;
    try {
      await this.ensureClient();

      const model = options.model || 'imagen-3.0-generate-002';
      options = normalizeImageGenerationOptions(
        this.options,
        options,
        'gemini',
        model,
      );
      controls = prepareRequestControls(this.options, options);

      const config: Record<string, any> = {
        numberOfImages: options.n,
        abortSignal: controls.signal,
        httpOptions: {
          timeout: controls.timeout,
          retryOptions: { attempts: (this.options.maxRetries || 0) + 1 },
        },
      };

      if (options.aspectRatio) {
        config.aspectRatio = options.aspectRatio;
      }

      const response = await this.client.models.generateImages({
        model,
        prompt,
        config,
      });

      const images = (response.generatedImages || []).map((img: any) => {
        let data: Buffer | string;
        const mimeType = 'image/png';
        const imageBytes = img.image?.imageBytes;

        if (options.outputFormat === 'base64') {
          data =
            typeof imageBytes === 'string'
              ? imageBytes
              : Buffer.from(imageBytes).toString('base64');
        } else if (options.outputFormat === 'url') {
          // Gemini Imagen doesn't provide URLs, return as base64 data URL
          const b64 =
            typeof imageBytes === 'string'
              ? imageBytes
              : Buffer.from(imageBytes).toString('base64');
          data = `data:${mimeType};base64,${b64}`;
        } else {
          // Default: buffer
          data =
            typeof imageBytes === 'string'
              ? Buffer.from(imageBytes, 'base64')
              : Buffer.from(imageBytes);
        }

        return {
          data,
          mimeType,
        };
      });

      return {
        images,
        model,
      };
    } catch (error) {
      if (controls?.didTimeout()) {
        throw new AIError(
          `AI request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          'gemini',
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          'gemini',
          options.model,
        );
      }
      throw this.mapError(error);
    } finally {
      controls?.cleanup();
    }
  }

  // ============================================================================
  // Video Generation Methods (Veo, via long-running operations)
  // ============================================================================

  /**
   * Submit an asynchronous video-generation job using Veo.
   *
   * Uses the same `@google/genai` client and credentials as {@link generateImage}.
   * Returns a serializable handle immediately; the render itself runs as a
   * long-running operation that callers poll via {@link getVideoGenerationJob}.
   *
   * @param options - Prompt, reference image(s), and generation parameters
   * @returns Promise resolving to a serializable job handle
   *
   * @example
   * ```typescript
   * const job = await provider.submitVideoGenerationJob({
   *   prompt: 'A neon hologram of a cat driving at top speed',
   *   durationSeconds: 8,
   * });
   * ```
   */
  async submitVideoGenerationJob(
    options: VideoGenerationOptions,
  ): Promise<VideoGenerationJob> {
    const startTime = Date.now();
    let controls: PreparedRequestControls | undefined;
    try {
      await this.ensureClient();

      const model = options.model || DEFAULT_VEO_MODEL;
      controls = prepareRequestControls(this.options, options);

      let image:
        | { imageBytes: string; mimeType: string }
        | { gcsUri: string }
        | undefined;
      const firstReference = options.referenceImages?.[0];
      if (firstReference) {
        image = await this.imageToGeminiVideoFormat(
          firstReference.image,
          controls.signal,
        );
      }

      const config = Object.fromEntries(
        Object.entries({
          abortSignal: controls.signal,
          httpOptions: {
            timeout: controls.timeout,
            retryOptions: { attempts: (this.options.maxRetries || 0) + 1 },
          },
          numberOfVideos: 1,
          durationSeconds: options.durationSeconds,
          fps: options.fps,
          seed: options.seed,
          aspectRatio: options.aspectRatio,
          resolution: options.resolution,
          negativePrompt: options.negativePrompt,
        }).filter(([, value]) => value !== undefined),
      );

      const operation = await this.client.models.generateVideos({
        model,
        prompt: options.prompt,
        image,
        config,
      });

      if (!operation.name) {
        throw new AIError(
          'Gemini did not return an operation name for the video-generation job',
          'VIDEO_JOB_SUBMIT_FAILED',
          'gemini',
          model,
        );
      }

      emitUsage(
        this.options,
        'gemini',
        'submitVideoGenerationJob',
        model,
        undefined,
        startTime,
        {
          ...(options.durationSeconds !== undefined
            ? { durationSeconds: String(options.durationSeconds) }
            : {}),
          ...(options.resolution ? { resolution: options.resolution } : {}),
          ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
          ...options.usageTags,
        },
      );

      return {
        jobId: operation.name,
        provider: 'gemini',
        model,
        createdAt: new Date().toISOString(),
        raw: {
          vertexai: Boolean(this.options.projectId && this.options.location),
        },
      };
    } catch (error) {
      if (controls?.didTimeout()) {
        throw new AIError(
          `AI request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          'gemini',
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          'gemini',
          options.model,
        );
      }
      throw this.mapError(error);
    } finally {
      controls?.cleanup();
    }
  }

  /**
   * Build a real `GenerateVideosOperation` instance for polling, and assert
   * the handle is being resumed against a provider configured in the same
   * mode (Google AI Studio vs. Vertex AI) it was submitted in.
   * @private
   */
  private buildVideoOperation(handle: VideoGenerationJob): VideosOperation {
    if (!this.operationCtor) {
      throw new AIError(
        'Gemini client failed to initialize the video-operation constructor. Make sure @google/genai is installed.',
        'INITIALIZATION_ERROR',
        'gemini',
        handle.model,
      );
    }
    this.assertResumeModeMatches(handle);

    const operation = new this.operationCtor();
    operation.name = handle.jobId;
    return operation;
  }

  /**
   * A handle submitted in Vertex AI mode cannot be resumed against a
   * provider configured for Google AI Studio (or vice versa): the SDK
   * routes `operations.getVideosOperation` based on how *this* client was
   * constructed, not how the job was submitted, so a mode mismatch would
   * otherwise surface as a confusing 404 deep in the SDK.
   * @private
   */
  private assertResumeModeMatches(handle: VideoGenerationJob): void {
    const submittedVertexAI = handle.raw?.vertexai;
    if (typeof submittedVertexAI !== 'boolean') {
      // Unknown/legacy handle shape: best effort, let the request proceed.
      return;
    }

    const currentVertexAI = Boolean(
      this.options.projectId && this.options.location,
    );
    if (submittedVertexAI !== currentVertexAI) {
      throw new AIError(
        `Video-generation job ${handle.jobId} was submitted in ${
          submittedVertexAI ? 'Vertex AI' : 'Google AI Studio'
        } mode, but this provider instance is configured for ${
          currentVertexAI ? 'Vertex AI' : 'Google AI Studio'
        } mode. Resume with a provider configured the same way it was submitted.`,
        'VIDEO_JOB_MODE_MISMATCH',
        'gemini',
        handle.model,
      );
    }
  }

  /**
   * Poll the status of a Veo video-generation job.
   *
   * On success, `result` carries the provider's `url` (a `files/*:download`
   * resource the caller cannot fetch directly without this provider's API
   * key) plus `mimeType`, but not `data` — call
   * {@link fetchVideoGenerationResult} to download the bytes.
   *
   * @param handle - The job handle returned by {@link submitVideoGenerationJob}
   * @returns Promise resolving to the current status, and result once succeeded
   */
  async getVideoGenerationJob(
    handle: VideoGenerationJob,
  ): Promise<VideoGenerationStatusResult> {
    try {
      await this.ensureClient();
      const operation = this.buildVideoOperation(handle);
      const updated = await this.client.operations.getVideosOperation({
        operation,
      });
      return this.mapVideoOperation(updated);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Fetch the result of a completed Veo video-generation job, downloading
   * the rendered bytes with this provider's API key (the `uri` Gemini
   * returns is a `files/*:download` resource that requires the same
   * credentials this provider already holds; a bare consumer cannot fetch
   * it directly).
   *
   * @param handle - The job handle returned by {@link submitVideoGenerationJob}
   * @returns Promise resolving to the generated video's bytes and metadata
   * @throws {AIError} When the job has not succeeded yet
   */
  async fetchVideoGenerationResult(
    handle: VideoGenerationJob,
  ): Promise<VideoGenerationResult> {
    try {
      await this.ensureClient();
      const operation = this.buildVideoOperation(handle);
      const updated = await this.client.operations.getVideosOperation({
        operation,
      });
      const status = this.mapVideoOperation(updated);
      if (status.status !== 'succeeded' || !status.result) {
        throw new AIError(
          `Gemini video-generation job ${handle.jobId} has not succeeded (status: ${status.status})`,
          'VIDEO_JOB_NOT_READY',
          'gemini',
          handle.model,
        );
      }

      const video = updated.response?.generatedVideos?.[0]?.video;
      const mimeType = status.result.mimeType;

      if (video?.videoBytes) {
        // Already inline (e.g. Vertex AI bytesBase64Encoded) — no download needed.
        return {
          url: status.result.url,
          data: Buffer.from(video.videoBytes, 'base64'),
          mimeType,
        };
      }

      return {
        url: status.result.url,
        data: await this.downloadGeneratedVideo(video),
        mimeType,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Download a generated video's bytes via `ai.files.download`, which
   * resolves the `files/*:download` resource with this provider's API key
   * (matching Google's own documented usage pattern). The SDK's `download`
   * method only writes to a filesystem path, so this round-trips through a
   * temporary file and reads it back into memory.
   * @private
   */
  private async downloadGeneratedVideo(
    video: { uri?: string; videoBytes?: string; mimeType?: string } | undefined,
  ): Promise<Buffer> {
    if (!video?.uri) {
      throw new AIError(
        'Gemini video-generation job succeeded with no downloadable output',
        'VIDEO_JOB_NOT_READY',
        'gemini',
      );
    }

    const dir = await mkdtemp(join(tmpdir(), 'have-ai-veo-'));
    const filePath = join(dir, 'video.mp4');
    try {
      await this.client.files.download({ file: video, downloadPath: filePath });
      return await readFile(filePath);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Cancel an in-flight Veo video-generation job.
   *
   * **The Gemini API has no cancel endpoint for video-generation
   * operations.** The generativelanguage v1beta discovery document only
   * defines `batches.cancel` (unrelated to video jobs); there is no
   * `models.operations.cancel`. This always throws — cancellation of a
   * Veo render is unsupported by the provider itself, not merely by this
   * client. Callers must treat cancellation as best-effort across all
   * video-generation providers and tolerate this failure (e.g. by simply
   * discarding the handle and not billing for further polling).
   *
   * @param handle - The job handle returned by {@link submitVideoGenerationJob}
   * @throws {AIError} Always — cancellation is unsupported by the Gemini API
   */
  async cancelVideoGenerationJob(handle: VideoGenerationJob): Promise<void> {
    if (this.options.projectId && this.options.location) {
      throw new AIError(
        'Cancelling Gemini video-generation jobs is not implemented for Vertex AI mode by this provider (it requires OAuth credentials this provider does not manage).',
        'NOT_IMPLEMENTED',
        'gemini',
        handle.model,
      );
    }

    throw new AIError(
      'The Gemini API has no cancel endpoint for video-generation operations (only batches.cancel exists, which does not apply to Veo jobs). ' +
        'cancelVideoGenerationJob cannot stop an in-flight Veo render on this provider; treat cancellation as best-effort and stop polling / discard the handle instead.',
      'VIDEO_CANCEL_UNSUPPORTED',
      'gemini',
      handle.model,
    );
  }

  /**
   * Cheap auth-shaped check for Veo access: lists models with a page size
   * of 1. Callers on a hot path must cache the result themselves.
   *
   * @returns Promise resolving to true when access looks valid
   */
  async validateVideoGenerationAccess(): Promise<boolean> {
    try {
      await this.ensureClient();
      await this.client.models.list({ config: { pageSize: 1 } });
      return true;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapVideoOperation(operation: {
    done?: boolean;
    error?: Record<string, unknown>;
    response?: {
      generatedVideos?: Array<{
        video?: { uri?: string; videoBytes?: string; mimeType?: string };
      }>;
    };
  }): VideoGenerationStatusResult {
    if (!operation.done) {
      return { status: 'running' };
    }

    if (operation.error) {
      const errorInfo = operation.error as { code?: number; message?: unknown };
      const message =
        typeof errorInfo.message === 'string'
          ? errorInfo.message
          : JSON.stringify(operation.error);
      // google.rpc.Code.CANCELLED === 1; fall back to a message regex for
      // error shapes that don't carry a structured code.
      const cancelled = errorInfo.code === 1 || /cancel/i.test(message);
      return cancelled
        ? { status: 'cancelled' }
        : { status: 'failed', error: message };
    }

    const video = operation.response?.generatedVideos?.[0]?.video;
    if (!video) {
      return {
        status: 'failed',
        error:
          'Gemini reported the video-generation job as done with no output',
      };
    }

    // Metadata only here — `data` requires a separate authenticated
    // download; see fetchVideoGenerationResult.
    const result: VideoGenerationResult = {
      url: video.uri,
      mimeType: video.mimeType || 'video/mp4',
    };

    return { status: 'succeeded', result };
  }

  async *stream(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<string> {
    const startTime = Date.now();
    let controls: PreparedRequestControls | undefined;
    try {
      await this.ensureClient();

      const model = options.model || this.options.defaultModel;
      options = normalizeChatOptions(this.options, options, 'gemini', model);
      controls = prepareRequestControls(this.options, options);
      const stream = await this.client.models.generateContentStream({
        model,
        contents: this.messagesToGeminiFormat(messages),
        config: this.buildGenerateContentConfig(options, controls),
      });

      let usage: TokenUsage | undefined;

      for await (const chunk of stream) {
        if (chunk.usageMetadata) {
          usage = {
            promptTokens: chunk.usageMetadata.promptTokenCount || 0,
            completionTokens: chunk.usageMetadata.candidatesTokenCount || 0,
            totalTokens: chunk.usageMetadata.totalTokenCount || 0,
          };
        }

        const text = chunk.text || '';
        if (!text) {
          continue;
        }

        if (options.onProgress) {
          options.onProgress(text);
        }
        yield text;
      }

      emitUsage(
        this.options,
        'gemini',
        'stream',
        model!,
        usage,
        startTime,
        options.usageTags,
      );
    } catch (error) {
      if (controls?.didTimeout()) {
        throw new AIError(
          `AI request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          'gemini',
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          'gemini',
          options.model,
        );
      }
      throw this.mapError(error);
    } finally {
      controls?.cleanup();
    }
  }

  async countTokens(text: string): Promise<number> {
    try {
      await this.ensureClient();

      const model = this.options.defaultModel || 'gemini-2.5-flash';
      const response = await this.client.models.countTokens({
        model,
        contents: text,
      });

      return response.totalTokens || Math.ceil(text.length / 4);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getModels(): Promise<AIModel[]> {
    // Return static list of known Gemini models
    return [
      {
        id: 'gemini-3-flash-preview',
        name: 'Gemini 3 Flash Preview',
        description:
          'Preview of Gemini 3 Flash model. Available on Vertex AI in us-central1 only.',
        contextLength: 1000000,
        capabilities: ['text', 'chat', 'vision', 'functions'],
        supportsFunctions: true,
        supportsVision: true,
      },
      {
        id: 'gemini-2.0-flash-001',
        name: 'Gemini 2.0 Flash',
        description:
          'Latest fast and efficient Gemini model with function calling',
        contextLength: 1000000,
        capabilities: ['text', 'chat', 'vision', 'functions'],
        supportsFunctions: true,
        supportsVision: true,
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Experimental next-generation Gemini model',
        contextLength: 1000000,
        capabilities: ['text', 'chat', 'vision', 'functions'],
        supportsFunctions: true,
        supportsVision: true,
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro (Legacy)',
        description: 'Previous generation model (may not be available)',
        contextLength: 2000000,
        capabilities: ['text', 'chat', 'vision', 'functions'],
        supportsFunctions: true,
        supportsVision: true,
      },
    ];
  }

  async getCapabilities(): Promise<AICapabilities> {
    return {
      chat: true,
      completion: true,
      embeddings: true,
      streaming: true,
      functions: true,
      vision: true,
      fineTuning: false,
      imageEmbeddings: true,
      imageGeneration: true,
      videoGeneration: true,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 2000000,
      supportedOperations: [
        'chat',
        'completion',
        'embedding',
        'streaming',
        'functions',
        'vision',
        'image_embedding',
        'image_generation',
        'video_generation',
      ],
    };
  }

  // ============================================================================
  // TTS Methods (Not supported - use Qwen3-TTS provider)
  // ============================================================================

  async synthesizeSpeech(
    _text: string,
    _options?: TTSOptions,
  ): Promise<TTSResponse> {
    throw new AIError(
      'TTS is not supported by Gemini provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'gemini',
    );
  }

  streamSpeech(_text: string, _options?: TTSOptions): AsyncIterable<Buffer> {
    const error = new AIError(
      'TTS streaming is not supported by Gemini provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'gemini',
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async cloneVoice(_options: VoiceCloneOptions): Promise<Voice> {
    throw new AIError(
      'Voice cloning is not supported by Gemini provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'gemini',
    );
  }

  async designVoice(_options: VoiceDesignOptions): Promise<Voice> {
    throw new AIError(
      'Voice design is not supported by Gemini provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'gemini',
    );
  }

  async getVoices(_options?: VoiceListOptions): Promise<Voice[]> {
    throw new AIError(
      'Voice listing is not supported by Gemini provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'gemini',
    );
  }

  private mapToolChoice(
    toolChoice?:
      | 'auto'
      | 'none'
      | { type: 'function'; function: { name: string } },
  ): any {
    if (!toolChoice || toolChoice === 'auto') {
      return { functionCallingConfig: { mode: 'AUTO' } };
    }

    if (toolChoice === 'none') {
      return { functionCallingConfig: { mode: 'NONE' } };
    }

    if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
      return {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: [toolChoice.function.name],
        },
      };
    }

    return { functionCallingConfig: { mode: 'AUTO' } };
  }

  private buildGenerateContentConfig(
    options: ChatOptions,
    controls: PreparedRequestControls,
  ): Record<string, any> {
    const config: Record<string, any> = {
      abortSignal: controls.signal,
      httpOptions: {
        timeout: controls.timeout,
        retryOptions: { attempts: (this.options.maxRetries || 0) + 1 },
      },
      maxOutputTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      stopSequences: Array.isArray(options.stop)
        ? options.stop
        : options.stop
          ? [options.stop]
          : undefined,
      responseMimeType:
        options.responseFormat?.type === 'json_object'
          ? 'application/json'
          : undefined,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
      seed: options.seed,
    };

    if (options.tools && options.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: options.tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description || '',
            parameters: tool.function.parameters || { type: 'object' },
          })),
        },
      ];
      config.toolConfig = this.mapToolChoice(options.toolChoice);
    }

    const reasoning = options.reasoning;
    if (reasoning?.maxTokens !== undefined && reasoning.maxTokens > 0) {
      config.thinkingConfig = {
        thinkingBudget: reasoning.maxTokens,
        includeThoughts: reasoning.includeThoughts,
      };
    }

    return Object.fromEntries(
      Object.entries(config).filter(([, value]) => value !== undefined),
    );
  }

  private mapFinishReason(response: any): AIResponse['finishReason'] {
    // Check if response has function calls in any candidate
    const firstCandidate = response.candidates?.[0];
    if (firstCandidate?.content?.parts) {
      const hasFunctionCall = firstCandidate.content.parts.some(
        (part: any) => part.functionCall,
      );
      if (hasFunctionCall) {
        return 'tool_calls';
      }
    }

    // Gemini doesn't provide detailed finish reasons, default to 'stop'
    return 'stop';
  }

  private messagesToGeminiFormat(messages: AIMessage[]): string {
    // Convert messages to a simple text prompt
    // The new SDK expects a string for the contents field
    return messages
      .map((message) => {
        const textContent = extractTextContent(message.content);
        switch (message.role) {
          case 'system':
            return `Instructions: ${textContent}`;
          case 'user':
            return `Human: ${textContent}`;
          case 'assistant':
            return `Assistant: ${textContent}`;
          default:
            return textContent;
        }
      })
      .join('\n\n');
  }

  private stripMarkdownCodeBlock(text: string): string {
    // Remove markdown code blocks like ```json\n...\n```
    const codeBlockRegex =
      /^```(?:json|javascript|typescript)?\s*\n?([\s\S]*?)\n?```\s*$/;
    const match = text.match(codeBlockRegex);
    return match ? match[1].trim() : text.trim();
  }

  private mapError(error: unknown): AIError {
    if (error instanceof AIError) {
      return error;
    }

    // Map common Gemini error patterns
    const message =
      error instanceof Error ? error.message : 'Unknown Gemini error occurred';

    if (message.includes('API_KEY_INVALID') || message.includes('401')) {
      return new AuthenticationError('gemini');
    }

    if (message.includes('QUOTA_EXCEEDED') || message.includes('429')) {
      return new RateLimitError('gemini', extractRetryAfterSeconds(error));
    }

    if (message.includes('MODEL_NOT_FOUND') || message.includes('404')) {
      return new ModelNotFoundError(message, 'gemini');
    }

    return new AIError(message, 'UNKNOWN_ERROR', 'gemini');
  }
}
