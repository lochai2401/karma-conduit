import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, reddit } from '@devvit/web/server';
import { createPost } from '../core/post';

type ChallengeFormValues = {
  title?: string;
  seedCode?: string;
};

export const forms = new Hono();

forms.post('/challenge-submit', async (c) => {
  try {
    const values = await c.req.json<ChallengeFormValues>();
    const rawUsername = await reddit.getCurrentUsername();
    const author = rawUsername ?? 'moderator';
    const cleanSeed =
      (typeof values.seedCode === 'string' ? values.seedCode : '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 24) || `mod-${Date.now().toString(36)}`;
    const cleanTitle =
      (typeof values.title === 'string' ? values.title.trim() : '').slice(0, 90) ||
      `⚡ Custom Conduit Challenge "${cleanSeed}" by u/${author}`;

    const post = await createPost({
      seedKey: `ugc:${cleanSeed}`,
      title: cleanTitle,
      gridSize: 5,
      author,
    });

    return c.json<UiResponse>(
      {
        navigateTo: `https://www.reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Challenge form error: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Could not create custom challenge post',
      },
      400
    );
  }
});
