import { describe, expect, it, vi } from 'vitest';
import {
  claudeRejectsThinkingBudget,
  claudeSupportsEffort,
  toClaudeEffort,
} from './shared/claude-models';
import { AnthropicProvider } from './shared/providers/anthropic';
import { BedrockProvider } from './shared/providers/bedrock';
import { BifrostProvider } from './shared/providers/bifrost';

const user = [{ role: 'user' as const, content: 'Hi' }];

async function anthropicBody(
  options: Record<string, unknown>,
  model = 'claude-opus-5-5',
) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'ok' }],
    model,
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  const provider = new AnthropicProvider({
    type: 'anthropic',
    apiKey: 'test-key',
  });
  (provider as any).client = { messages: { create } };
  await provider.chat(user, { model, ...options });
  return create.mock.calls[0][0];
}

describe('Claude model detection', () => {
  it('knows which models take effort and reject a thinking budget', () => {
    for (const model of [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-opus-4-8',
      'claude-opus-5',
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
      'claude-fable-5-1',
      'anthropic/claude-opus-5-5',
      'us.anthropic.claude-opus-5-5',
    ]) {
      expect(claudeSupportsEffort(model), model).toBe(true);
    }
    for (const model of [
      'claude-opus-4-5',
      'claude-opus-4-5-20251101',
      'claude-opus-4-20250514',
      'claude-sonnet-4-5',
      'claude-haiku-4-5',
      'claude-3-5-sonnet-20241022',
      'gpt-4o',
      undefined,
    ]) {
      expect(claudeSupportsEffort(model), String(model)).toBe(false);
    }
    expect(claudeRejectsThinkingBudget('claude-opus-4-6')).toBe(false);
    expect(claudeRejectsThinkingBudget('claude-opus-4-7')).toBe(true);
    expect(claudeRejectsThinkingBudget('claude-opus-5-5')).toBe(true);
    expect(claudeRejectsThinkingBudget('claude-sonnet-4-5')).toBe(false);
  });

  it('maps SDK effort to Claude effort', () => {
    expect(toClaudeEffort('claude-opus-5-5', 'none')).toBe('low');
    expect(toClaudeEffort('claude-opus-5-5', 'minimal')).toBe('low');
    expect(toClaudeEffort('claude-opus-5-5', 'xhigh')).toBe('xhigh');
    expect(toClaudeEffort('claude-opus-5-5', 'max')).toBe('max');
    expect(toClaudeEffort('claude-opus-4-6', 'xhigh')).toBe('high');
  });
});

describe('Claude effort: Anthropic provider', () => {
  it('sends output_config.effort with adaptive thinking and no budget', async () => {
    const body = await anthropicBody({ reasoning: { effort: 'high' } });
    expect(body.output_config).toEqual({ effort: 'high' });
    expect(body.thinking).toEqual({ type: 'adaptive' });
  });

  it('is not capped by the reasoning-token ceiling (xhigh, max)', async () => {
    for (const effort of ['xhigh', 'max'] as const) {
      const body = await anthropicBody({ reasoning: { effort } });
      expect(body.output_config).toEqual({ effort });
    }
  });

  it('replaces budget_tokens with adaptive thinking where the budget is rejected', async () => {
    const body = await anthropicBody({ reasoning: { maxTokens: 1024 } });
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toBeUndefined();
  });

  it('sends effort none as low without enabling thinking', async () => {
    const body = await anthropicBody({ reasoning: { effort: 'none' } });
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.thinking).toBeUndefined();
  });

  it('keeps the legacy budget on models that take one', async () => {
    const body = await anthropicBody(
      { reasoning: { effort: 'high', maxTokens: 1024 } },
      'claude-sonnet-4-5',
    );
    expect(body.output_config).toBeUndefined();
    expect(body.thinking).toMatchObject({ type: 'enabled' });
    expect(body.thinking.budget_tokens).toBeGreaterThan(0);
  });

  it('sends nothing when no reasoning is requested', async () => {
    const body = await anthropicBody({});
    expect(body.output_config).toBeUndefined();
    expect(body.thinking).toBeUndefined();
  });
});

describe('Claude effort: Bifrost provider', () => {
  async function bifrostCall(model: string, options: Record<string, unknown>) {
    const create = vi.fn().mockResolvedValue({
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'ok' },
          finish_reason: 'stop',
        },
      ],
    });
    const provider = new BifrostProvider({
      type: 'bifrost',
      apiKey: 'test-key',
      baseUrl: 'http://localhost:8080/openai',
    });
    (provider as any).client = { chat: { completions: { create } } };
    await provider.chat(user, { model, ...options });
    return { body: create.mock.calls[0][0], init: create.mock.calls[0][1] };
  }

  it('passes output_config.effort through extra_params for Claude 4.6+', async () => {
    const { body, init } = await bifrostCall('anthropic/claude-opus-5-5', {
      reasoning: { effort: 'xhigh' },
    });
    expect(body.extra_params).toEqual({
      output_config: { effort: 'xhigh' },
      thinking: { type: 'adaptive' },
    });
    expect(body.reasoning).toBeUndefined();
    expect(init.headers).toEqual({ 'x-bf-passthrough-extra-params': 'true' });
  });

  it('replaces a rejected budget with adaptive thinking (no effort)', async () => {
    const { body, init } = await bifrostCall('anthropic/claude-opus-5-5', {
      reasoning: { maxTokens: 1024 },
    });
    expect(body.extra_params).toEqual({ thinking: { type: 'adaptive' } });
    expect(body.reasoning).toBeUndefined();
    expect(init.headers).toEqual({ 'x-bf-passthrough-extra-params': 'true' });
  });

  it('keeps the budget for Claude models that accept one', async () => {
    const { body } = await bifrostCall('anthropic/claude-sonnet-4-5', {
      reasoning: { maxTokens: 1024 },
    });
    expect(body.reasoning).toMatchObject({ max_tokens: 1024 });
    expect(body.extra_params).toBeUndefined();
  });

  it('clamps max to xhigh in the Bifrost reasoning envelope', async () => {
    const { body } = await bifrostCall('openai/gpt-5', {
      reasoning: { effort: 'max', maxTokens: 1024 },
    });
    expect(body.reasoning.effort).toBe('xhigh');
  });

  it('keeps the reasoning envelope for other models', async () => {
    const { body, init } = await bifrostCall('openai/gpt-5', {
      reasoning: { effort: 'high', maxTokens: 1024 },
    });
    expect(body.reasoning).toMatchObject({ effort: 'high' });
    expect(body.extra_params).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });
});

describe('Claude effort: Bedrock provider', () => {
  const build = (modelId: string, reasoning: Record<string, unknown>) => {
    const provider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
    });
    return (provider as any).buildConverseRequest(user, { reasoning }, modelId);
  };

  it('sends output_config.effort in additionalModelRequestFields', async () => {
    const request = await build('us.anthropic.claude-opus-5-5', {
      effort: 'max',
    });
    expect(request.additionalModelRequestFields).toEqual({
      output_config: { effort: 'max' },
      thinking: { type: 'adaptive' },
    });
  });

  it('keeps the budget for older Claude models', async () => {
    const request = await build('anthropic.claude-sonnet-4-5-v1:0', {
      maxTokens: 2048,
    });
    expect(request.additionalModelRequestFields).toEqual({
      thinking: { type: 'enabled', budget_tokens: 2048 },
    });
  });
});
