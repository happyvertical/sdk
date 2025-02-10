import { it, expect } from 'vitest';

it('should have a test', () => {
  expect(true).toBe(true);
});

import { parseAmazonDateString, sleep, waitFor, addInterval } from './index.js';

it.skip('should waitFor "it"', async () => {
  let attempts = 0;
  const result = await waitFor(
    () => {
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

// it('should be able to add an interval to a date', () => {
//   const date = '2012-12-21';
//   const interval = '1 day';
//   const result = addInterval(date, interval);
//   expect(result).toEqual('2012-12-22 00:00:00');
// });
