/**
 * Optional tests for @have/ai
 *
 * These tests require real API keys and make actual API calls.
 * Run with: npm run test:optional
 *
 * Following organization-wide testing standard:
 * - Tests in *.optional.test.ts require external resources (API keys)
 * - Tests make real network calls to AI providers
 * - Tests are slow due to API response times
 */

import { expect, it } from 'vitest';
import { AIClient, OpenAIClient } from './shared/client';
import { AIThread } from './shared/thread';

/**
 * Integration test: Send a simple message to OpenAI
 *
 * Requires: OPENAI_API_KEY environment variable
 * Tests: Basic message sending with OpenAIClient
 */
it('should create an AIClient and send it a message', async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('Skipping: OPENAI_API_KEY not set');
    return;
  }

  const client = await OpenAIClient.create({
    apiKey: process.env.OPENAI_API_KEY!,
  });
  const result = await client.message('What is the capital of France?');
  expect(result.toLowerCase()).toContain('paris');
}, 30000);

/**
 * Integration test: Use AIThread with conversation history and references
 *
 * Requires: OPENAI_API_KEY environment variable
 * Tests: AIThread with system message, references, and conversation flow
 */
it('should create an AIThread and ask it a question', async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('Skipping: OPENAI_API_KEY not set');
    return;
  }

  const options = {
    ai: {
      type: 'openai' as const,
      apiKey: process.env.OPENAI_API_KEY!,
    },
    prompt: 'What is the capital of France?',
  };

  const _ai = await AIClient.create(options.ai);

  // Create thread with conversation management
  const thread = await AIThread.create({
    ai: options.ai,
  });

  await thread.addSystem('You are a helpful assistant.');

  // Add reference material (meeting minutes example)
  await thread.addReference('Meeting Minutes', minutes);

  await thread.add({
    role: 'user',
    content:
      'Summarize the key decisions from the meeting and how they impact the budget.',
  });

  const response = await thread.do('Write a short summary.');

  console.log(response);
  expect(response).toBeTruthy();
  expect(typeof response).toBe('string');
}, 30000);

// Test data: Sample meeting minutes for reference testing
const minutes =
  'V, 1/ 7\n' +
  'NRL — un ON\n' +
  'Town\n' +
  'Minutes of the Regular of the Council of the Town of Bentley November 26, 2024\n' +
  'Date and Place\n' +
  'In Attendance\n' +
  'Call to Order\n' +
  'Indigenous Acknowledgement\n' +
  'Agenda\n' +
  'Minutes of the Regular Meeting of the Council of the Town of Bentley held Tuesday, November 26, 2024, at 6:30 p.m., in the Bentley Municipal Office\n' +
  'Mayor Greg Rathjen Deputy Mayor Valiquette Councillor Eastman Councillor Hansen Councillor Grimsdale CAO, Marc Fortais\n' +
  'Mayor Rathjen called the regular council meeting to order at 6:30pm\n' +
  '"We acknowledge that we are meeting on Treaty 6 Territory and Home of Metis Nation Region 3, on land that is part of a historic agreement involving mutuality and respect. We recognize all the many First Nations, Metis, Inuit, and non-First Nations whose footsteps have marked these lands."\n' +
  'Read by Mayor Rathjen\n' +
  'Motion 228/2024 Moved by Councillor Hansen, "THAT the agenda of the November 26, 2024, regular meeting of council be amended to include the following items as other business:\n' +
  '1) Gull Lake East Trail – letter of support to Lacombe County 2) Local Sustainability Grant Application\n' +
  'Carried\n' +
  'Motion 229/2024 Moved by Councillor Grimsdale, "THAT the amended agenda of the October 26, 2024, regular meeting of council be accepted."\n' +
  'Carried\n' +
  'Regular Council Meeting Minutes November 26, 2024\n';
