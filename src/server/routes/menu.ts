import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();

    return c.json<UiResponse>(
      {
        navigateTo: `https://www.reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating daily post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create Karma Conduit post',
      },
      400
    );
  }
});

menu.post('/custom-challenge', async (c) => {
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'challengeForm',
        form: {
          title: 'Create Custom Karma Conduit Challenge',
          fields: [
            {
              name: 'title',
              label: 'Post Title',
              type: 'string',
              required: true,
            },
            {
              name: 'seedCode',
              label: 'Challenge Seed Keyword (e.g. boss-friday)',
              type: 'string',
              required: true,
            },
          ],
        },
      },
    },
    200
  );
});
