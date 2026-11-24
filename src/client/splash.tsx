import './index.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { InitResponse } from '../shared/api';
import {
  GUILD_META,
  generatePuzzleFromSeed,
  getUtcDateKey,
} from '../shared/puzzleEngine';

export const Splash = () => {
  const [data, setData] = useState<InitResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/init');
        if (res.ok) {
          const json: InitResponse = await res.json();
          setData(json);
          return;
        }
      } catch {
        // Local standalone preview fallback
      }
      const dateKey = getUtcDateKey();
      const fallbackPuzzle = generatePuzzleFromSeed({ seedKey: dateKey, gridSize: 5 });
      setData({
        type: 'init',
        postId: 'local',
        subredditName: 'Devvit',
        dateKey,
        puzzle: fallbackPuzzle,
        player: {
          username: context.username ?? 'redditor',
          currentStreak: 1,
          bestStreak: 1,
          lastSolvedDate: '',
          guild: 'vanguard',
          solvedToday: false,
          bestScoreToday: 0,
          bestMovesToday: 0,
          bestTimeSecToday: 0,
          crystalsToday: 0,
          sharedCommentToday: false,
        },
        leaderboard: [],
        community: {
          solversToday: 0,
          totalEnergyToday: 0,
          dailyGoalEnergy: 15000,
          guildScores: { vanguard: 0, architects: 0, mystics: 0 },
        },
      });
    };
    void load();
  }, []);

  const edition = data?.puzzle.editionNumber ?? 14;
  const parMoves = data?.puzzle.parMoves ?? 10;
  const title = data?.puzzle.title ?? `Daily Conduit #${edition}`;
  const solvers = data?.community.solversToday ?? 0;
  const energy = data?.community.totalEnergyToday ?? 0;
  const goal = data?.community.dailyGoalEnergy ?? 15000;
  const pct = Math.min(100, Math.round((energy / Math.max(1, goal)) * 100));
  const topLeader = data?.leaderboard[0];
  const solvedToday = data?.player.solvedToday ?? false;
  const streak = data?.player.currentStreak ?? 0;

  return (
    <div className="relative flex h-full min-h-[340px] w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 p-4 text-white">
      {/* Decorative glowing orbs */}
      <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-orange-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-cyan-500/15 blur-3xl" />

      {/* Top badge bar */}
      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/40 bg-orange-500/15 px-3 py-1 text-xs font-bold tracking-wide text-orange-300">
          ⚡ { data?.puzzle.isCustomPost ? 'COMMUNITY VAULT' : `DAILY EDITION #${edition}` }
        </span>
        <div className="flex items-center gap-2 text-xs">
          {streak > 0 && (
            <span className="rounded-full bg-amber-500/20 border border-amber-400/40 px-2.5 py-0.5 font-semibold text-amber-300">
              🔥 {streak}d Streak
            </span>
          )}
          <span className="rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-slate-300">
            Par {parMoves}
          </span>
        </div>
      </div>

      {/* Center Hero */}
      <div className="relative z-10 my-auto flex flex-col items-center text-center py-2">
        <div className="mb-2 flex items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/90 px-3.5 py-2 shadow-lg">
          <span className="text-xl">🟠</span>
          <span className="text-orange-400 font-bold">━━⚡━━</span>
          <span className="text-xl">💎</span>
          <span className="text-amber-300 font-bold">━━⚡━━</span>
          <span className="text-xl">🏆</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          KARMA CONDUIT
        </h1>
        <p className="mt-1 max-w-md text-xs sm:text-sm text-slate-300">
          {title} • Rotate the grid conduits to route Snoo Voltage into all{' '}
          <span className="font-semibold text-amber-300">3 Subreddit Vaults</span>!
        </p>

        {/* Mini Live Stats Strip */}
        <div className="mt-3 grid w-full max-w-md grid-cols-2 gap-2 text-left text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5">
            <div className="text-[11px] text-slate-400">Subreddit Overcharge</div>
            <div className="mt-0.5 flex items-baseline justify-between">
              <span className="font-bold text-orange-400">{pct}% Charged</span>
              <span className="text-[11px] text-slate-400">{solvers} solvers</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500"
                style={{ width: `${Math.max(6, pct)}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5">
            <div className="text-[11px] text-slate-400">Today&apos;s #1 Architect</div>
            {topLeader ? (
              <div className="mt-0.5">
                <div className="truncate font-bold text-amber-300">
                  {GUILD_META[topLeader.guild].badge} u/{topLeader.username}
                </div>
                <div className="text-[11px] text-slate-400">
                  {topLeader.score} pts ({topLeader.moves} moves)
                </div>
              </div>
            ) : (
              <div className="mt-1 font-semibold text-cyan-300">
                Unclaimed — Be #1!
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#FF4500] to-amber-500 px-7 py-2.5 text-sm font-extrabold text-white shadow-[0_0_22px_rgba(255,69,0,0.55)] transition-transform hover:scale-105 active:scale-95 cursor-pointer"
        >
          {solvedToday
            ? `🏆 Replay / Beat ${data?.player.bestScoreToday ?? 0} pts`
            : '⚡ Play Today’s Conduit'}
        </button>
      </div>

      {/* Bottom Guild Ticker */}
      <div className="relative z-10 flex items-center justify-center gap-4 text-[11px] text-slate-400">
        <span>🔥 Vanguard: {data?.community.guildScores.vanguard ?? 0}</span>
        <span>•</span>
        <span>⚡ Architects: {data?.community.guildScores.architects ?? 0}</span>
        <span>•</span>
        <span>🌙 Mystics: {data?.community.guildScores.mystics ?? 0}</span>
      </div>
    </div>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <Splash />
    </StrictMode>
  );
}
