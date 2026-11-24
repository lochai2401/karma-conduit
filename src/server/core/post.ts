import { context, reddit, redis } from '@devvit/web/server';
import { getDailyEditionNumber, getUtcDateKey } from '../../shared/puzzleEngine';

export type CustomPostMeta = {
  seedKey: string;
  title: string;
  gridSize: 4 | 5;
  author: string;
};

export const createPost = async (custom?: CustomPostMeta) => {
  const dateKey = getUtcDateKey();
  const edition = getDailyEditionNumber(dateKey);
  const title =
    custom?.title ??
    `⚡ Karma Conduit #${edition} (${dateKey}) — Can our subreddit power all 3 Vaults under Par?`;

  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title,
  });

  if (custom) {
    await redis.set(`kc:post:${post.id}`, JSON.stringify(custom));
  }

  return post;
};
