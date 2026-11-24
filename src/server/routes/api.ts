import { Hono } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import type {
  CommunityStats,
  CreateChallengeRequest,
  CreateChallengeResponse,
  DailyPuzzleSpec,
  GuildId,
  InitResponse,
  LeaderboardEntry,
  PlayerProfile,
  ShareCommentRequest,
  ShareCommentResponse,
  SubmitScoreRequest,
  SubmitScoreResponse,
} from '../../shared/api';
import {
  buildShareMarkdown,
  calculateScore,
  evaluateBoardState,
  generatePuzzleFromSeed,
  getPreviousUtcDateKey,
  getUtcDateKey,
} from '../../shared/puzzleEngine';
import { createPost } from '../core/post';

type ErrorResponse = {
  status: 'error';
  message: string;
};

const DAILY_COMMUNITY_GOAL = 15000;

function parseGuildId(raw: string | undefined): GuildId {
  if (raw === 'architects' || raw === 'mystics' || raw === 'vanguard') {
    return raw;
  }
  return 'vanguard';
}

function safeInt(raw: string | undefined, fallback = 0): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type StoredCustomPost = {
  seedKey?: string;
  title?: string;
  gridSize?: number;
  author?: string;
};

function parseCustomPost(raw: string | undefined): StoredCustomPost | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const record: StoredCustomPost = {};
      if ('seedKey' in parsed && typeof parsed.seedKey === 'string') {
        record.seedKey = parsed.seedKey;
      }
      if ('title' in parsed && typeof parsed.title === 'string') {
        record.title = parsed.title;
      }
      if ('gridSize' in parsed && typeof parsed.gridSize === 'number') {
        record.gridSize = parsed.gridSize;
      }
      if ('author' in parsed && typeof parsed.author === 'string') {
        record.author = parsed.author;
      }
      return record;
    }
  } catch {
    return null;
  }
  return null;
}

type StoredRunMeta = {
  moves: number;
  timeSec: number;
  crystals: number;
  guild: GuildId;
};

function parseRunMeta(raw: string | undefined): StoredRunMeta {
  if (!raw) {
    return { moves: 0, timeSec: 0, crystals: 0, guild: 'vanguard' };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const moves =
        'moves' in parsed && typeof parsed.moves === 'number' ? parsed.moves : 0;
      const timeSec =
        'timeSec' in parsed && typeof parsed.timeSec === 'number'
          ? parsed.timeSec
          : 0;
      const crystals =
        'crystals' in parsed && typeof parsed.crystals === 'number'
          ? parsed.crystals
          : 0;
      const guild =
        'guild' in parsed && typeof parsed.guild === 'string'
          ? parseGuildId(parsed.guild)
          : 'vanguard';
      return { moves, timeSec, crystals, guild };
    }
  } catch {
    // Fallback below
  }
  return { moves: 0, timeSec: 0, crystals: 0, guild: 'vanguard' };
}

async function resolvePuzzleForPost(
  postId: string,
  dateKey: string
): Promise<DailyPuzzleSpec> {
  const customRaw = await redis.get(`kc:post:${postId}`);
  const custom = parseCustomPost(customRaw);
  if (custom?.seedKey) {
    const gridSize: 4 | 5 = custom.gridSize === 4 ? 4 : 5;
    return generatePuzzleFromSeed({
      seedKey: custom.seedKey,
      gridSize,
      title: custom.title ?? `Community Vault: ${custom.seedKey}`,
      author: custom.author ?? 'Community Architect',
      isCustomPost: true,
    });
  }
  return generatePuzzleFromSeed({
    seedKey: dateKey,
    gridSize: 5,
    isCustomPost: false,
  });
}

async function loadLeaderboard(boardScope: string): Promise<LeaderboardEntry[]> {
  const lbKey = `kc:lb:${boardScope}`;
  const metaKey = `kc:meta:${boardScope}`;
  const [topRows, allMeta] = await Promise.all([
    redis.zRange(lbKey, 0, 9, { by: 'rank', reverse: true }),
    redis.hGetAll(metaKey),
  ]);

  return topRows.map((entry, idx) => {
    const meta = parseRunMeta(allMeta[entry.member]);
    return {
      rank: idx + 1,
      username: entry.member,
      score: Math.round(entry.score),
      moves: meta.moves,
      timeSec: meta.timeSec,
      crystals: meta.crystals,
      guild: meta.guild,
    };
  });
}

async function loadCommunityStats(dateKey: string): Promise<CommunityStats> {
  const statsHash = await redis.hGetAll(`kc:stats:${dateKey}`);
  return {
    solversToday: safeInt(statsHash['solvers'], 0),
    totalEnergyToday: safeInt(statsHash['totalEnergy'], 0),
    dailyGoalEnergy: DAILY_COMMUNITY_GOAL,
    guildScores: {
      vanguard: safeInt(statsHash['vanguard'], 0),
      architects: safeInt(statsHash['architects'], 0),
      mystics: safeInt(statsHash['mystics'], 0),
    },
  };
}

async function loadPlayerProfile(
  username: string,
  boardScope: string,
  postId: string
): Promise<PlayerProfile> {
  const [streakHash, scoreMember, runMetaRaw, sharedFlag] = await Promise.all([
    redis.hGetAll(`kc:streak:${username}`),
    redis.zRange(`kc:lb:${boardScope}`, 0, 999, { by: 'rank', reverse: true }),
    redis.hGet(`kc:meta:${boardScope}`, username),
    redis.get(`kc:shared:${postId}:${username}`),
  ]);

  const foundEntry = scoreMember.find((item) => item.member === username);
  const runMeta = parseRunMeta(runMetaRaw);
  const lastSolvedDate = streakHash['lastSolvedDate'] ?? '';

  return {
    username,
    currentStreak: safeInt(streakHash['currentStreak'], 0),
    bestStreak: safeInt(streakHash['bestStreak'], 0),
    lastSolvedDate,
    guild: parseGuildId(streakHash['guild'] ?? runMeta.guild),
    solvedToday: foundEntry !== undefined,
    bestScoreToday: foundEntry ? Math.round(foundEntry.score) : 0,
    bestMovesToday: runMeta.moves,
    bestTimeSecToday: runMeta.timeSec,
    crystalsToday: runMeta.crystals,
    sharedCommentToday: sharedFlag === '1',
  };
}

export const api = new Hono();

api.get('/init', async (c) => {
  const { postId, subredditName } = context;

  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required in Devvit context',
      },
      400
    );
  }

  try {
    const dateKey = getUtcDateKey();
    const [rawUsername, puzzle] = await Promise.all([
      reddit.getCurrentUsername(),
      resolvePuzzleForPost(postId, dateKey),
    ]);
    const username = rawUsername ?? 'redditor';
    const boardScope = puzzle.isCustomPost ? `post:${postId}` : dateKey;

    const [player, leaderboard, community] = await Promise.all([
      loadPlayerProfile(username, boardScope, postId),
      loadLeaderboard(boardScope),
      loadCommunityStats(dateKey),
    ]);

    return c.json<InitResponse>({
      type: 'init',
      postId,
      subredditName: subredditName ?? 'reddit',
      dateKey,
      puzzle,
      player,
      leaderboard,
      community,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Initialization failed';
    return c.json<ErrorResponse>({ status: 'error', message }, 400);
  }
});

api.post('/submit-score', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'postId is required' },
      400
    );
  }

  try {
    const body = await c.req.json<SubmitScoreRequest>();
    const dateKey = getUtcDateKey();
    const [rawUsername, puzzle] = await Promise.all([
      reddit.getCurrentUsername(),
      resolvePuzzleForPost(postId, dateKey),
    ]);
    const username = rawUsername ?? 'redditor';
    const guild = parseGuildId(body.guild);

    if (
      !Array.isArray(body.rotations) ||
      body.rotations.length !== puzzle.tiles.length
    ) {
      return c.json<ErrorResponse>(
        { status: 'error', message: 'Invalid board state payload' },
        400
      );
    }

    // Server-authoritative puzzle verification (anti-cheat)
    const evalResult = evaluateBoardState(puzzle, body.rotations);
    if (!evalResult.isSolved) {
      return c.json<ErrorResponse>(
        { status: 'error', message: 'Board does not power all Subreddit Vaults' },
        400
      );
    }

    const safeMoves = Math.max(1, Math.min(999, Math.trunc(body.moves)));
    const safeSeconds = Math.max(1, Math.min(7200, Math.trunc(body.elapsedSeconds)));
    const safeHints = Math.max(0, Math.min(25, Math.trunc(body.hintsUsed)));

    const computedScore = calculateScore({
      moves: safeMoves,
      parMoves: puzzle.parMoves,
      poweredCrystals: evalResult.poweredCrystals,
      elapsedSeconds: safeSeconds,
      hintsUsed: safeHints,
    });

    const boardScope = puzzle.isCustomPost ? `post:${postId}` : dateKey;
    const lbKey = `kc:lb:${boardScope}`;
    const metaKey = `kc:meta:${boardScope}`;
    const statsKey = `kc:stats:${dateKey}`;
    const streakKey = `kc:streak:${username}`;

    const existingProfile = await loadPlayerProfile(username, boardScope, postId);
    const isFirstClearToday = !existingProfile.solvedToday;
    const isNewBest = computedScore > existingProfile.bestScoreToday;

    if (isFirstClearToday || isNewBest) {
      await redis.zAdd(lbKey, { member: username, score: computedScore });
      await redis.hSet(metaKey, {
        [username]: JSON.stringify({
          moves: safeMoves,
          timeSec: safeSeconds,
          crystals: evalResult.poweredCrystals,
          guild,
        }),
      });
    }

    if (isFirstClearToday) {
      await Promise.all([
        redis.hIncrBy(statsKey, 'solvers', 1),
        redis.hIncrBy(statsKey, 'totalEnergy', computedScore),
        redis.hIncrBy(statsKey, guild, computedScore),
      ]);
    } else if (isNewBest) {
      const delta = computedScore - existingProfile.bestScoreToday;
      await Promise.all([
        redis.hIncrBy(statsKey, 'totalEnergy', delta),
        redis.hIncrBy(statsKey, guild, delta),
      ]);
    }

    // Update daily streak once per UTC calendar day
    if (existingProfile.lastSolvedDate !== dateKey) {
      const yesterdayKey = getPreviousUtcDateKey(dateKey);
      const nextStreak =
        existingProfile.lastSolvedDate === yesterdayKey
          ? existingProfile.currentStreak + 1
          : 1;
      const nextBest = Math.max(existingProfile.bestStreak, nextStreak);
      await redis.hSet(streakKey, {
        currentStreak: String(nextStreak),
        bestStreak: String(nextBest),
        lastSolvedDate: dateKey,
        guild,
      });
    } else {
      await redis.hSet(streakKey, { guild });
    }

    const [updatedLeaderboard, updatedCommunity, updatedPlayer, allRanks] =
      await Promise.all([
        loadLeaderboard(boardScope),
        loadCommunityStats(dateKey),
        loadPlayerProfile(username, boardScope, postId),
        redis.zRange(lbKey, 0, 999, { by: 'rank', reverse: true }),
      ]);

    const rankIdx = allRanks.findIndex((r) => r.member === username);

    return c.json<SubmitScoreResponse>({
      type: 'submit-score',
      accepted: true,
      isNewBest: isFirstClearToday || isNewBest,
      score: computedScore,
      rank: rankIdx >= 0 ? rankIdx + 1 : 1,
      poweredCrystals: evalResult.poweredCrystals,
      totalCrystals: evalResult.totalCrystals,
      player: updatedPlayer,
      leaderboard: updatedLeaderboard,
      community: updatedCommunity,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to submit score';
    return c.json<ErrorResponse>({ status: 'error', message }, 400);
  }
});

api.post('/share-comment', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'postId is required' },
      400
    );
  }

  try {
    const body = await c.req.json<ShareCommentRequest>();
    const dateKey = getUtcDateKey();
    const [rawUsername, puzzle] = await Promise.all([
      reddit.getCurrentUsername(),
      resolvePuzzleForPost(postId, dateKey),
    ]);
    const username = rawUsername ?? 'redditor';
    const boardScope = puzzle.isCustomPost ? `post:${postId}` : dateKey;
    const player = await loadPlayerProfile(username, boardScope, postId);

    const markdown = buildShareMarkdown({
      puzzle,
      rotations: body.rotations,
      moves: Math.max(1, Math.trunc(body.moves)),
      elapsedSeconds: Math.max(1, Math.trunc(body.elapsedSeconds)),
      score: player.bestScoreToday > 0 ? player.bestScoreToday : Math.trunc(body.score),
      streak: Math.max(1, player.currentStreak),
      guild: parseGuildId(body.guild),
    });

    if (player.sharedCommentToday) {
      return c.json<ShareCommentResponse>({
        type: 'share-comment',
        posted: false,
        message: 'Already shared to comments today — copied card to clipboard!',
        markdown,
      });
    }

    await reddit.submitComment({
      id: postId,
      text: `${markdown}\n\n*Posted by u/${username} via Karma Conduit*`,
    });
    await redis.set(`kc:shared:${postId}:${username}`, '1');

    return c.json<ShareCommentResponse>({
      type: 'share-comment',
      posted: true,
      message: 'Posted your spoiler-free result grid to the Reddit thread!',
      markdown,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not post Reddit comment';
    return c.json<ErrorResponse>({ status: 'error', message }, 400);
  }
});

api.post('/create-challenge', async (c) => {
  const { subredditName } = context;
  if (!subredditName) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'subredditName missing in context' },
      400
    );
  }

  try {
    const body = await c.req.json<CreateChallengeRequest>();
    const rawUsername = await reddit.getCurrentUsername();
    const author = rawUsername ?? 'redditor';
    const cleanCode =
      body.customCode.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) ||
      `vault-${Date.now().toString(36)}`;
    const cleanTitle =
      body.title.trim().slice(0, 90) ||
      `🛠️ Community Conduit "${cleanCode}" by u/${author}`;
    const gridSize: 4 | 5 = body.gridSize === 4 ? 4 : 5;

    const post = await createPost({
      seedKey: `ugc:${cleanCode}`,
      title: cleanTitle,
      gridSize,
      author,
    });

    return c.json<CreateChallengeResponse>({
      type: 'create-challenge',
      created: true,
      postUrl: `https://www.reddit.com/r/${subredditName}/comments/${post.id}`,
      message: 'Published your Custom Conduit Challenge to the subreddit!',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not create challenge post';
    return c.json<ErrorResponse>({ status: 'error', message }, 400);
  }
});
