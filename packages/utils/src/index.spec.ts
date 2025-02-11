import { it, expect } from 'vitest';
import { parseAmazonDateString, sleep, waitFor } from './index';

it('should have a test', () => {
  expect(true).toBe(true);
});

it.skip('should waitFor "it"', async () => {
  let attempts = 0;
  const result = await waitFor(
    async () => {
      attempts++;
      if (attempts >= 5) {
        return true;
      }
    },
    {
      timeout: 0, // 0 = don't timeout
      delay: 10,
    },
  );
  expect(result).toEqual(true);
});

it.skip('should waitFor "it" only so long', async () => {
  let attempts = 0;
  expect.assertions(1);
  await expect(
    waitFor(
      async () => {
        attempts++;
        await sleep(1000);
        if (attempts >= 10) {
          return true;
        }
      },
      {
        delay: 1000, // should tick 3 times
        timeout: 30000,
      },
    ),
  ).rejects.toEqual('Timed out');
});

it.skip('shoulde able to parse an amazon date', () => {
  const result = parseAmazonDateString('20220223T215409Z');
  expect(result).toBeDefined();
});
