import { expect, it } from 'vitest';
import {
  addInterval,
  createId,
  formatDate,
  isCuid,
  isPlural,
  isSingular,
  isValidDate,
  makeId,
  parseAmazonDateString,
  parseDate,
  pluralizeWord,
  singularize,
  sleep,
  waitFor,
} from './index.js';

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

it.skip('should be able to parse an amazon date', () => {
  const result = parseAmazonDateString('20220223T215409Z');
  expect(result).toBeDefined();
});

// CUID2 tests
it('should generate CUID2 by default', () => {
  const id = makeId();
  expect(typeof id).toBe('string');
  expect(id.length).toBeGreaterThan(0);
  expect(isCuid(id)).toBe(true);
});

it('should generate UUID when requested', () => {
  const id = makeId('uuid');
  expect(typeof id).toBe('string');
  expect(id.length).toBe(36);
  expect(id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

it('should create CUID2 with createId', () => {
  const id = createId();
  expect(typeof id).toBe('string');
  expect(isCuid(id)).toBe(true);
});

// Pluralize tests
it('should pluralize words', () => {
  expect(pluralizeWord('cat')).toBe('cats');
  expect(pluralizeWord('mouse')).toBe('mice');
  expect(singularize('cats')).toBe('cat');
  expect(singularize('mice')).toBe('mouse');
});

it('should check plural/singular status', () => {
  expect(isPlural('cats')).toBe(true);
  expect(isSingular('cat')).toBe(true);
  expect(isPlural('cat')).toBe(false);
  expect(isSingular('cats')).toBe(false);
});

// Date-fns tests
it('should format dates', () => {
  const date = new Date('2023-01-15T12:00:00Z');
  expect(formatDate(date)).toBe('2023-01-15');
  expect(formatDate(date, 'MM/dd/yyyy')).toBe('01/15/2023');
});

it('should parse dates', () => {
  const date = parseDate('2023-01-15');
  expect(date).toBeInstanceOf(Date);
  expect(isValidDate(date)).toBe(true);
});

it('should handle date intervals', () => {
  const date = new Date('2023-01-15T00:00:00.000Z');
  const newDate = addInterval(date, { days: 7 });
  const expectedDate = new Date('2023-01-22T00:00:00.000Z');
  expect(newDate.toISOString()).toBe(expectedDate.toISOString());
});
