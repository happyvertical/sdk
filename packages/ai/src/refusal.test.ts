import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from './shared/providers/anthropic';
import { BedrockProvider } from './shared/providers/bedrock';
import { BifrostProvider } from './shared/providers/bifrost';

const user = [{ role: 'user' as const, content: 'Hi' }];

function anthropic(create: ReturnType<typeof vi.fn>) {
  const provider = new AnthropicProvider({
    type: 'anthropic',
    apiKey: 'test-key',
  });
  (provider as any).client = { messages: { create } };
  return provider;
}

describe('refusal signal: Anthropic', () => {
  it('surfaces stop_reason refusal with stop_details', async () => {
    const provider = anthropic(
      vi.fn().mockResolvedValue({
        content: [],
        model: 'claude-opus-5-5',
        stop_reason: 'refusal',
        stop_details: {
          type: 'refusal',
          category: 'cyber',
          explanation: 'Declined: offensive security request.',
        },
        usage: { input_tokens: 5, output_tokens: 0 },
      }),
    );
    const response = await provider.chat(user);
    expect(response.finishReason).toBe('refusal');
    expect(response.refusal).toEqual({
      category: 'cyber',
      explanation: 'Declined: offensive security request.',
    });
    expect(response.content).toBe('');
  });

  it('reports null details when stop_details is missing', async () => {
    const provider = anthropic(
      vi.fn().mockResolvedValue({
        content: [],
        model: 'claude-opus-5-5',
        stop_reason: 'refusal',
        stop_details: null,
        usage: { input_tokens: 5, output_tokens: 0 },
      }),
    );
    const response = await provider.chat(user);
    expect(response.finishReason).toBe('refusal');
    expect(response.refusal).toEqual({ category: null, explanation: null });
  });

  it('does not set refusal on a normal reply', async () => {
    const provider = anthropic(
      vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        model: 'claude-opus-5-5',
        stop_reason: 'end_turn',
        stop_details: null,
        usage: { input_tokens: 5, output_tokens: 1 },
      }),
    );
    const response = await provider.chat(user);
    expect(response.finishReason).toBe('stop');
    expect(response).not.toHaveProperty('refusal');
  });

  it('reports a refusal at the end of a stream', async () => {
    async function* events() {
      yield {
        type: 'message_delta',
        delta: {
          stop_reason: 'refusal',
          stop_details: { type: 'refusal', category: 'bio', explanation: 'no' },
        },
        usage: { output_tokens: 0 },
      };
    }
    const provider = anthropic(vi.fn().mockResolvedValue(events()));
    const onRefusal = vi.fn();
    const onFinishReason = vi.fn();
    for await (const _ of provider.stream(user, {
      onRefusal,
      onFinishReason,
    })) {
      // drain
    }
    expect(onRefusal).toHaveBeenCalledWith({
      category: 'bio',
      explanation: 'no',
    });
    expect(onFinishReason).toHaveBeenCalledWith('refusal');
  });
});

describe('refusal signal: gateways and Bedrock', () => {
  async function bifrostFinish(finish: string, message: object = {}) {
    const provider = new BifrostProvider({
      type: 'bifrost',
      apiKey: 'test-key',
      baseUrl: 'http://localhost:8080/openai',
    });
    (provider as any).client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            model: 'm',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: '', ...message },
                finish_reason: finish,
              },
            ],
          }),
        },
      },
    };
    return provider.chat(user, { model: 'anthropic/claude-opus-5-5' });
  }

  it('maps a forwarded refusal finish reason, reading stop_details when present', async () => {
    const response = await bifrostFinish('refusal', {
      stop_details: { category: 'cyber', explanation: 'x' },
    });
    expect(response.finishReason).toBe('refusal');
    expect(response.refusal).toEqual({ category: 'cyber', explanation: 'x' });
    expect((await bifrostFinish('refusal')).refusal).toEqual({
      category: null,
      explanation: null,
    });
  });

  it('keeps content_filter distinct from refusal', async () => {
    const response = await bifrostFinish('content_filter');
    expect(response.finishReason).toBe('content_filter');
    expect(response).not.toHaveProperty('refusal');
  });

  it('maps Bedrock stopReason refusal', () => {
    const provider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
    });
    const response = (provider as any).mapConverseResponse(
      {
        output: { message: { content: [] } },
        stopReason: 'refusal',
      },
      'us.anthropic.claude-opus-5-5',
    );
    expect(response.finishReason).toBe('refusal');
    expect(response.refusal).toEqual({ category: null, explanation: null });
    expect((provider as any).mapBedrockFinishReason('refusal')).toBe('refusal');
    expect(
      (provider as any).mapBedrockFinishReason('guardrail_intervened'),
    ).toBe('stop');
  });
});
