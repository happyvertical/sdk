/**
 * AI Client Wrapper
 *
 * Provides a unified interface for AI API calls.
 * Supports GitHub Models API (default) and other providers.
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Call GitHub Models API (available to all GitHub users)
 */
export async function callGitHubModels(
  token: string,
  messages: AIMessage[],
  options: AICompletionOptions = {},
): Promise<string> {
  const model = options.model || 'gpt-4o-mini';
  const temperature = options.temperature ?? 0.3;
  const maxTokens = options.maxTokens ?? 1000;

  const response = await fetch(
    `https://models.inference.ai.azure.com/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `GitHub Models API error: ${response.status} ${response.statusText}\n${error}`,
    );
  }

  const result = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  return result.choices[0].message.content;
}

/**
 * Call OpenAI API directly
 */
export async function callOpenAI(
  apiKey: string,
  messages: AIMessage[],
  options: AICompletionOptions = {},
): Promise<string> {
  const model = options.model || 'gpt-4o-mini';
  const temperature = options.temperature ?? 0.3;
  const maxTokens = options.maxTokens ?? 1000;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText}\n${error}`,
    );
  }

  const result = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  return result.choices[0].message.content;
}

/**
 * Call Anthropic Claude API
 */
export async function callAnthropic(
  apiKey: string,
  messages: AIMessage[],
  options: AICompletionOptions = {},
): Promise<string> {
  const model = options.model || 'claude-3-5-sonnet-20241022';
  const temperature = options.temperature ?? 0.3;
  const maxTokens = options.maxTokens ?? 1000;

  // Extract system message
  const systemMessage = messages.find((m) => m.role === 'system');
  const conversationMessages = messages.filter((m) => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemMessage?.content,
      messages: conversationMessages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Anthropic API error: ${response.status} ${response.statusText}\n${error}`,
    );
  }

  const result = (await response.json()) as {
    content: { text: string }[];
  };

  return result.content[0].text;
}

/**
 * Unified AI completion function
 *
 * Automatically selects provider based on available environment variables:
 * - GITHUB_TOKEN → GitHub Models (default)
 * - OPENAI_API_KEY → OpenAI
 * - ANTHROPIC_API_KEY → Anthropic
 */
export async function getAICompletion(
  messages: AIMessage[],
  options: AICompletionOptions = {},
): Promise<string> {
  // Try GitHub Models first (available to all GitHub users)
  if (process.env.GITHUB_TOKEN) {
    return callGitHubModels(process.env.GITHUB_TOKEN, messages, options);
  }

  // Fall back to OpenAI
  if (process.env.OPENAI_API_KEY) {
    return callOpenAI(process.env.OPENAI_API_KEY, messages, options);
  }

  // Fall back to Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    return callAnthropic(process.env.ANTHROPIC_API_KEY, messages, options);
  }

  throw new Error(
    'No AI API credentials found. Set GITHUB_TOKEN, OPENAI_API_KEY, or ANTHROPIC_API_KEY environment variable.',
  );
}

/**
 * Parse JSON from AI response
 *
 * Handles markdown code blocks and extracts JSON
 */
export function parseAIJson<T>(response: string): T {
  // Remove markdown code blocks if present
  let cleaned = response.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse AI response as JSON: ${(error as Error).message}\n\nResponse: ${response}`,
    );
  }
}
