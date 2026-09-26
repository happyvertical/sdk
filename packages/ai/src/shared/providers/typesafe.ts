/**
 * TypeSafe System One typed-decision provider.
 *
 * The public SDK contract deliberately calls TypeSafe's `noul` primitive a
 * `predicate`; vendor terminology stays confined to this wire translation.
 */

import { ValidationError } from '@happyvertical/utils';

import { extractRetryAfterSeconds } from '../rate-limit';
import { normalizeBaseAIOptions, prepareRequestControls } from '../safety';
import type {
  AICapabilities,
  AIInterface,
  AIMessage,
  AIModel,
  AIResponse,
  ChatOptions,
  ChoiceDecisionQuestion,
  CompletionOptions,
  DecisionAnswer,
  DecisionOptions,
  DecisionQuestion,
  DecisionRequest,
  DecisionResult,
  DecisionValue,
  EmbeddingOptions,
  EmbeddingResponse,
  ImageDescriptionOptions,
  ImageEmbeddingOptions,
  ImageGenerationOptions,
  ImageGenerationResponse,
  MessageOptions,
  ScoreDecisionQuestion,
  TTSOptions,
  TTSResponse,
  TypeSafeOptions,
  VideoGenerationJob,
  VideoGenerationOptions,
  VideoGenerationResult,
  VideoGenerationStatusResult,
  Voice,
  VoiceCloneOptions,
  VoiceDesignOptions,
  VoiceListOptions,
} from '../types';
import { AIError, AuthenticationError, RateLimitError } from '../types';
import { emitUsage } from './usage';

const PROVIDER = 'typesafe';
const DEFAULT_BASE_URL = 'https://api.typesafe.ai/v1';
const DEFAULT_MODEL = 'jev-latest';

type WireQuestion =
  | {
      type: 'noul';
      instructions: DecisionValue;
      criteria?: Record<string, DecisionValue>;
    }
  | {
      type: 'choice';
      instructions: DecisionValue;
      criteria: Record<string, DecisionValue | null>;
    }
  | { type: 'score'; instructions: DecisionValue; criteria: DecisionValue[] };

interface WireResponse {
  model?: unknown;
  answers?: unknown;
  usage?: { input_tokens?: unknown; output_tokens?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AIError(
      `TypeSafe response ${field} must be finite`,
      'INVALID_RESPONSE',
      PROVIDER,
    );
  }
  return value;
}

function probability(value: unknown, field: string): number {
  const result = finite(value, field);
  if (result < 0 || result > 1) {
    throw new AIError(
      `TypeSafe response ${field} must be between 0 and 1`,
      'INVALID_RESPONSE',
      PROVIDER,
    );
  }
  return result;
}

function tokenCount(value: unknown, field: string): number {
  const result = finite(value, field);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new AIError(
      `TypeSafe response ${field} must be a non-negative integer`,
      'INVALID_RESPONSE',
      PROVIDER,
    );
  }
  return result;
}

function validateValue(
  value: unknown,
  field: string,
): asserts value is DecisionValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new ValidationError(`${field} must contain finite numbers`, {
        provider: PROVIDER,
      });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateValue(item, `${field}[${index}]`);
    });
    return;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, item]) => {
      validateValue(item, `${field}.${key}`);
    });
    return;
  }
  throw new ValidationError(`${field} must be JSON-compatible`, {
    provider: PROVIDER,
  });
}

function validateRequest(request: DecisionRequest): void {
  validateValue(request.state, 'state');
  const entries = Object.entries(request.questions || {});
  if (entries.length === 0)
    throw new ValidationError('questions must not be empty', {
      provider: PROVIDER,
    });
  for (const [id, question] of entries) {
    if (!id.trim())
      throw new ValidationError('question IDs must not be empty', {
        provider: PROVIDER,
      });
    validateValue(question.instructions, `questions.${id}.instructions`);
    if (question.type === 'predicate') {
      if (question.criteria) {
        for (const [key, value] of Object.entries(question.criteria))
          validateValue(value, `questions.${id}.criteria.${key}`);
      }
    } else if (question.type === 'choice') {
      const options = Object.keys(question.criteria || {});
      if (options.length === 0 || options.length > 255)
        throw new ValidationError(
          `questions.${id}.criteria must contain 1 to 255 options`,
          { provider: PROVIDER },
        );
      for (const [key, value] of Object.entries(question.criteria))
        if (value !== null)
          validateValue(value, `questions.${id}.criteria.${key}`);
    } else if (question.type === 'score') {
      if (question.criteria.length < 2 || question.criteria.length > 10)
        throw new ValidationError(
          `questions.${id}.criteria must contain 2 to 10 ordered levels`,
          { provider: PROVIDER },
        );
      question.criteria.forEach((value, index) => {
        validateValue(value, `questions.${id}.criteria[${index}]`);
      });
    } else {
      throw new ValidationError(`questions.${id}.type is unsupported`, {
        provider: PROVIDER,
      });
    }
  }
}

function wireQuestion(question: DecisionQuestion): WireQuestion {
  if (question.type === 'predicate')
    return {
      type: 'noul',
      instructions: question.instructions,
      ...(question.criteria ? { criteria: question.criteria } : {}),
    };
  return question;
}

function distribution(
  value: unknown,
  expected: string[],
  field: string,
): Record<string, number> {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !(key in value))
  ) {
    throw new AIError(
      `TypeSafe response ${field} must cover exactly the requested values`,
      'INVALID_RESPONSE',
      PROVIDER,
    );
  }
  const result = Object.fromEntries(
    expected.map((key) => [key, probability(value[key], `${field}.${key}`)]),
  );
  const sum = Object.values(result).reduce((total, item) => total + item, 0);
  if (Math.abs(sum - 1) > 1e-6)
    throw new AIError(
      `TypeSafe response ${field} must sum to 1`,
      'INVALID_RESPONSE',
      PROVIDER,
    );
  return result;
}

function answer(
  question: DecisionQuestion,
  raw: unknown,
  id: string,
): DecisionAnswer {
  if (!isRecord(raw))
    throw new AIError(
      `TypeSafe response answers.${id} must be an object`,
      'INVALID_RESPONSE',
      PROVIDER,
    );
  if (question.type === 'predicate') {
    if (raw.type !== 'noul')
      throw new AIError(
        `TypeSafe response answers.${id} type does not match predicate`,
        'INVALID_RESPONSE',
        PROVIDER,
      );
    return {
      type: 'predicate',
      probability: probability(raw.noul, `answers.${id}.noul`),
    };
  }
  if (raw.type !== question.type)
    throw new AIError(
      `TypeSafe response answers.${id} type does not match request`,
      'INVALID_RESPONSE',
      PROVIDER,
    );
  if (question.type === 'choice') {
    const choices = Object.keys(question.criteria);
    if (typeof raw.choice !== 'string' || !choices.includes(raw.choice))
      throw new AIError(
        `TypeSafe response answers.${id}.choice is not a requested option`,
        'INVALID_RESPONSE',
        PROVIDER,
      );
    return {
      type: 'choice',
      choice: raw.choice,
      probabilities: distribution(
        raw.probabilities,
        choices,
        `answers.${id}.probabilities`,
      ),
      confidence: probability(raw.confidence, `answers.${id}.confidence`),
    };
  }
  const scoreQuestion = question as ScoreDecisionQuestion;
  const levels = scoreQuestion.criteria;
  const levelKeys = levels.map((_, index) => String(index));
  const score = finite(raw.score, `answers.${id}.score`);
  if (score < 0 || score > levels.length - 1)
    throw new AIError(
      `TypeSafe response answers.${id}.score is outside the requested rubric`,
      'INVALID_RESPONSE',
      PROVIDER,
    );
  const legend = raw.legend;
  if (
    !isRecord(legend) ||
    levelKeys.some((key, index) => legend[key] !== levels[index])
  )
    throw new AIError(
      `TypeSafe response answers.${id}.legend does not match the requested rubric`,
      'INVALID_RESPONSE',
      PROVIDER,
    );
  return {
    type: 'score',
    score,
    probabilities: distribution(
      raw.probabilities,
      levelKeys,
      `answers.${id}.probabilities`,
    ),
    confidence: probability(raw.confidence, `answers.${id}.confidence`),
    levels,
  };
}

/** A decision-only adapter for TypeSafe's System One endpoint. */
export class TypeSafeProvider implements AIInterface {
  private readonly options: TypeSafeOptions;

  constructor(options: TypeSafeOptions) {
    this.options = normalizeBaseAIOptions({
      ...options,
      baseUrl: (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    });
  }

  async decide(
    request: DecisionRequest,
    options: DecisionOptions = {},
  ): Promise<DecisionResult> {
    validateRequest(request);
    const apiKey = this.options.apiKey;
    if (!apiKey) throw new AuthenticationError(PROVIDER);
    const controls = prepareRequestControls(this.options, options);
    const startedAt = Date.now();
    const model = options.model || this.options.defaultModel || DEFAULT_MODEL;
    try {
      const response = await fetch(`${this.options.baseUrl}/systemone`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...this.options.headers,
        },
        body: JSON.stringify({
          state: request.state,
          model,
          questions: Object.fromEntries(
            Object.entries(request.questions).map(([id, question]) => [
              id,
              wireQuestion(question),
            ]),
          ),
        }),
        signal: controls.signal,
      });
      if (!response.ok) {
        if (response.status === 401) throw new AuthenticationError(PROVIDER);
        if (response.status === 429 || response.status === 529)
          throw new RateLimitError(
            PROVIDER,
            extractRetryAfterSeconds(response.headers),
          );
        const text = await response.text();
        throw new AIError(
          `TypeSafe request failed (${response.status}): ${text.slice(0, 500)}`,
          'API_ERROR',
          PROVIDER,
          model,
          response.status >= 500,
        );
      }
      const body = (await response.json()) as WireResponse;
      if (!body || typeof body.model !== 'string' || !body.model)
        throw new AIError(
          'TypeSafe response model is required',
          'INVALID_RESPONSE',
          PROVIDER,
        );
      if (!isRecord(body.answers))
        throw new AIError(
          'TypeSafe response answers is required',
          'INVALID_RESPONSE',
          PROVIDER,
        );
      const responseAnswers = body.answers;
      const ids = Object.keys(request.questions);
      if (
        Object.keys(responseAnswers).length !== ids.length ||
        ids.some((id) => !(id in responseAnswers))
      )
        throw new AIError(
          'TypeSafe response answers must match requested question IDs',
          'INVALID_RESPONSE',
          PROVIDER,
        );
      const answers = Object.fromEntries(
        ids.map((id) => [
          id,
          answer(request.questions[id], responseAnswers[id], id),
        ]),
      );
      const input = body.usage?.input_tokens;
      const output = body.usage?.output_tokens;
      const usage =
        input === undefined && output === undefined
          ? undefined
          : {
              promptTokens: tokenCount(input, 'usage.input_tokens'),
              completionTokens: tokenCount(output, 'usage.output_tokens'),
              totalTokens:
                tokenCount(input, 'usage.input_tokens') +
                tokenCount(output, 'usage.output_tokens'),
            };
      emitUsage(
        this.options,
        PROVIDER,
        'decide',
        body.model,
        usage,
        startedAt,
        options.usageTags,
      );
      return {
        model: body.model,
        ...(usage ? { usage } : {}),
        provenance: { provider: PROVIDER, model: body.model },
        answers,
      };
    } catch (error) {
      if (controls.didTimeout())
        throw new AIError(
          `TypeSafe request timed out after ${controls.timeout}ms`,
          'REQUEST_TIMEOUT',
          PROVIDER,
          model,
          true,
        );
      if (controls.signal.aborted && !(error instanceof AIError))
        throw new AIError(
          'TypeSafe request was aborted',
          'REQUEST_ABORTED',
          PROVIDER,
          model,
        );
      throw error;
    } finally {
      controls.cleanup();
    }
  }

  async getModels(): Promise<AIModel[]> {
    return [
      {
        id: this.options.defaultModel || DEFAULT_MODEL,
        name: 'TypeSafe Jev',
        description: 'TypeSafe System One typed decisions',
        contextLength: 0,
        capabilities: ['decisions'],
        supportsFunctions: false,
        supportsVision: false,
      },
    ];
  }
  async getCapabilities(): Promise<AICapabilities> {
    return {
      decisions: true,
      chat: false,
      completion: false,
      embeddings: false,
      streaming: false,
      functions: false,
      vision: false,
      fineTuning: false,
      imageEmbeddings: false,
      imageGeneration: false,
      videoGeneration: false,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 0,
      supportedOperations: ['decide'],
    };
  }
  private unsupported(): never {
    throw new AIError(
      'This operation is not supported by the TypeSafe decision-only provider.',
      'NOT_IMPLEMENTED',
      PROVIDER,
    );
  }
  async chat(_a: AIMessage[], _b?: ChatOptions): Promise<AIResponse> {
    return this.unsupported();
  }
  async complete(_a: string, _b?: CompletionOptions): Promise<AIResponse> {
    return this.unsupported();
  }
  async message(_a: string, _b?: MessageOptions): Promise<string> {
    return this.unsupported();
  }
  async embed(
    _a: string | string[],
    _b?: EmbeddingOptions,
  ): Promise<EmbeddingResponse> {
    return this.unsupported();
  }
  async embedImage(
    _a: string | Buffer,
    _b?: ImageEmbeddingOptions,
  ): Promise<EmbeddingResponse> {
    return this.unsupported();
  }
  async describeImage(
    _a: string | Buffer,
    _b?: string,
    _c?: ImageDescriptionOptions,
  ): Promise<string> {
    return this.unsupported();
  }
  async generateImage(
    _a: string,
    _b?: ImageGenerationOptions,
  ): Promise<ImageGenerationResponse> {
    return this.unsupported();
  }
  stream(_a: AIMessage[], _b?: ChatOptions): AsyncIterable<string> {
    const error = new AIError(
      'Chat streaming is not supported by the TypeSafe decision-only provider.',
      'NOT_IMPLEMENTED',
      PROVIDER,
    );
    return {
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
    };
  }
  async countTokens(_a: string): Promise<number> {
    return this.unsupported();
  }
  async submitVideoGenerationJob(
    _a: VideoGenerationOptions,
  ): Promise<VideoGenerationJob> {
    return this.unsupported();
  }
  async getVideoGenerationJob(
    _a: VideoGenerationJob,
  ): Promise<VideoGenerationStatusResult> {
    return this.unsupported();
  }
  async fetchVideoGenerationResult(
    _a: VideoGenerationJob,
  ): Promise<VideoGenerationResult> {
    return this.unsupported();
  }
  async cancelVideoGenerationJob(_a: VideoGenerationJob): Promise<void> {
    return this.unsupported();
  }
  async validateVideoGenerationAccess(): Promise<boolean> {
    return this.unsupported();
  }
  async synthesizeSpeech(_a: string, _b?: TTSOptions): Promise<TTSResponse> {
    return this.unsupported();
  }
  streamSpeech(_a: string, _b?: TTSOptions): AsyncIterable<Buffer> {
    const error = new AIError(
      'TTS streaming is not supported by the TypeSafe decision-only provider.',
      'NOT_IMPLEMENTED',
      PROVIDER,
    );
    return {
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
    };
  }
  async cloneVoice(_a: VoiceCloneOptions): Promise<Voice> {
    return this.unsupported();
  }
  async designVoice(_a: VoiceDesignOptions): Promise<Voice> {
    return this.unsupported();
  }
  async getVoices(_a?: VoiceListOptions): Promise<Voice[]> {
    return this.unsupported();
  }
}
