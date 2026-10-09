/**
 * Laya typed-decision provider.
 *
 * Laya (https://github.com/NandhaKishorM/laya) is a self-hosted,
 * non-autoregressive decision engine. Its `laya-serve` HTTP server answers the
 * Jev `POST /v1/systemone` wire shape, with differences this adapter handles
 * itself rather than inheriting from the TypeSafe adapter: optional auth, a
 * checkpoint chosen by the server's router, a `max_len` token window,
 * probabilities rounded to four decimals one at a time, and truncation facts.
 *
 * The public SDK contract calls Laya's `noul` primitive a `predicate`; the
 * server's vocabulary stays confined to this wire translation.
 */

import { ValidationError } from '@happyvertical/utils';

import { rateLimitErrorFrom } from '../rate-limit';
import { normalizeBaseAIOptions, prepareRequestControls } from '../safety';
import type {
  AICapabilities,
  AIInterface,
  AIMessage,
  AIModel,
  AIResponse,
  ChatOptions,
  CompletionOptions,
  DecisionAnswer,
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
  LayaDecisionOptions,
  LayaOptions,
  MessageOptions,
  ScoreDecisionQuestion,
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
import { AIError, AuthenticationError } from '../types';
import { emitUsage } from './usage';

const PROVIDER = 'laya';

/** Distributions this close to unit mass are used exactly as received. */
const STRICT_DISTRIBUTION_EPSILON = 1e-6;
/**
 * `laya-serve` rounds every probability to four decimals on its own, so each
 * value is off by at most half of the last place and a distribution of `n`
 * values can be off by `n * 0.00005`.
 */
const ROUNDING_ERROR_PER_VALUE = 5e-5;
/** No rounding story justifies renormalizing a distribution further out. */
const MAX_NORMALIZED_ERROR = 0.01;

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

interface WireRequest {
  state: DecisionValue;
  questions: Record<string, WireQuestion>;
  model?: string;
  max_len?: number;
}

interface WireResponse {
  model?: unknown;
  answers?: unknown;
  usage?: unknown;
  routing?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalid(message: string): AIError {
  return new AIError(`Laya response ${message}`, 'INVALID_RESPONSE', PROVIDER);
}

function finite(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw invalid(`${field} must be finite`);
  return value;
}

function probability(value: unknown, field: string): number {
  const result = finite(value, field);
  if (result < 0 || result > 1)
    throw invalid(`${field} must be between 0 and 1`);
  return result;
}

function tokenCount(value: unknown, field: string): number {
  const result = finite(value, field);
  if (!Number.isSafeInteger(result) || result < 0)
    throw invalid(`${field} must be a non-negative integer`);
  return result;
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
  field: string,
): string | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value)
    throw invalid(`${field} must be a non-empty string`);
  return value;
}

function sameDecisionValue(left: DecisionValue, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left)) {
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameDecisionValue(value, right[index]))
    );
  }
  if (isRecord(left)) {
    return (
      isRecord(right) &&
      Object.keys(left).length === Object.keys(right).length &&
      Object.entries(left).every(
        ([key, value]) => key in right && sameDecisionValue(value, right[key]),
      )
    );
  }
  return false;
}

/**
 * `laya-serve` returns a rubric level in `legend` as sent when it is a string
 * and as Python's `json.dumps` text when it is anything else.
 */
function legendMatches(level: DecisionValue, legend: unknown): boolean {
  if (sameDecisionValue(level, legend)) return true;
  if (typeof level === 'string' || typeof legend !== 'string') return false;
  try {
    return sameDecisionValue(level, JSON.parse(legend));
  } catch {
    return false;
  }
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

function validateMaxLen(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new ValidationError(`${field} must be a positive integer`, {
      provider: PROVIDER,
    });
  return value;
}

/**
 * Checks the provider-neutral request shape. Laya's own size limits (questions
 * per request, options per question, state length) are left to the server,
 * which reports them as explicit 413 errors.
 */
function validateRequest(request: DecisionRequest): void {
  if (request.state === null || request.state === undefined)
    throw new ValidationError('state is required', { provider: PROVIDER });
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
      if (options.length === 0)
        throw new ValidationError(
          `questions.${id}.criteria must contain at least one option`,
          { provider: PROVIDER },
        );
      for (const [key, value] of Object.entries(question.criteria))
        if (value !== null)
          validateValue(value, `questions.${id}.criteria.${key}`);
    } else if (question.type === 'score') {
      if (!Array.isArray(question.criteria) || question.criteria.length < 2)
        throw new ValidationError(
          `questions.${id}.criteria must contain at least 2 ordered levels`,
          { provider: PROVIDER },
        );
      question.criteria.forEach((value, index) => {
        // Laya rejects a null level because its legend entry would be null.
        if (value === null)
          throw new ValidationError(
            `questions.${id}.criteria[${index}] must describe the level`,
            { provider: PROVIDER },
          );
        validateValue(value, `questions.${id}.criteria[${index}]`);
      });
    } else {
      throw new ValidationError(`questions.${id}.type is unsupported`, {
        provider: PROVIDER,
      });
    }
  }
}

/**
 * Builds each wire question field by field so unknown properties on a caller's
 * object (for example a generation control) are never forwarded.
 */
function wireQuestion(question: DecisionQuestion): WireQuestion {
  if (question.type === 'predicate')
    return {
      type: 'noul',
      instructions: question.instructions,
      ...(question.criteria ? { criteria: question.criteria } : {}),
    };
  if (question.type === 'choice')
    return {
      type: 'choice',
      instructions: question.instructions,
      criteria: question.criteria,
    };
  return {
    type: 'score',
    instructions: question.instructions,
    criteria: question.criteria,
  };
}

/** Resolves the server root from a base URL that may carry the API path. */
function serverRoot(value: string | undefined): string {
  const text = (value || '').trim();
  if (!text)
    throw new ValidationError(
      'Laya requires baseUrl, for example http://localhost:8000',
      { provider: PROVIDER },
    );
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new ValidationError('Laya baseUrl must be an absolute http(s) URL', {
      provider: PROVIDER,
    });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new ValidationError('Laya baseUrl must be an absolute http(s) URL', {
      provider: PROVIDER,
    });
  if (url.search || url.hash || url.username || url.password)
    throw new ValidationError(
      'Laya baseUrl must not contain credentials, a query, or a fragment',
      { provider: PROVIDER },
    );
  const path = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/v1(\/systemone)?$/, '');
  return `${url.origin}${path}`;
}

interface Distribution {
  values: Record<string, number>;
  /** The values as received, set only when they were renormalized. */
  raw?: Record<string, number>;
}

/**
 * Validates a choice or score distribution. Mass within the four-decimal
 * rounding bound is normalized by its actual sum; anything else is rejected.
 */
function distribution(
  value: unknown,
  expected: string[],
  field: string,
): Distribution {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !(key in value))
  )
    throw invalid(`${field} must cover exactly the requested values`);
  const values = Object.fromEntries(
    expected.map((key) => [key, probability(value[key], `${field}.${key}`)]),
  );
  const sum = Object.values(values).reduce((total, item) => total + item, 0);
  const drift = Math.abs(sum - 1);
  if (drift <= STRICT_DISTRIBUTION_EPSILON) return { values };
  const allowed =
    Math.min(expected.length * ROUNDING_ERROR_PER_VALUE, MAX_NORMALIZED_ERROR) +
    STRICT_DISTRIBUTION_EPSILON;
  if (sum <= 0 || drift > allowed) throw invalid(`${field} must sum to 1`);
  return {
    values: Object.fromEntries(
      Object.entries(values).map(([key, item]) => [key, item / sum]),
    ),
    raw: values,
  };
}

function answer(
  question: DecisionQuestion,
  raw: unknown,
  id: string,
  renormalized: Record<string, Record<string, number>>,
): DecisionAnswer {
  if (!isRecord(raw)) throw invalid(`answers.${id} must be an object`);
  if (question.type === 'predicate') {
    if (raw.type !== 'noul')
      throw invalid(`answers.${id} type does not match predicate`);
    return {
      type: 'predicate',
      probability: probability(raw.noul, `answers.${id}.noul`),
    };
  }
  if (raw.type !== question.type)
    throw invalid(`answers.${id} type does not match request`);
  if (question.type === 'choice') {
    const choices = Object.keys(question.criteria);
    if (typeof raw.choice !== 'string' || !choices.includes(raw.choice))
      throw invalid(`answers.${id}.choice is not a requested option`);
    const probabilities = distribution(
      raw.probabilities,
      choices,
      `answers.${id}.probabilities`,
    );
    if (probabilities.raw) renormalized[id] = probabilities.raw;
    return {
      type: 'choice',
      choice: raw.choice,
      probabilities: probabilities.values,
      confidence: probability(raw.confidence, `answers.${id}.confidence`),
    };
  }
  const levels = (question as ScoreDecisionQuestion).criteria;
  const levelKeys = levels.map((_, index) => String(index));
  const score = finite(raw.score, `answers.${id}.score`);
  if (score < 0 || score > levels.length - 1)
    throw invalid(`answers.${id}.score is outside the requested rubric`);
  const legend = raw.legend;
  if (
    !isRecord(legend) ||
    levelKeys.some((key, index) => !legendMatches(levels[index], legend[key]))
  )
    throw invalid(`answers.${id}.legend does not match the requested rubric`);
  const probabilities = distribution(
    raw.probabilities,
    levelKeys,
    `answers.${id}.probabilities`,
  );
  if (probabilities.raw) renormalized[id] = probabilities.raw;
  return {
    type: 'score',
    score,
    probabilities: probabilities.values,
    confidence: probability(raw.confidence, `answers.${id}.confidence`),
    levels,
  };
}

/** A decision-only adapter for a `laya-serve` `/v1/systemone` endpoint. */
export class LayaProvider implements AIInterface {
  private readonly options: LayaOptions;
  private readonly root: string;
  private readonly maxLen?: number;

  constructor(options: LayaOptions) {
    this.root = serverRoot(options.baseUrl);
    this.maxLen = validateMaxLen(options.maxLen, 'maxLen');
    this.options = normalizeBaseAIOptions({ ...options, baseUrl: this.root });
  }

  async decide(
    request: DecisionRequest,
    options: LayaDecisionOptions = {},
  ): Promise<DecisionResult> {
    validateRequest(request);
    const maxLen = validateMaxLen(options.maxLen, 'maxLen') ?? this.maxLen;
    const controls = prepareRequestControls(this.options, options);
    const startedAt = Date.now();
    const requestedModel =
      options.model || this.options.defaultModel || undefined;
    const wire: WireRequest = {
      state: request.state,
      questions: Object.fromEntries(
        Object.entries(request.questions).map(([id, question]) => [
          id,
          wireQuestion(question),
        ]),
      ),
      ...(requestedModel ? { model: requestedModel } : {}),
      ...(maxLen !== undefined ? { max_len: maxLen } : {}),
    };
    try {
      const response = await fetch(`${this.root}/v1/systemone`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          ...(this.options.apiKey
            ? { Authorization: `Bearer ${this.options.apiKey}` }
            : {}),
          'Content-Type': 'application/json',
          ...this.options.headers,
        },
        body: JSON.stringify(wire),
        signal: controls.signal,
      });
      if (!response.ok) {
        if (response.status === 401) throw new AuthenticationError(PROVIDER);
        const text = await response.text();
        // 503 is laya-serve's admission limit (LAYA_MAX_CONCURRENT), which
        // sends Retry-After; 429 covers a rate-limiting proxy in front of it.
        if (response.status === 429 || response.status === 503)
          throw rateLimitErrorFrom(
            PROVIDER,
            { headers: response.headers, message: text },
            { model: requestedModel },
          );
        throw new AIError(
          `Laya request failed (${response.status}): ${text.slice(0, 500)}`,
          'API_ERROR',
          PROVIDER,
          requestedModel,
          response.status >= 500,
        );
      }
      let body: WireResponse;
      try {
        body = (await response.json()) as WireResponse;
      } catch (error) {
        if (error instanceof SyntaxError)
          throw new AIError(
            'Laya response contained invalid JSON',
            'INVALID_RESPONSE',
            PROVIDER,
            requestedModel,
          );
        throw error;
      }
      return this.result(
        request,
        body,
        requestedModel,
        maxLen,
        options,
        startedAt,
      );
    } catch (error) {
      if (controls.didTimeout())
        throw new AIError(
          `Laya request timed out after ${controls.timeout}ms`,
          'REQUEST_TIMEOUT',
          PROVIDER,
          requestedModel,
          true,
        );
      if (controls.signal.aborted && !(error instanceof AIError))
        throw new AIError(
          'Laya request was aborted',
          'REQUEST_ABORTED',
          PROVIDER,
          requestedModel,
        );
      if (!(error instanceof AIError)) {
        throw new AIError(
          `Network error calling Laya: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'NETWORK_ERROR',
          PROVIDER,
          requestedModel,
          true,
        );
      }
      throw error;
    } finally {
      controls.cleanup();
    }
  }

  private result(
    request: DecisionRequest,
    body: WireResponse,
    requestedModel: string | undefined,
    maxLen: number | undefined,
    options: LayaDecisionOptions,
    startedAt: number,
  ): DecisionResult {
    if (!isRecord(body)) throw invalid('must be an object');
    // The root `model` names Laya's decision head, not the checkpoint.
    if (typeof body.model !== 'string' || !body.model)
      throw invalid('model is required');
    if (!isRecord(body.answers)) throw invalid('answers is required');
    const responseAnswers = body.answers;
    const ids = Object.keys(request.questions);
    if (
      Object.keys(responseAnswers).length !== ids.length ||
      ids.some((id) => !(id in responseAnswers))
    )
      throw invalid('answers must match requested question IDs');
    const renormalized: Record<string, Record<string, number>> = {};
    const answers = Object.fromEntries(
      ids.map((id) => [
        id,
        answer(request.questions[id], responseAnswers[id], id, renormalized),
      ]),
    );

    let usage:
      | { promptTokens: number; completionTokens: number; totalTokens: number }
      | undefined;
    const facts: Record<string, DecisionValue> = {};
    if (body.usage !== undefined) {
      const wireUsage = body.usage;
      if (
        !isRecord(wireUsage) ||
        !('input_tokens' in wireUsage) ||
        !('output_tokens' in wireUsage)
      )
        throw invalid('usage must include input_tokens and output_tokens');
      const input = tokenCount(wireUsage.input_tokens, 'usage.input_tokens');
      const output = tokenCount(wireUsage.output_tokens, 'usage.output_tokens');
      usage = {
        promptTokens: input,
        completionTokens: output,
        totalTokens: input + output,
      };
      // Truncation is invisible anywhere else in the response.
      for (const [key, name] of [
        ['state_tokens', 'stateTokens'],
        ['state_tokens_dropped', 'stateTokensDropped'],
      ] as const)
        if (wireUsage[key] !== undefined)
          facts[name] = tokenCount(wireUsage[key], `usage.${key}`);
      if (wireUsage.truncated !== undefined) {
        if (typeof wireUsage.truncated !== 'boolean')
          throw invalid('usage.truncated must be a boolean');
        facts.truncated = wireUsage.truncated;
      }
      if (wireUsage.truncated_questions !== undefined) {
        const truncated = wireUsage.truncated_questions;
        if (
          !Array.isArray(truncated) ||
          truncated.some((id) => typeof id !== 'string')
        )
          throw invalid('usage.truncated_questions must list question IDs');
        facts.truncatedQuestions = truncated as string[];
      }
    }

    let checkpoint: string | undefined;
    if (body.routing !== undefined) {
      if (!isRecord(body.routing)) throw invalid('routing must be an object');
      checkpoint = optionalString(body.routing, 'model', 'routing.model');
      const repo = optionalString(body.routing, 'repo', 'routing.repo');
      const reason = optionalString(body.routing, 'reason', 'routing.reason');
      if (checkpoint) facts.checkpoint = checkpoint;
      if (repo) facts.checkpointRepo = repo;
      if (reason) facts.routeReason = reason;
    }

    // The checkpoint that answered is reported only in `routing`, which a
    // server running LAYA_JEV_STRICT omits. Without it, report the decision
    // head and leave `details.checkpoint` unset rather than guess.
    const model = checkpoint || body.model;
    const renormalizedIds = Object.keys(renormalized);
    const details: Record<string, DecisionValue> = {
      serverModel: body.model,
      ...(requestedModel ? { requestedModel } : {}),
      ...(maxLen !== undefined ? { maxLen } : {}),
      ...facts,
      ...(renormalizedIds.length
        ? { renormalized: renormalizedIds, rawProbabilities: renormalized }
        : {}),
    };
    emitUsage(
      this.options,
      PROVIDER,
      'decide',
      model,
      usage,
      startedAt,
      options.usageTags,
    );
    return {
      model,
      ...(usage ? { usage } : {}),
      provenance: { provider: PROVIDER, model, details },
      answers,
    };
  }

  async getModels(): Promise<AIModel[]> {
    // laya-serve has no model-listing route; these are the checkpoints of the
    // convaiinnovations/laya bundle. A server may register others.
    const checkpoints: Array<[string, string, number]> = [
      ['typed-decisions', 'Laya typed decisions (421M)', 1024],
      ['english', 'Laya English (421M)', 512],
      ['multilingual', 'Laya multilingual (322M)', 1024],
    ];
    const configured = this.options.defaultModel;
    const models = checkpoints.map(([id, name, contextLength]) => ({
      id,
      name,
      description: 'Laya typed decisions',
      contextLength,
      capabilities: ['decisions'],
      supportsFunctions: false,
      supportsVision: false,
    }));
    if (configured && !models.some((model) => model.id === configured))
      models.push({
        id: configured,
        name: configured,
        description: 'Laya typed decisions (configured checkpoint)',
        contextLength: 0,
        capabilities: ['decisions'],
        supportsFunctions: false,
        supportsVision: false,
      });
    return models;
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
      'This operation is not supported by the Laya decision-only provider.',
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
      'Chat streaming is not supported by the Laya decision-only provider.',
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
      'TTS streaming is not supported by the Laya decision-only provider.',
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
