import { it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { makeSlug } from '@have/utils';
import { Contents } from './contents.js';
import { faker } from '@faker-js/faker';

const TMP_DIR = path.resolve(`${os.tmpdir()}/.have-sdk-tests/contents`);
fs.mkdirSync(TMP_DIR, { recursive: true });

it('should be able to getOrInsert a content item', async () => {
  const contents = await Contents.create({
    ai: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
    },
    db: {
      url: `file:${TMP_DIR}/test.db`,
    },
  });

  const fakeContentData = {
    title: faker.lorem.sentence(),
    body: faker.lorem.paragraph(),
    author: faker.person.fullName(),
    publish_date: faker.date.recent(),
  };

  const content = await contents.getOrUpsert(fakeContentData);
  expect(content.id).toBeDefined();

  const content2 = await contents.getOrUpsert(fakeContentData);
  expect(content2.id).toBe(content.id);

  const got = await contents.get({ id: content.id });
  expect(got?.id).toEqual(content.id);
});

it('should respect the context of the slug', async () => {
  const contents = await Contents.create({
    ai: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
    },
    db: {
      url: `file:${TMP_DIR}/test.db`,
    },
  });

  const fakeContentData = {
    title: faker.lorem.sentence(),
    body: faker.lorem.paragraph(),
    author: faker.person.fullName(),
    publish_date: faker.date.recent(),
  };

  const slug = makeSlug(fakeContentData.title);

  const content = await contents.getOrUpsert({
    ...fakeContentData,
    url: 'http://setinfirst.com',
    slug,
    context: 'contextA',
  });
  expect(content.id).toBeDefined();

  const different = await contents.getOrUpsert({
    ...fakeContentData,
    slug,
    context: 'contextB',
    source: 'set in different context',
  });
  expect(different.id).not.toBe(content.id);

  const contextA = await contents.get({
    slug,
    context: 'contextA',
  });

  const contextB = await contents.get({
    slug,
    context: 'contextB',
  });

  const updated = await contents.getOrUpsert({
    description: 'foo',
    slug,
    context: 'contextA',
  });

  expect(updated.id).toBeDefined();
  expect(updated.description).toBe('foo');
  expect(updated.id).toBe(contextA?.id);
});

// skipped because it takes a long time
it.skip('should be able to mirror a bit of content give a url', async () => {
  const contents = await Contents.create({
    ai: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
    },
    db: {
      url: `file:${TMP_DIR}/test.db`,
    },
  });

  const created = await contents.mirror({
    url: 'https://townofbentley.ca/wp-content/uploads/2024/12/Signed-Minutes-November-26-2024-Regular-Council-Meeting.pdf',
    mirrorDir: `${TMP_DIR}/mirror-test`,
  });
  expect(created?.id).toBeDefined();
}, 60000);

it.skip('should be able to sync a content dir', async () => {
  const contents = await Contents.create({
    ai: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
    },
    db: {
      url: `file:${TMP_DIR}/test.db`,
    },
    fs: {
      type: 'filesystem',
      cacheDir: `${TMP_DIR}/cache`,
    },
  });

  // for (let x = 0; x < 10; x++) {
  await contents.getOrUpsert({
    type: 'article',
    title: faker.lorem.sentence(),
    description: faker.lorem.sentence(),
    body: faker.lorem.paragraph(),
    author: faker.person.fullName(),
    publish_date: faker.date.recent(),
  });
  // }

  // await contents.syncContentDir({ contentDir: `${TMP_DIR}/content` });
});

it('should be able to list content', async () => {
  const contents = await Contents.create({
    ai: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
    },
    db: {
      url: `file::memory:?cache=shared`, //todo: memory doesnt work because we pass around the connection,
    },
  });

  const fakeContentData = {
    title: faker.lorem.sentence(),
    body: faker.lorem.paragraph(),
    author: faker.person.fullName(),
    publish_date: faker.date.recent(),
  };

  const content = await contents.getOrUpsert(fakeContentData);
  await content.save();

  const fakeContentData2 = {
    title: faker.lorem.sentence(),
    body: faker.lorem.paragraph(),
    author: faker.person.fullName(),
    publish_date: faker.date.recent(),
  };

  const content2 = await contents.getOrUpsert(fakeContentData2);
  await content2.save();

  const fakeContentData3 = {
    title: faker.lorem.sentence(),
    body: faker.lorem.paragraph(),
    author: faker.person.fullName(),
    publish_date: faker.date.recent(),
  };
  const content3 = await contents.getOrUpsert(fakeContentData3);
  await content3.save();

  expect(content.id).toBeDefined();

  // const content2 = await contents.getOrUpsert(fakeContentData);
  // expect(content2.id).toBe(content.id);

  // const got = await contents.list({});
  // console.log({ got });
  // expect(got?.id).toEqual(content.id);
});
