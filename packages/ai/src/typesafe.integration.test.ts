import { expect, it } from 'vitest';

import { getAI } from './shared/factory';

const apiKey = process.env.TYPESAFE_API_KEY;

it.skipIf(!apiKey)(
  'evaluates a predicate with a live TypeSafe API key',
  async () => {
    const ai = await getAI({ type: 'typesafe', apiKey });
    const result = await ai.decide?.({
      state: { message: 'Please refund my duplicate charge.' },
      questions: {
        refund: {
          type: 'predicate',
          instructions: 'Does `message` request a refund?',
        },
      },
    });
    expect(result?.answers.refund).toMatchObject({ type: 'predicate' });
  },
  30_000,
);
