import './index.css';

import { navigateTo, showToast } from '@devvit/web/client';
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  CommunityStats,
  CreateChallengeResponse,
  DailyPuzzleSpec,
  GuildId,
  InitResponse,
  LeaderboardEntry,
  PlayerProfile,
  Rotation,
  ShareCommentResponse,
  SubmitScoreResponse,
} from '../shared/api';
import {
  GUILD_META,
  buildShareMarkdown,
  calculateScore,
  evaluateBoardState,
  generatePuzzleFromSeed,
  getTileConnectionsMask,
  getUtcDateKey,
  toRotation,
} from '../shared/puzzleEngine';
import { ConduitTile } from './components/ConduitTile';
import { playHintPing, playRotateClick, playVictoryFanfare } from './sound';

type ActiveTab = 'play' | 'leaderboard' | 'forge';

function safeToast(msg: string): void {
  try {
    showToast(msg);
  } catch {
    // Fallback when running in standalone local browser outside Devvit iframe
    console.info('[Toast]', msg);
  }
}

export const App = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('play');
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [dailyPuzzle, setDailyPuzzle] = useState<DailyPuzzleSpec | null>(null);
  const [activePuzzle, setActivePuzzle] = useState<DailyPuzzleSpec | null>(null);

  const [rotations, setRotations] = useState<Rotation[]>([]);
  const [undoStack, setUndoStack] = useState<Rotation[][]>([]);
  const [moves, setMoves] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintedIndex, setHintedIndex] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [guild, setGuild] = useState<GuildId>('vanguard');
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [community, setCommunity] = useState<CommunityStats | null>(null);
  const [subredditName, setSubredditName] = useState('Devvit');

  const [submitting, setSubmitting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [lastClearScore, setLastClearScore] = useState<number | null>(null);
  const [lastRank, setLastRank] = useState<number | null>(null);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  // Forge form state
  const [customTitle, setCustomTitle] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [customGridSize, setCustomGridSize] = useState<4 | 5>(5);

  const hasHandledSolveRef = useRef(false);

  const notify = useCallback((msg: string) => {
    setToastBanner(msg);
    safeToast(msg);
  }, []);

  useEffect(() => {
    if (!toastBanner) return;
    const t = window.setTimeout(() => setToastBanner(null), 3800);
    return () => window.clearTimeout(t);
  }, [toastBanner]);

  const startBoard = useCallback((puzzle: DailyPuzzleSpec, practice: boolean) => {
    hasHandledSolveRef.current = false;
    setIsPracticeMode(practice);
    setActivePuzzle(puzzle);
    setRotations(puzzle.tiles.map((t) => t.initialRotation));
    setUndoStack([]);
    setMoves(0);
    setHintsUsed(0);
    setHintedIndex(null);
    setElapsedSeconds(0);
    setLastClearScore(null);
    setLastRank(null);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/init');
        if (res.ok) {
          const data: InitResponse = await res.json();
          setDailyPuzzle(data.puzzle);
          setPlayer(data.player);
          setGuild(data.player.guild);
          setLeaderboard(data.leaderboard);
          setCommunity(data.community);
          setSubredditName(data.subredditName);
          startBoard(data.puzzle, false);
          setLoading(false);
          return;
        }
      } catch {
        // Standalone local browser fallback
      }

      const dateKey = getUtcDateKey();
      const localPuzzle = generatePuzzleFromSeed({ seedKey: dateKey, gridSize: 5 });
      setDailyPuzzle(localPuzzle);
      setPlayer({
        username: 'local_architect',
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
      });
      setCommunity({
        solversToday: 1,
        totalEnergyToday: 2150,
        dailyGoalEnergy: 15000,
        guildScores: { vanguard: 950, architects: 720, mystics: 480 },
      });
      startBoard(localPuzzle, false);
      setLoading(false);
    };
    void init();
  }, [startBoard]);

  const boardEval = useMemo(() => {
    if (!activePuzzle) {
      return {
        poweredIndices: new Set<number>(),
        poweredVaults: 0,
        totalVaults: 3,
        poweredCrystals: 0,
        totalCrystals: 2,
        isSolved: false,
        isPerfectClear: false,
      };
    }
    return evaluateBoardState(activePuzzle, rotations);
  }, [activePuzzle, rotations]);

  // Live 1-second timer while puzzle is active and unsolved
  useEffect(() => {
    if (loading || !activePuzzle || boardEval.isSolved) return;
    const id = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [loading, activePuzzle, boardEval.isSolved]);

  const submitSolvedRun = useCallback(
    async (
      solvedPuzzle: DailyPuzzleSpec,
      finalRotations: Rotation[],
      finalMoves: number,
      finalSeconds: number,
      finalHints: number,
      selectedGuild: GuildId,
      practice: boolean
    ) => {
      const localEval = evaluateBoardState(solvedPuzzle, finalRotations);
      const localScore = calculateScore({
        moves: Math.max(1, finalMoves),
        parMoves: solvedPuzzle.parMoves,
        poweredCrystals: localEval.poweredCrystals,
        elapsedSeconds: Math.max(1, finalSeconds),
        hintsUsed: finalHints,
      });
      setLastClearScore(localScore);

      if (practice) {
        notify(`Blitz Solved! Score: ${localScore} pts`);
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch('/api/submit-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rotations: finalRotations,
            moves: Math.max(1, finalMoves),
            elapsedSeconds: Math.max(1, finalSeconds),
            hintsUsed: finalHints,
            guild: selectedGuild,
          }),
        });
        if (res.ok) {
          const data: SubmitScoreResponse = await res.json();
          setLastClearScore(data.score);
          setLastRank(data.rank);
          setPlayer(data.player);
          setLeaderboard(data.leaderboard);
          setCommunity(data.community);
          notify(
            data.isNewBest
              ? `🏆 Ranked #${data.rank} Today! ${data.score} pts`
              : `Solved! ${data.score} pts (Best: ${data.player.bestScoreToday})`
          );
        }
      } catch {
        // Offline / local preview fallback
      } finally {
        setSubmitting(false);
      }
    },
    [notify]
  );

  const handleRotateTile = useCallback(
    (index: number) => {
      if (!activePuzzle || boardEval.isSolved) return;
      const tile = activePuzzle.tiles[index];
      if (!tile || tile.locked) return;

      const nextRotations = [...rotations];
      const currentRot = nextRotations[index] ?? tile.initialRotation;
      nextRotations[index] = toRotation(currentRot + 1);

      const nextMoves = moves + 1;
      const nextEval = evaluateBoardState(activePuzzle, nextRotations);

      setUndoStack((prev) => [...prev.slice(-30), rotations]);
      setRotations(nextRotations);
      setMoves(nextMoves);
      if (hintedIndex === index) {
        setHintedIndex(null);
      }

      if (nextEval.isSolved && !hasHandledSolveRef.current) {
        hasHandledSolveRef.current = true;
        playVictoryFanfare(muted);
        void submitSolvedRun(
          activePuzzle,
          nextRotations,
          nextMoves,
          Math.max(1, elapsedSeconds),
          hintsUsed,
          guild,
          isPracticeMode
        );
      } else {
        playRotateClick(nextEval.poweredIndices.has(index), muted);
      }
    },
    [
      activePuzzle,
      boardEval.isSolved,
      rotations,
      moves,
      hintedIndex,
      muted,
      submitSolvedRun,
      elapsedSeconds,
      hintsUsed,
      guild,
      isPracticeMode,
    ]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || boardEval.isSolved) return;
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setUndoStack((prev) => prev.slice(0, -1));
    setRotations(previous);
    setMoves((m) => Math.max(0, m - 1));
  }, [undoStack, boardEval.isSolved]);

  const handleReset = useCallback(() => {
    if (!activePuzzle) return;
    startBoard(activePuzzle, isPracticeMode);
  }, [activePuzzle, isPracticeMode, startBoard]);

  const handleHint = useCallback(() => {
    if (!activePuzzle || boardEval.isSolved) return;
    const misaligned = activePuzzle.tiles.find((tile) => {
      if (tile.locked || tile.kind === 'cross') return false;
      const cur = rotations[tile.index] ?? tile.initialRotation;
      return (
        getTileConnectionsMask(tile.kind, cur) !==
        getTileConnectionsMask(tile.kind, tile.solutionRotation)
      );
    });
    if (!misaligned) {
      notify('All essential conduits are already aligned!');
      return;
    }
    const updated = [...rotations];
    updated[misaligned.index] = misaligned.solutionRotation;
    const nextHints = hintsUsed + 1;
    const nextMoves = moves + 1;
    setRotations(updated);
    setHintsUsed(nextHints);
    setMoves(nextMoves);
    setHintedIndex(misaligned.index);
    playHintPing(muted);

    const nextEval = evaluateBoardState(activePuzzle, updated);
    if (nextEval.isSolved && !hasHandledSolveRef.current) {
      hasHandledSolveRef.current = true;
      playVictoryFanfare(muted);
      void submitSolvedRun(
        activePuzzle,
        updated,
        nextMoves,
        Math.max(1, elapsedSeconds),
        nextHints,
        guild,
        isPracticeMode
      );
    }
  }, [
    activePuzzle,
    boardEval.isSolved,
    rotations,
    hintsUsed,
    moves,
    muted,
    notify,
    submitSolvedRun,
    elapsedSeconds,
    guild,
    isPracticeMode,
  ]);

  const handleShareToRedditComments = useCallback(async () => {
    if (!activePuzzle) return;
    const finalScore = lastClearScore ?? player?.bestScoreToday ?? 1000;
    const localMarkdown = buildShareMarkdown({
      puzzle: activePuzzle,
      rotations,
      moves: Math.max(1, moves),
      elapsedSeconds: Math.max(1, elapsedSeconds),
      score: finalScore,
      streak: Math.max(1, player?.currentStreak ?? 1),
      guild,
    });

    setSharing(true);
    try {
      const res = await fetch('/api/share-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rotations,
          moves: Math.max(1, moves),
          elapsedSeconds: Math.max(1, elapsedSeconds),
          score: finalScore,
          guild,
        }),
      });
      if (res.ok) {
        const data: ShareCommentResponse = await res.json();
        try {
          await navigator.clipboard.writeText(data.markdown);
        } catch {
          // Clipboard optional
        }
        notify(data.message);
        if (player) {
          setPlayer({ ...player, sharedCommentToday: true });
        }
        return;
      }
    } catch {
      // Fallback to clipboard copy
    } finally {
      setSharing(false);
    }

    try {
      await navigator.clipboard.writeText(localMarkdown);
      notify('Copied spoiler-free result grid to clipboard!');
    } catch {
      notify('Result ready to share!');
    }
  }, [activePuzzle, lastClearScore, player, rotations, moves, elapsedSeconds, guild, notify]);

  const handleCopyMarkdown = useCallback(async () => {
    if (!activePuzzle) return;
    const finalScore = lastClearScore ?? player?.bestScoreToday ?? 1000;
    const md = buildShareMarkdown({
      puzzle: activePuzzle,
      rotations,
      moves: Math.max(1, moves),
      elapsedSeconds: Math.max(1, elapsedSeconds),
      score: finalScore,
      streak: Math.max(1, player?.currentStreak ?? 1),
      guild,
    });
    try {
      await navigator.clipboard.writeText(md);
      notify('Copied emoji grid to clipboard!');
    } catch {
      notify('Clipboard unavailable in this view');
    }
  }, [activePuzzle, lastClearScore, player, rotations, moves, elapsedSeconds, guild, notify]);

  const handleLaunchBlitz = useCallback(
    (size: 4 | 5) => {
      const randomKey = `blitz-${size}-${Date.now().toString(36)}`;
      const blitzPuzzle = generatePuzzleFromSeed({
        seedKey: randomKey,
        gridSize: size,
        title: size === 4 ? '⚡ 4×4 Warmup Blitz' : '🔥 5×5 Master Blitz',
        author: 'Practice Lab',
        isCustomPost: true,
      });
      startBoard(blitzPuzzle, true);
      setActiveTab('play');
    },
    [startBoard]
  );

  const handleMintCommunityPost = useCallback(async () => {
    if (creatingChallenge) return;
    setCreatingChallenge(true);
    try {
      const res = await fetch('/api/create-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: customTitle,
          customCode: customCode || `vault-${Date.now().toString(36).slice(-4)}`,
          gridSize: customGridSize,
        }),
      });
      if (res.ok) {
        const data: CreateChallengeResponse = await res.json();
        notify(data.message);
        if (data.postUrl) {
          navigateTo(data.postUrl);
        }
        return;
      }
      notify('Challenge preview generated locally! Launch on Reddit to publish.');
    } catch {
      // Fallback: play custom seed immediately in local tab
      const seed = customCode.trim() || `custom-${Date.now().toString(36).slice(-4)}`;
      const localCustom = generatePuzzleFromSeed({
        seedKey: `ugc:${seed}`,
        gridSize: customGridSize,
        title: customTitle.trim() || `🛠️ Custom Vault "${seed}"`,
        author: player?.username ?? 'you',
        isCustomPost: true,
      });
      startBoard(localCustom, true);
      setActiveTab('play');
      notify('Loaded your custom seeded Vault!');
    } finally {
      setCreatingChallenge(false);
    }
  }, [
    creatingChallenge,
    customTitle,
    customCode,
    customGridSize,
    notify,
    player?.username,
    startBoard,
  ]);

  if (loading || !activePuzzle) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
          <p className="text-sm font-semibold text-slate-300">
            Charging Today&apos;s Karma Conduit...
          </p>
        </div>
      </div>
    );
  }

  const mins = Math.floor(elapsedSeconds / 60);
  const secs = String(elapsedSeconds % 60).padStart(2, '0');
  const communityPct = community
    ? Math.min(
        100,
        Math.round(
          (community.totalEnergyToday / Math.max(1, community.dailyGoalEnergy)) * 100
        )
      )
    : 0;

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col">
      {/* Floating Banner Notification */}
      {toastBanner && (
        <div className="fixed top-3 left-1/2 z-50 -translate-x-1/2 rounded-full border border-orange-400/50 bg-slate-900/95 px-4 py-1.5 text-xs font-bold text-amber-300 shadow-xl">
          {toastBanner}
        </div>
      )}

      {/* Compact Header & Navigation Tabs */}
      <header className="border-b border-slate-800/90 bg-slate-900/80 px-3 py-2.5">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF4500] to-amber-500 text-base shadow">
              ⚡
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-extrabold tracking-tight text-white">
                {activePuzzle.title}
              </h1>
              <p className="truncate text-[11px] text-slate-400">
                r/{subredditName} • u/{player?.username ?? 'redditor'} • 🔥{' '}
                {player?.currentStreak ?? 0}d Streak
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              title={muted ? 'Unmute SFX' : 'Mute SFX'}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700 cursor-pointer"
            >
              {muted ? '🔇' : '🔊'}
            </button>
            <button
              type="button"
              onClick={() => setShowHelp((h) => !h)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              ?
            </button>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="mx-auto mt-2.5 grid max-w-xl grid-cols-3 gap-1.5 rounded-xl bg-slate-950/90 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('play')}
            className={`rounded-lg py-1.5 text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'play'
                ? 'bg-[#FF4500] text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚡ Conduit Grid
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('leaderboard')}
            className={`rounded-lg py-1.5 text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'leaderboard'
                ? 'bg-[#FF4500] text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🏆 Ranks & Guilds
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('forge')}
            className={`rounded-lg py-1.5 text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'forge'
                ? 'bg-[#FF4500] text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🛠️ Blitz & Forge
          </button>
        </div>
      </header>

      {/* Collapsible Quick Rules Drawer */}
      {showHelp && (
        <div className="mx-auto mt-2 w-full max-w-xl px-3">
          <div className="rounded-xl border border-cyan-500/40 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-lg">
            <div className="flex items-center justify-between font-bold text-cyan-300 mb-1">
              <span>How to Play Karma Conduit (60-Second Daily Loop)</span>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <ul className="space-y-1 text-slate-300">
              <li>
                • Tap any unlocked tile to rotate it <strong>90° clockwise</strong>.
              </li>
              <li>
                • Connect the <strong>⚡ Source Core</strong> to all{' '}
                <strong>🎯 3 Subreddit Vaults</strong> simultaneously to clear!
              </li>
              <li>
                • Route power through <strong>💎 Karma Crystals</strong> (+250 pts each) and beat{' '}
                <strong>Par {activePuzzle.parMoves}</strong> for top Guild & Leaderboard rank.
              </li>
              <li>
                • <strong>🔒 Firewall Tiles</strong> are pre-locked clues aligned to the true circuit!
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* MAIN BODY */}
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-3 py-3">
        {activeTab === 'play' && (
          <div className="flex flex-col items-center gap-3">
            {/* Practice Return Pill */}
            {isPracticeMode && dailyPuzzle && (
              <div className="flex w-full items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs">
                <span className="text-amber-200 font-semibold">
                  Practice Mode ({activePuzzle.title})
                </span>
                <button
                  type="button"
                  onClick={() => startBoard(dailyPuzzle, false)}
                  className="rounded-lg bg-amber-400 px-2.5 py-0.5 font-bold text-slate-950 cursor-pointer"
                >
                  Back to Ranked Daily
                </button>
              </div>
            )}

            {/* Live HUD Telemetry */}
            <div className="grid w-full grid-cols-4 gap-2 text-center">
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 py-1.5 px-2">
                <div className="text-[10px] uppercase text-slate-400">Vaults</div>
                <div className="text-sm font-extrabold text-amber-300">
                  {boardEval.poweredVaults}/{boardEval.totalVaults} 🎯
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 py-1.5 px-2">
                <div className="text-[10px] uppercase text-slate-400">Crystals</div>
                <div className="text-sm font-extrabold text-cyan-300">
                  {boardEval.poweredCrystals}/{boardEval.totalCrystals} 💎
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 py-1.5 px-2">
                <div className="text-[10px] uppercase text-slate-400">Moves / Par</div>
                <div
                  className={`text-sm font-extrabold ${
                    moves <= activePuzzle.parMoves ? 'text-emerald-400' : 'text-orange-300'
                  }`}
                >
                  {moves} / {activePuzzle.parMoves}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 py-1.5 px-2">
                <div className="text-[10px] uppercase text-slate-400">Timer</div>
                <div className="text-sm font-extrabold text-white">
                  {mins}:{secs}
                </div>
              </div>
            </div>

            {/* Guild Selector Bar */}
            <div className="flex w-full items-center justify-between gap-1.5 rounded-xl border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-[11px]">
              <span className="text-slate-400 font-medium shrink-0">Your Guild:</span>
              <div className="flex items-center gap-1 overflow-x-auto">
                {(['vanguard', 'architects', 'mystics'] as const).map((gId) => {
                  const g = GUILD_META[gId];
                  const active = guild === gId;
                  return (
                    <button
                      key={gId}
                      type="button"
                      onClick={() => setGuild(gId)}
                      className={`rounded-lg px-2 py-0.5 font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-orange-500/25 text-orange-200 border border-orange-400/60'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {g.badge} {g.name.split(' ')[1]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interactive Conduit Board */}
            <div
              className="grid w-full max-w-[380px] gap-1.5 rounded-2xl border border-slate-800 bg-slate-950 p-2.5 shadow-2xl"
              style={{
                gridTemplateColumns: `repeat(${activePuzzle.gridSize}, minmax(0, 1fr))`,
              }}
            >
              {activePuzzle.tiles.map((tile) => (
                <ConduitTile
                  key={tile.index}
                  tile={tile}
                  rotation={rotations[tile.index] ?? tile.initialRotation}
                  powered={boardEval.poweredIndices.has(tile.index)}
                  hinted={hintedIndex === tile.index}
                  disabled={boardEval.isSolved}
                  onRotate={handleRotateTile}
                />
              ))}
            </div>

            {/* Action Controls OR Solved Victory Panel */}
            {!boardEval.isSolved ? (
              <div className="flex w-full max-w-[380px] items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-900 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  ↩ Undo
                </button>
                <button
                  type="button"
                  onClick={handleHint}
                  className="flex-1 rounded-xl border border-cyan-500/40 bg-cyan-950/50 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-900/50 cursor-pointer"
                >
                  💡 Hint (-120)
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-900 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  🔄 Reset
                </button>
              </div>
            ) : (
              <div className="w-full max-w-[380px] rounded-2xl border border-amber-400/60 bg-gradient-to-b from-slate-900 to-slate-950 p-4 text-center shadow-[0_0_25px_rgba(250,204,21,0.2)]">
                <div className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                  {boardEval.isPerfectClear
                    ? '🌟 PERFECT FULL-CRYSTAL OVERCHARGE!'
                    : '🏆 ALL 3 SUBREDDIT VAULTS POWERED!'}
                </div>
                <div className="mt-1 text-3xl font-black text-white">
                  {submitting ? 'Syncing...' : `${lastClearScore ?? 0} pts`}
                </div>
                <div className="mt-1 text-xs text-slate-300">
                  {moves} moves (Par {activePuzzle.parMoves}) • {mins}:{secs} •{' '}
                  {boardEval.poweredCrystals}/{boardEval.totalCrystals} 💎
                  {lastRank ? ` • Ranked #${lastRank} Today` : ''}
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  {!isPracticeMode && (
                    <button
                      type="button"
                      disabled={sharing}
                      onClick={() => void handleShareToRedditComments()}
                      className="w-full rounded-xl bg-gradient-to-r from-[#FF4500] to-amber-500 py-2.5 text-xs font-extrabold text-white shadow-lg hover:opacity-95 disabled:opacity-60 cursor-pointer"
                    >
                      {sharing
                        ? 'Posting to Reddit Thread...'
                        : player?.sharedCommentToday
                          ? '✅ Shared to Thread (Tap to Copy Grid)'
                          : '💬 Post Spoiler-Free Grid to Reddit Comments'}
                    </button>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyMarkdown()}
                      className="rounded-xl border border-slate-700 bg-slate-800 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
                    >
                      📋 Copy Grid
                    </button>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="rounded-xl border border-slate-700 bg-slate-800 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
                    >
                      🔁 Optimize
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLaunchBlitz(5)}
                      className="rounded-xl border border-cyan-500/40 bg-cyan-950/60 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-900/60 cursor-pointer"
                    >
                      ♾️ Next Blitz
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="flex flex-col gap-3">
            {/* Subreddit Co-Op Milestone */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white">
                  ⚡ r/{subredditName} Daily Overcharge Goal
                </span>
                <span className="font-bold text-orange-400">
                  {community?.totalEnergyToday ?? 0} / {community?.dailyGoalEnergy ?? 15000}
                </span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#FF4500] via-amber-400 to-cyan-400 transition-all duration-500"
                  style={{ width: `${Math.max(4, communityPct)}%` }}
                />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                {(['vanguard', 'architects', 'mystics'] as const).map((gId) => (
                  <div
                    key={gId}
                    className="rounded-xl border border-slate-800 bg-slate-950/80 p-2"
                  >
                    <div className="font-bold text-slate-200">
                      {GUILD_META[gId].badge} {GUILD_META[gId].name.split(' ')[1]}
                    </div>
                    <div className="mt-0.5 text-amber-300 font-extrabold">
                      {community?.guildScores[gId] ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top 10 Daily Players */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-white">
                  🏆 Today&apos;s Top Conduit Architects
                </h2>
                <span className="text-xs text-slate-400">
                  {community?.solversToday ?? 0} total clears
                </span>
              </div>

              {leaderboard.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  No ranked clears recorded yet today — solve the grid to claim #1!
                </p>
              ) : (
                <div className="space-y-1.5">
                  {leaderboard.map((entry) => (
                    <div
                      key={entry.username}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs ${
                        entry.username === player?.username
                          ? 'border border-orange-500/60 bg-orange-500/15'
                          : 'bg-slate-950/70 border border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 font-black text-amber-300">
                          #{entry.rank}
                        </span>
                        <span>{GUILD_META[entry.guild].badge}</span>
                        <span className="truncate font-bold text-white">
                          u/{entry.username}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-slate-400">
                          {entry.moves}m • {entry.crystals}💎
                        </span>
                        <span className="font-extrabold text-orange-300">
                          {entry.score}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'forge' && (
          <div className="flex flex-col gap-3">
            {/* Unlimited Blitz Practice */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
              <h2 className="text-sm font-extrabold text-white">
                ♾️ Blitz Practice Lab (Unlimited Replayability)
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Finished today&apos;s official puzzle? Sharpen your routing speed on fresh procedural boards anytime.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleLaunchBlitz(4)}
                  className="rounded-xl border border-cyan-500/40 bg-cyan-950/50 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-900/50 cursor-pointer"
                >
                  ⚡ Play 4×4 Warmup Blitz
                </button>
                <button
                  type="button"
                  onClick={() => handleLaunchBlitz(5)}
                  className="rounded-xl border border-orange-500/50 bg-orange-950/40 py-2.5 text-xs font-bold text-orange-300 hover:bg-orange-900/40 cursor-pointer"
                >
                  🔥 Play 5×5 Master Blitz
                </button>
              </div>
            </div>

            {/* UGC Community Challenge Post Spawner */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
              <h2 className="text-sm font-extrabold text-white">
                🛠️ Community Vault Forge (Publish to r/{subredditName})
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Mint a custom seeded Karma Conduit post in this subreddit with your username credited as Architect!
              </p>

              <div className="mt-3 space-y-2.5 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Challenge Title
                  </label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Can anyone beat my 8-move Vault?"
                    maxLength={85}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none select-text"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Seed Keyword
                    </label>
                    <input
                      type="text"
                      value={customCode}
                      onChange={(e) => setCustomCode(e.target.value)}
                      placeholder="cyber-snoo-99"
                      maxLength={24}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none select-text"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Grid Size
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {([4, 5] as const).map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setCustomGridSize(sz)}
                          className={`rounded-xl py-2 font-bold border cursor-pointer ${
                            customGridSize === sz
                              ? 'border-orange-500 bg-orange-500/20 text-orange-200'
                              : 'border-slate-700 bg-slate-950 text-slate-400'
                          }`}
                        >
                          {sz}×{sz}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={creatingChallenge}
                  onClick={() => void handleMintCommunityPost()}
                  className="mt-1 w-full rounded-xl bg-gradient-to-r from-[#FF4500] to-amber-500 py-2.5 font-extrabold text-white shadow-lg hover:opacity-95 disabled:opacity-60 cursor-pointer"
                >
                  {creatingChallenge
                    ? 'Publishing Interactive Post...'
                    : '🚀 Publish Custom Conduit Post to Subreddit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
