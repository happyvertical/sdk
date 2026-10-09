import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAIAuto as getNodeAIAuto } from './node/factory';
import { getAI } from './shared/factory';
import { LayaProvider } from './shared/providers/laya';
import { SeevioProvider } from './shared/providers/seevio';
import { TypeSafeProvider } from './shared/providers/typesafe';
import { createRateLimitedAI } from './shared/rate-limit';
import type {
  AICapabilities,
  AIInterface,
  DecisionRequest,
  LayaDecisionOptions,
  LayaOptions,
} from './shared/types';
import { AI_PROVIDER_TYPES } from './shared/types';

const BASE = 'http://laya.test:8000';

const request: DecisionRequest = {
  state: { message: 'Please refund my duplicate charge' },
  questions: {
    refund: {
      type: 'predicate',
      instructions: 'Does `message` request a refund?',
    },
    route: {
      type: 'choice',
      instructions: 'Which team?',
      criteria: { billing: 'Payments', support: 'General help' },
    },
    urgency: {
      type: 'score',
      instructions: 'How urgent?',
      criteria: ['Low', 'Medium', 'High'],
    },
  },
};

function response(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** A full (non-strict) `laya-serve` 0.4.1 payload, as measured on the wire. */
function validResponse() {
  return {
    model: 'laya-rl-agent',
    answers: {
      refund: {
        type: 'noul',
        noul: 0.8881,
        confidence: 0.8881,
        answer_confidence: 0.8881,
        action: { act_probability: 1.0 },
      },
      route: {
        type: 'choice',
        choice: 'billing',
        probabilities: { billing: 0.828, support: 0.172 },
        confidence: 0.3378,
        answer_confidence: 0.828,
        action: { act_probability: 1.0 },
      },
      urgency: {
        type: 'score',
        score: 1.1,
        legend: { 0: 'Low', 1: 'Medium', 2: 'High' },
        probabilities: { 0: 0.2, 1: 0.5, 2: 0.3 },
        confidence: 0.1049,
        answer_confidence: 0.5,
        action: { act_probability: 1.0 },
      },
    },
    usage: {
      input_tokens: 93,
      output_tokens: 0,
      state_tokens: 5,
      state_tokens_dropped: 0,
      truncated: false,
      truncated_questions: [],
    },
    routing: {
      model: 'typed-decisions',
      repo: 'convaiinnovations/laya/typed-decisions',
      reason: "explicit model='typed-decisions'",
      detection: null,
      workflow: null,
    },
  };
}

function withScoreProbabilities(probabilities: Record<string, number>) {
  const body = validResponse();
  body.answers.urgency.probabilities = probabilities as never;
  return body;
}

function provider(options: Partial<LayaOptions> = {}) {
  return new LayaProvider({ type: 'laya', baseUrl: BASE, ...options });
}

function call(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index];
  return {
    url: url as string,
    init,
    body: JSON.parse(init.body as string),
    headers: init.headers as Record<string, string>,
  };
}

/** A fetch that never answers until its signal aborts. */
function hangingFetch() {
  return vi.fn().mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        if (init.signal.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        init.signal.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        );
      }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LayaProvider translation', () => {
  it('translates a mixed batch and preserves checkpoint, usage, distributions, and provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(validResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider().decide(request);

    const sent = call(fetchMock);
    expect(sent.url).toBe(`${BASE}/v1/systemone`);
    expect(sent.init.method).toBe('POST');
    expect(sent.headers).not.toHaveProperty('Authorization');
    expect(sent.body).toEqual({
      state: request.state,
      questions: {
        refund: {
          type: 'noul',
          instructions: 'Does `message` request a refund?',
        },
        route: {
          type: 'choice',
          instructions: 'Which team?',
          criteria: { billing: 'Payments', support: 'General help' },
        },
        urgency: {
          type: 'score',
          instructions: 'How urgent?',
          criteria: ['Low', 'Medium', 'High'],
        },
      },
    });
    expect(result).toMatchObject({
      model: 'typed-decisions',
      usage: { promptTokens: 93, completionTokens: 0, totalTokens: 93 },
      provenance: {
        provider: 'laya',
        model: 'typed-decisions',
        details: {
          serverModel: 'laya-rl-agent',
          checkpoint: 'typed-decisions',
          checkpointRepo: 'convaiinnovations/laya/typed-decisions',
          stateTokens: 5,
          stateTokensDropped: 0,
          truncated: false,
          truncatedQuestions: [],
        },
      },
      answers: {
        refund: { type: 'predicate', probability: 0.8881 },
        route: {
          type: 'choice',
          choice: 'billing',
          probabilities: { billing: 0.828, support: 0.172 },
          confidence: 0.3378,
        },
        urgency: {
          type: 'score',
          score: 1.1,
          probabilities: { 0: 0.2, 1: 0.5, 2: 0.3 },
          levels: ['Low', 'Medium', 'High'],
        },
      },
    });
    // Nothing was renormalized, so no raw values are claimed.
    expect(result.provenance.details).not.toHaveProperty('rawProbabilities');
    expect(result.provenance.details).not.toHaveProperty('renormalized');
  });

  it('sends a bearer token only when an API key is configured', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => response(validResponse()));
    vi.stubGlobal('fetch', fetchMock);
    await provider({ apiKey: 'secret', headers: { 'X-Trace': 't1' } }).decide(
      request,
    );
    expect(call(fetchMock).headers).toMatchObject({
      Authorization: 'Bearer secret',
      'Content-Type': 'application/json',
      'X-Trace': 't1',
    });
  });

  it('accepts the server root, the /v1 base used for Jev, and a proxy prefix', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => response(validResponse()));
    vi.stubGlobal('fetch', fetchMock);
    for (const baseUrl of [
      'http://laya.test:8000/',
      'http://laya.test:8000/v1',
      'http://laya.test:8000/v1/',
      'http://laya.test:8000/v1/systemone',
    ])
      await provider({ baseUrl }).decide(request);
    await provider({ baseUrl: 'https://gw.test/laya/v1' }).decide(request);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://laya.test:8000/v1/systemone',
      'http://laya.test:8000/v1/systemone',
      'http://laya.test:8000/v1/systemone',
      'http://laya.test:8000/v1/systemone',
      'https://gw.test/laya/v1/systemone',
    ]);
  });

  it('requires an absolute http(s) baseUrl without credentials', async () => {
    for (const baseUrl of [
      undefined,
      '',
      'localhost:8000',
      'ftp://laya.test',
      'http://user:pw@laya.test',
      'http://laya.test/?key=1',
    ])
      expect(() => provider({ baseUrl })).toThrow(/baseUrl/);
    await expect(getAI({ type: 'laya' } as LayaOptions)).rejects.toThrow(
      /baseUrl/,
    );
  });

  it('omits model unless one is configured, and lets the request override it', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => response(validResponse()));
    vi.stubGlobal('fetch', fetchMock);

    await provider().decide(request);
    expect(call(fetchMock, 0).body).not.toHaveProperty('model');

    await provider({ defaultModel: 'english' }).decide(request);
    expect(call(fetchMock, 1).body.model).toBe('english');

    const configured = provider({ defaultModel: 'english' });
    await configured.decide(request, { model: 'multilingual' });
    expect(call(fetchMock, 2).body.model).toBe('multilingual');

    await configured.decide(request, { model: '' });
    expect(call(fetchMock, 3).body.model).toBe('english');
  });

  it('passes max_len from the configuration and lets the request override it', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => response(validResponse()));
    vi.stubGlobal('fetch', fetchMock);

    await provider().decide(request);
    expect(call(fetchMock, 0).body).not.toHaveProperty('max_len');

    const configured = provider({ maxLen: 2048 });
    await configured.decide(request);
    expect(call(fetchMock, 1).body.max_len).toBe(2048);

    const override: LayaDecisionOptions = { maxLen: 512 };
    const result = await configured.decide(request, override);
    expect(call(fetchMock, 2).body.max_len).toBe(512);
    expect(result.provenance.details).toMatchObject({ maxLen: 512 });
  });

  it('records the requested model beside the checkpoint that actually answered', async () => {
    const body = validResponse();
    body.routing = {
      ...body.routing,
      model: 'english',
      repo: 'convaiinnovations/laya',
      reason: 'English Latin text',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
    const result = await provider({ defaultModel: 'jev-latest' }).decide(
      request,
    );
    expect(result.model).toBe('english');
    expect(result.provenance).toMatchObject({
      model: 'english',
      details: {
        requestedModel: 'jev-latest',
        checkpoint: 'english',
        routeReason: 'English Latin text',
        serverModel: 'laya-rl-agent',
      },
    });
  });

  it('does not guess the checkpoint when a strict-Jev server omits routing', async () => {
    const strict = {
      model: 'laya-rl-agent',
      answers: {
        refund: { type: 'noul', noul: 0.9 },
        route: {
          type: 'choice',
          choice: 'billing',
          probabilities: { billing: 0.8, support: 0.2 },
          confidence: 0.3,
        },
        urgency: {
          type: 'score',
          score: 1,
          legend: { 0: 'Low', 1: 'Medium', 2: 'High' },
          probabilities: { 0: 0.2, 1: 0.5, 2: 0.3 },
          confidence: 0.1,
        },
      },
      usage: { input_tokens: 10, output_tokens: 0 },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(strict)));
    const result = await provider({ defaultModel: 'typed-decisions' }).decide(
      request,
    );
    expect(result.model).toBe('laya-rl-agent');
    expect(result.provenance.details).toMatchObject({
      requestedModel: 'typed-decisions',
      serverModel: 'laya-rl-agent',
    });
    expect(result.provenance.details).not.toHaveProperty('checkpoint');
    expect(result.provenance.details).not.toHaveProperty('truncated');
  });

  it('surfaces truncation, which is otherwise invisible', async () => {
    const body = validResponse();
    Object.assign(body.usage, {
      state_tokens: 4096,
      state_tokens_dropped: 3072,
      truncated: true,
      truncated_questions: ['route'],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
    const result = await provider().decide(request);
    expect(result.provenance.details).toMatchObject({
      stateTokens: 4096,
      stateTokensDropped: 3072,
      truncated: true,
      truncatedQuestions: ['route'],
    });
  });

  it('does not forward generation controls or unknown question properties', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(validResponse()));
    vi.stubGlobal('fetch', fetchMock);
    const withExtras = {
      state: request.state,
      questions: {
        ...request.questions,
        route: {
          ...request.questions.route,
          temperature: 0.2,
          max_len: 5,
        },
      },
    } as DecisionRequest;
    await provider().decide(withExtras, {
      usageTags: { route: 'test' },
      ...({ maxTokens: 999, temperature: 1, min_confidence: 0.9 } as never),
    });
    const { body } = call(fetchMock);
    expect(Object.keys(body).sort()).toEqual(['questions', 'state']);
    expect(body.questions.route).toEqual({
      type: 'choice',
      instructions: 'Which team?',
      criteria: { billing: 'Payments', support: 'General help' },
    });
  });

  it('forwards predicate criteria, null choice descriptions, and structured state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        model: 'laya-rl-agent',
        answers: {
          flag: { type: 'noul', noul: 0.5 },
          pick: {
            type: 'choice',
            choice: 'a',
            probabilities: { a: 0.5, b: 0.5 },
            confidence: 0,
          },
        },
        usage: { input_tokens: 1, output_tokens: 0 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await provider().decide({
      state: ['x', { nested: [1, true, null] }],
      questions: {
        flag: {
          type: 'predicate',
          instructions: { q: 'ok?' },
          criteria: { true: 'yes', false: { no: 1 } },
        },
        pick: {
          type: 'choice',
          instructions: 'pick',
          criteria: { a: null, b: null },
        },
      },
    });
    expect(call(fetchMock).body).toEqual({
      state: ['x', { nested: [1, true, null] }],
      questions: {
        flag: {
          type: 'noul',
          instructions: { q: 'ok?' },
          criteria: { true: 'yes', false: { no: 1 } },
        },
        pick: {
          type: 'choice',
          instructions: 'pick',
          criteria: { a: null, b: null },
        },
      },
    });
  });
});

describe('LayaProvider distributions', () => {
  it('renormalizes four-decimal rounding drift and keeps the raw values', async () => {
    // Measured from laya-serve 0.4.1: a three-level score summing to 1.0001.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(withScoreProbabilities({ 0: 0.1651, 1: 0.5508, 2: 0.2842 })),
        ),
    );
    const result = await provider().decide(request);
    const urgency = result.answers.urgency;
    if (urgency.type !== 'score') throw new Error('expected a score');
    const sum = Object.values(urgency.probabilities).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-12);
    expect(urgency.probabilities[1]).toBeCloseTo(0.5508 / 1.0001, 12);
    expect(result.provenance.details).toMatchObject({
      renormalized: ['urgency'],
      rawProbabilities: { urgency: { 0: 0.1651, 1: 0.5508, 2: 0.2842 } },
    });
  });

  it('accepts drift below one as well as above', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(withScoreProbabilities({ 0: 0.3333, 1: 0.3333, 2: 0.3333 })),
        ),
    );
    const result = await provider().decide(request);
    const urgency = result.answers.urgency;
    if (urgency.type !== 'score') throw new Error('expected a score');
    expect(urgency.probabilities[0]).toBeCloseTo(1 / 3, 12);
    expect(result.provenance.details).toMatchObject({
      rawProbabilities: { urgency: { 0: 0.3333, 1: 0.3333, 2: 0.3333 } },
    });
  });

  it('renormalizes a two-way choice off by one in the last place', async () => {
    const body = validResponse();
    body.answers.route.probabilities = { billing: 0.8281, support: 0.172 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
    const result = await provider().decide(request);
    const route = result.answers.route;
    if (route.type !== 'choice') throw new Error('expected a choice');
    expect(
      route.probabilities.billing + route.probabilities.support,
    ).toBeCloseTo(1, 12);
    expect(route.choice).toBe('billing');
    expect(result.provenance.details).toMatchObject({
      renormalized: ['route'],
    });
  });

  it('scales the tolerance with the number of options', async () => {
    const options = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [`o${index}`, null]),
    );
    const make = (each: number) => ({
      model: 'laya-rl-agent',
      answers: {
        wide: {
          type: 'choice',
          choice: 'o0',
          // 100 values, each rounded up by at most half of the last place.
          probabilities: Object.fromEntries(
            Array.from({ length: 100 }, (_, index) => [`o${index}`, each]),
          ),
          confidence: 0,
        },
      },
    });
    const wide: DecisionRequest = {
      state: 'x',
      questions: {
        wide: { type: 'choice', instructions: 'which?', criteria: options },
      },
    };
    // 100 * 0.01005 = 1.005, inside 100 * 5e-5 = 0.005.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(make(0.01005))));
    await expect(provider().decide(wide)).resolves.toBeDefined();
    // 100 * 0.0102 = 1.02 is beyond any four-decimal rounding.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(make(0.0102))));
    await expect(provider().decide(wide)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('rejects distributions outside the rounding bound, and unusable ones', async () => {
    const cases: Array<Record<string, number | string | null>> = [
      { 0: 0.2, 1: 0.5, 2: 0.31 }, // 1.01: too far for three values
      { 0: 0.2, 1: 0.5, 2: 0.2998 }, // 0.9998: beyond 3 * 5e-5
      { 0: 0, 1: 0, 2: 0 }, // no mass
      { 0: -0.1, 1: 0.6, 2: 0.5 }, // negative
      { 0: 1.5, 1: -0.25, 2: -0.25 }, // out of range
      { 0: 0.2, 1: 0.5, 2: '0.3' }, // not a number
      { 0: 0.2, 1: 0.5, 2: null }, // missing mass
      { 0: 0.2, 1: 0.5 }, // missing level
      { 0: 0.2, 1: 0.5, 2: 0.3, 3: 0 }, // extra level
      { 0: 0.2, 1: 0.5, x: 0.3 }, // wrong key
    ];
    for (const probabilities of cases) {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            response(withScoreProbabilities(probabilities as never)),
          ),
      );
      await expect(
        provider().decide(request),
        JSON.stringify(probabilities),
      ).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
        provider: 'laya',
      });
    }
  });

  it('rejects a non-finite distribution sent as an oversized number', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify(validResponse()).replace(
              '"noul":0.8881',
              '"noul":1e999',
            ),
            { status: 200 },
          ),
        ),
    );
    await expect(provider().decide(request)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('LayaProvider response validation', () => {
  it('rejects malformed answer IDs, types, labels, probabilities, and score rubrics', async () => {
    const mutate = (
      change: (body: ReturnType<typeof validResponse>) => void,
    ) => {
      const body = validResponse();
      change(body);
      return body;
    };
    const cases = [
      mutate((body) => {
        (body.answers as Record<string, unknown>).extra = {
          type: 'noul',
          noul: 0.2,
        };
      }),
      mutate((body) => {
        delete (body.answers as Record<string, unknown>).urgency;
      }),
      mutate((body) => {
        (body.answers as Record<string, unknown>).refund = {
          type: 'choice',
          choice: 'billing',
          probabilities: { billing: 1 },
          confidence: 1,
        };
      }),
      mutate((body) => {
        body.answers.route.choice = 'other';
      }),
      mutate((body) => {
        (body.answers.route as Record<string, unknown>).type = 'score';
      }),
      mutate((body) => {
        body.answers.refund.noul = 1.2;
      }),
      mutate((body) => {
        body.answers.refund.noul = -0.01;
      }),
      mutate((body) => {
        body.answers.route.confidence = 2;
      }),
      mutate((body) => {
        delete (body.answers.route as Record<string, unknown>).confidence;
      }),
      mutate((body) => {
        body.answers.urgency.score = 2.5;
      }),
      mutate((body) => {
        body.answers.urgency.score = -0.1;
      }),
      mutate((body) => {
        body.answers.urgency.legend = {
          0: 'Low',
          1: 'Other',
          2: 'High',
        } as never;
      }),
      mutate((body) => {
        body.answers.urgency.legend = { 0: 'Low', 1: 'Medium' } as never;
      }),
      mutate((body) => {
        (body as Record<string, unknown>).model = '';
      }),
      mutate((body) => {
        delete (body as Record<string, unknown>).model;
      }),
      mutate((body) => {
        (body as Record<string, unknown>).answers = [];
      }),
      mutate((body) => {
        (body as Record<string, unknown>).routing = 'english';
      }),
      mutate((body) => {
        (body.routing as Record<string, unknown>).model = 7;
      }),
      mutate((body) => {
        (body.usage as Record<string, unknown>).truncated = 'no';
      }),
      mutate((body) => {
        (body.usage as Record<string, unknown>).truncated_questions = [1];
      }),
      mutate((body) => {
        (body.usage as Record<string, unknown>).state_tokens = -1;
      }),
    ];
    for (const [index, body] of cases.entries()) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
      await expect(
        provider().decide(request),
        `case ${index}`,
      ).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
        provider: 'laya',
      });
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])));
    await expect(provider().decide(request)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('accepts structured score levels that Laya returns as Python JSON text', async () => {
    const structured: DecisionRequest = {
      ...request,
      questions: {
        urgency: {
          type: 'score',
          instructions: 'How urgent?',
          criteria: [{ label: 'Low', n: 1 }, ['Medium'], 'High', 3, true],
        },
      },
    };
    const body = {
      model: 'laya-rl-agent',
      answers: {
        urgency: {
          type: 'score',
          score: 1,
          // Verified against laya-serve 0.4.1: non-strings use json.dumps.
          legend: {
            0: '{"label": "Low", "n": 1}',
            1: '["Medium"]',
            2: 'High',
            3: '3',
            4: 'true',
          },
          probabilities: { 0: 0.2, 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2 },
          confidence: 0,
        },
      },
      usage: { input_tokens: 4, output_tokens: 0 },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
    const result = await provider().decide(structured);
    expect(result.answers.urgency).toMatchObject({
      levels: [{ label: 'Low', n: 1 }, ['Medium'], 'High', 3, true],
    });

    body.answers.urgency.legend['0'] = '{"label": "High", "n": 1}';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
    await expect(provider().decide(structured)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    // A string level must match exactly; it is never parsed as JSON.
    body.answers.urgency.legend['0'] = '{"label": "Low", "n": 1}';
    body.answers.urgency.legend['2'] = '"High"';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
    await expect(provider().decide(structured)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('accepts a response without usage or routing and rejects malformed usage', async () => {
    const bare = validResponse() as Record<string, unknown>;
    delete bare.usage;
    delete bare.routing;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(bare)));
    const result = await provider().decide(request);
    expect(result.usage).toBeUndefined();
    expect(result.model).toBe('laya-rl-agent');

    for (const usage of [
      'invalid',
      { input_tokens_typo: 12 },
      { input_tokens: 1 },
      { input_tokens: 1.5, output_tokens: 0 },
      { input_tokens: -1, output_tokens: 0 },
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(response({ ...validResponse(), usage })),
      );
      await expect(provider().decide(request)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    }
  });

  it('rejects an HTTP-success malformed JSON response without retry semantics', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{not valid json', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(provider().decide(request)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      retryable: false,
    });
  });
});

describe('LayaProvider request validation', () => {
  it('rejects invalid request shapes before network access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const laya = provider();
    await expect(
      laya.decide({
        state: 'x',
        questions: { '': { type: 'predicate', instructions: 'x' } },
      }),
    ).rejects.toThrow('question IDs');
    await expect(laya.decide({ state: 'x', questions: {} })).rejects.toThrow(
      'questions must not be empty',
    );
    await expect(
      laya.decide({
        state: null as never,
        questions: { a: { type: 'predicate', instructions: 'x' } },
      }),
    ).rejects.toThrow('state is required');
    await expect(
      laya.decide({
        state: Number.NaN,
        questions: { a: { type: 'predicate', instructions: 'x' } },
      }),
    ).rejects.toThrow('finite');
    await expect(
      laya.decide({
        state: 'x',
        questions: {
          choice: { type: 'choice', instructions: 'x', criteria: {} },
        },
      }),
    ).rejects.toThrow('at least one option');
    await expect(
      laya.decide({
        state: 'x',
        questions: {
          score: { type: 'score', instructions: 'x', criteria: ['one'] },
        },
      }),
    ).rejects.toThrow('at least 2');
    await expect(
      laya.decide({
        state: 'x',
        questions: {
          score: {
            type: 'score',
            instructions: 'x',
            criteria: ['one', null as never],
          },
        },
      }),
    ).rejects.toThrow('must describe the level');
    await expect(
      laya.decide({
        state: 'x',
        questions: { odd: { type: 'ranking', instructions: 'x' } as never },
      }),
    ).rejects.toThrow('unsupported');
    for (const maxLen of [0, -1, 1.5, Number.NaN, '512' as never])
      await expect(
        laya.decide(request, { maxLen } as LayaDecisionOptions),
      ).rejects.toThrow('maxLen');
    expect(() => provider({ maxLen: 0 })).toThrow('maxLen');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('LayaProvider failures', () => {
  it('maps authentication, API failures, and server errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response({ detail: 'invalid or missing bearer token' }, 401),
        ),
    );
    await expect(provider().decide(request)).rejects.toMatchObject({
      code: 'AUTH_ERROR',
      provider: 'laya',
    });

    for (const [status, detail] of [
      [400, "'state' is required"],
      [413, 'too many questions (65 > 64)'],
      [422, 'max_len exceeds server limit (99999 > 8192)'],
    ] as const) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(response({ detail }, status)),
      );
      await expect(provider().decide(request)).rejects.toMatchObject({
        code: 'API_ERROR',
        retryable: false,
        message: expect.stringContaining(detail),
      });
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ detail: 'inference failed' }, 500)),
    );
    await expect(provider().decide(request)).rejects.toMatchObject({
      code: 'API_ERROR',
      retryable: true,
    });
  });

  it('retries the admission limit (503) and rate limits (429) through the shared rate limiter', async () => {
    for (const status of [503, 429]) {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          response({ detail: 'server busy, try again later' }, status, {
            'retry-after': '0',
          }),
        )
        .mockResolvedValueOnce(response(validResponse()));
      vi.stubGlobal('fetch', fetchMock);
      const retrying = createRateLimitedAI(provider(), {
        type: 'laya',
        baseUrl: BASE,
        rateLimit: { maxAttempts: 2, initialDelayMs: 0, cooldownMs: 0 },
      });
      await expect(retrying.decide!(request)).resolves.toMatchObject({
        model: 'typed-decisions',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({ detail: 'server busy, try again later' }, 503, {
          'retry-after': '1',
        }),
      ),
    );
    await expect(provider().decide(request)).rejects.toMatchObject({
      name: 'RateLimitError',
      provider: 'laya',
    });
  });

  it('times out, honors a per-request timeout, and reports caller aborts', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    await expect(
      provider({ timeout: 1 }).decide(request),
    ).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
      retryable: true,
    });
    await expect(
      provider({ timeout: 60_000 }).decide(request, { timeout: 1 }),
    ).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });

    const before = new AbortController();
    before.abort();
    await expect(
      provider().decide(request, { signal: before.signal }),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED', retryable: false });

    const during = new AbortController();
    const pending = provider().decide(request, { signal: during.signal });
    during.abort();
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  });

  it('does not retry on its own; transport failures are retryable AI errors', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      provider({ maxRetries: 3 }).decide(request),
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
      provider: 'laya',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('LayaProvider factory integration', () => {
  it('is selected lazily by the factory and exposes explicit unsupported operations', async () => {
    const laya = await getAI({ type: 'laya', baseUrl: BASE });
    const capabilities = await laya.getCapabilities();
    expect(capabilities).toMatchObject({
      decisions: true,
      chat: false,
      supportedOperations: ['decide'],
    });
    await expect(laya.chat([])).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
      provider: 'laya',
    });
    await expect(laya.complete('x')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
    await expect(laya.embed('x')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
    await expect(laya.countTokens('x')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
    await expect(
      laya.stream([])[Symbol.asyncIterator]().next(),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    const models = await laya.getModels();
    expect(models.map((model) => model.id)).toEqual([
      'typed-decisions',
      'english',
      'multilingual',
    ]);
    expect(
      (
        await (
          await getAI({ type: 'laya', baseUrl: BASE, defaultModel: 'mine' })
        ).getModels()
      ).map((model) => model.id),
    ).toContain('mine');
  });

  it('preserves factory observation and usage conventions', async () => {
    const usage = vi.fn();
    const lifecycle = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(response(validResponse()));
    vi.stubGlobal('fetch', fetchMock);
    const laya = await getAI({
      type: 'laya',
      baseUrl: BASE,
      defaultModel: 'english',
      onUsage: usage,
      onRequest: lifecycle,
    });

    await laya.decide!(request, {
      model: 'typed-decisions',
      usageTags: { route: 'test' },
      ...({ maxTokens: 999, temperature: 1 } as never),
    });

    const { body } = call(fetchMock);
    expect(body).toMatchObject({ model: 'typed-decisions' });
    expect(body).not.toHaveProperty('maxTokens');
    expect(body).not.toHaveProperty('temperature');
    expect(usage).toHaveBeenCalledTimes(1);
    expect(usage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'laya',
        operation: 'decide',
        // The checkpoint that answered, not the one requested.
        model: 'typed-decisions',
        usage: { promptTokens: 93, completionTokens: 0, totalTokens: 93 },
        tags: { route: 'test' },
      }),
    );
    expect(lifecycle).toHaveBeenCalledTimes(1);
    expect(lifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'decide',
        requestedMaxOutputTokens: undefined,
        effectiveMaxOutputTokens: undefined,
        tags: { route: 'test' },
      }),
    );
    expect(JSON.stringify(lifecycle.mock.calls[0][0])).not.toContain('refund');
  });

  it('reports factory timeout and caller abort as terminal lifecycle statuses', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const timedOut = vi.fn();
    const timeoutProvider = await getAI({
      type: 'laya',
      baseUrl: BASE,
      timeout: 1,
      onRequest: timedOut,
    });
    await expect(timeoutProvider.decide!(request)).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
    expect(timedOut).toHaveBeenCalledTimes(1);
    expect(timedOut).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'decide', status: 'timed_out' }),
    );

    const aborted = vi.fn();
    const abortProvider = await getAI({
      type: 'laya',
      baseUrl: BASE,
      onRequest: aborted,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      abortProvider.decide!(request, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
    expect(aborted).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'decide', status: 'aborted' }),
    );
  });

  it('resolves LAYA_BASE_URL and LAYA_API_KEY in Node, and detects Laya only as a last resort', async () => {
    const keys = [
      'LAYA_BASE_URL',
      'LAYA_API_KEY',
      'TYPESAFE_API_KEY',
      'TYPESAFE_BASE_URL',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'GOOGLE_API_KEY',
      'HF_TOKEN',
      'LITELLM_BASE_URL',
      'BIFROST_BASE_URL',
      'OLLAMA_HOST',
      'OLLAMA_BASE_URL',
      'MODELARK_API_KEY',
      'ARK_API_KEY',
      'OPENAI_COMPAT_VIDEO_BASE_URL',
      'SEEVIO_API_KEY',
    ] as const;
    const previous = new Map(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => response(validResponse()));
    vi.stubGlobal('fetch', fetchMock);
    try {
      process.env.LAYA_BASE_URL = 'http://env.laya.test:9000';
      process.env.LAYA_API_KEY = 'env-key';

      const detected = await getNodeAIAuto({});
      expect((await detected.getCapabilities()).decisions).toBe(true);
      await detected.decide!(request);
      expect(call(fetchMock, 0).url).toBe(
        'http://env.laya.test:9000/v1/systemone',
      );
      expect(call(fetchMock, 0).headers.Authorization).toBe('Bearer env-key');

      // An explicit type reads the same variables; explicit config wins.
      const explicit = await getNodeAIAuto({
        type: 'laya',
        baseUrl: 'http://explicit.laya.test',
      });
      await explicit.decide!(request);
      expect(call(fetchMock, 1).url).toBe(
        'http://explicit.laya.test/v1/systemone',
      );
      expect(call(fetchMock, 1).headers.Authorization).toBe('Bearer env-key');

      // A hosted-provider signal outranks Laya.
      process.env.TYPESAFE_API_KEY = 'typesafe-key';
      const hosted = await getNodeAIAuto({});
      await hosted.decide!(request).catch(() => undefined);
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
        'https://api.typesafe.ai/v1/systemone',
      );
    } finally {
      for (const key of keys) {
        const value = previous.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe('existing providers are unaffected', () => {
  it('keeps existing capability literals and providers source-compatible', () => {
    const legacy: AICapabilities = {
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
      supportedOperations: [],
    };
    expect(legacy.decisions).toBeUndefined();
    const legacyProvider: AIInterface = new SeevioProvider({ type: 'seevio' });
    expect(legacyProvider.decide).toBeUndefined();
  });

  it('adds laya to the provider types without removing any', () => {
    expect(AI_PROVIDER_TYPES).toEqual(
      expect.arrayContaining([
        'openai',
        'litellm',
        'ollama',
        'gemini',
        'anthropic',
        'huggingface',
        'bedrock',
        'claude-cli',
        'bifrost',
        'qwen3-tts',
        'openai-compat-video',
        'byteplus-modelark',
        'seevio',
        'typesafe',
        'laya',
      ]),
    );
  });

  it('leaves TypeSafe results exactly as they were', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          model: 'jev-1.13.0',
          answers: { a: { type: 'noul', noul: 0.5 } },
        }),
      ),
    );
    const result = await new TypeSafeProvider({
      type: 'typesafe',
      apiKey: 'k',
    }).decide({
      state: 'x',
      questions: { a: { type: 'predicate', instructions: 'x' } },
    });
    expect(result.provenance).toEqual({
      provider: 'typesafe',
      model: 'jev-1.13.0',
    });
  });

  it('keeps the Laya provider out of the factory import graph until it is selected', () => {
    for (const file of ['./shared/factory.ts', './node/factory.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/^import\s[^;]*providers\/laya/m);
      expect(source).not.toMatch(/^import\s+type\s[^;]*providers\/laya/m);
    }
    const shared = readFileSync(
      new URL('./shared/factory.ts', import.meta.url),
      'utf8',
    );
    expect(shared).toContain("await import('./providers/laya.js')");
  });
});
