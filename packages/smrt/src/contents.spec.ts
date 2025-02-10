import { it, expect } from 'vitest';
import { TMP_DIR, makeId, makeSlug } from '@have/utils';
import { Content } from './content.js';
import { Contents } from './contents.js';

import { faker } from '@faker-js/faker';

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
  // console.log({ content });
  expect(content.id).toBeDefined();

  const content2 = await contents.getOrUpsert(fakeContentData);
  // console.log({ content2 });
  expect(content2.id).toBe(content.id);

  // console.log({ content2 });
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
  });
  expect(created.id).toBeDefined();
}, 60000);

it('should be able to sync a content dir', async () => {
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
    contentDir: `${TMP_DIR}/content`,
  });

  for (let x = 0; x < 10; x++) {
    await contents.getOrUpsert({
      type: 'article',
      title: faker.lorem.sentence(),
      body: faker.lorem.paragraph(),
      author: faker.person.fullName(),
      publish_date: faker.date.recent(),
    });
  }

  await contents.syncContentDir();
});
