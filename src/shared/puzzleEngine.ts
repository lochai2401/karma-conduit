import type {
  DailyPuzzleSpec,
  GuildId,
  NodeRole,
  PuzzleTile,
  Rotation,
  TileKind,
} from './api';

// Directional bitmasks: North = 1, East = 2, South = 4, West = 8
export const DIR_N = 1;
export const DIR_E = 2;
export const DIR_S = 4;
export const DIR_W = 8;

const BASE_MASKS: Record<TileKind, number> = {
  straight: DIR_N | DIR_S, // 5
  corner: DIR_N | DIR_E, // 3
  tee: DIR_N | DIR_E | DIR_S, // 7
  cross: DIR_N | DIR_E | DIR_S | DIR_W, // 15
};

const LAUNCH_EPOCH_UTC_MS = Date.UTC(2026, 10, 11); // Nov 11, 2026 (Hackathon Launch Day #1)

export const GUILD_META: Record<
  GuildId,
  { name: string; badge: string; tagline: string }
> = {
  vanguard: {
    name: 'Upvote Vanguard',
    badge: '🔥',
    tagline: 'High-voltage frontpage strikers',
  },
  architects: {
    name: 'Karma Architects',
    badge: '⚡',
    tagline: 'Precision minimal-move engineers',
  },
  mystics: {
    name: 'Nightmode Mystics',
    badge: '🌙',
    tagline: 'Full-crystal deep-grid explorers',
  },
};

export function getUtcDateKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getPreviousUtcDateKey(dateKey: string): string {
  const parts = dateKey.split('-').map((p) => Number(p));
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return getUtcDateKey(prev);
}

export function getDailyEditionNumber(dateKey: string): number {
  const parts = dateKey.split('-').map((p) => Number(p));
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 11;
  const d = parts[2] ?? 24;
  const currentMs = Date.UTC(y, m - 1, d);
  const diffDays = Math.floor((currentMs - LAUNCH_EPOCH_UTC_MS) / 86_400_000);
  return Math.max(1, diffDays + 1);
}

export function hashStringToSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function toRotation(value: number): Rotation {
  const mod = ((Math.trunc(value) % 4) + 4) % 4;
  if (mod === 1) return 1;
  if (mod === 2) return 2;
  if (mod === 3) return 3;
  return 0;
}

export function rotateMaskClockwise(mask: number, steps: Rotation): number {
  let current = mask & 15;
  for (let i = 0; i < steps; i += 1) {
    const n = (current & DIR_N) !== 0 ? DIR_E : 0;
    const e = (current & DIR_E) !== 0 ? DIR_S : 0;
    const s = (current & DIR_S) !== 0 ? DIR_W : 0;
    const w = (current & DIR_W) !== 0 ? DIR_N : 0;
    current = n | e | s | w;
  }
  return current;
}

export function getTileConnectionsMask(kind: TileKind, rotation: Rotation): number {
  return rotateMaskClockwise(BASE_MASKS[kind], rotation);
}

function deriveTileFromMask(
  mask: number,
  rng: () => number
): { kind: TileKind; rotation: Rotation } {
  const cleanMask = mask & 15;
  const candidates: TileKind[] = ['straight', 'corner', 'tee', 'cross'];
  for (const kind of candidates) {
    const rotations: Rotation[] = [0, 1, 2, 3];
    for (const rot of rotations) {
      if (getTileConnectionsMask(kind, rot) === cleanMask) {
        return { kind, rotation: rot };
      }
    }
  }
  // Degree-1 endpoint: upgrade into a corner or straight so every tile has >=2 ports and meaningful rotation!
  const extraDirs = [DIR_N, DIR_E, DIR_S, DIR_W].filter((d) => (cleanMask & d) === 0);
  const pickDir = extraDirs[Math.floor(rng() * extraDirs.length)] ?? DIR_E;
  const upgraded = cleanMask | pickDir;
  for (const kind of candidates) {
    const rotations: Rotation[] = [0, 1, 2, 3];
    for (const rot of rotations) {
      if (getTileConnectionsMask(kind, rot) === upgraded) {
        return { kind, rotation: rot };
      }
    }
  }
  return { kind: 'tee', rotation: 0 };
}

type Coord = { row: number; col: number };

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function getNeighbors(
  coord: Coord,
  gridSize: number
): Array<{ next: Coord; outDir: number; inDir: number }> {
  const list: Array<{ next: Coord; outDir: number; inDir: number }> = [];
  if (coord.row > 0) {
    list.push({
      next: { row: coord.row - 1, col: coord.col },
      outDir: DIR_N,
      inDir: DIR_S,
    });
  }
  if (coord.col < gridSize - 1) {
    list.push({
      next: { row: coord.row, col: coord.col + 1 },
      outDir: DIR_E,
      inDir: DIR_W,
    });
  }
  if (coord.row < gridSize - 1) {
    list.push({
      next: { row: coord.row + 1, col: coord.col },
      outDir: DIR_S,
      inDir: DIR_N,
    });
  }
  if (coord.col > 0) {
    list.push({
      next: { row: coord.row, col: coord.col - 1 },
      outDir: DIR_W,
      inDir: DIR_E,
    });
  }
  return list;
}

export type BoardEvaluation = {
  poweredIndices: Set<number>;
  poweredVaults: number;
  totalVaults: number;
  poweredCrystals: number;
  totalCrystals: number;
  isSolved: boolean;
  isPerfectClear: boolean;
};

export function evaluateBoardState(
  puzzle: DailyPuzzleSpec,
  rotations: readonly number[]
): BoardEvaluation {
  const { gridSize, tiles } = puzzle;
  const poweredIndices = new Set<number>();
  const sourceTile = tiles.find((t) => t.role === 'source');

  let totalVaults = 0;
  let totalCrystals = 0;
  for (const tile of tiles) {
    if (tile.role === 'vault') totalVaults += 1;
    if (tile.role === 'crystal') totalCrystals += 1;
  }

  if (!sourceTile) {
    return {
      poweredIndices,
      poweredVaults: 0,
      totalVaults,
      poweredCrystals: 0,
      totalCrystals,
      isSolved: false,
      isPerfectClear: false,
    };
  }

  const queue: number[] = [sourceTile.index];
  poweredIndices.add(sourceTile.index);

  while (queue.length > 0) {
    const currentIdx = queue.shift();
    if (currentIdx === undefined) break;
    const currentTile = tiles[currentIdx];
    if (!currentTile) continue;

    const currentRot = currentTile.locked
      ? currentTile.solutionRotation
      : toRotation(rotations[currentIdx] ?? currentTile.initialRotation);
    const currentMask = getTileConnectionsMask(currentTile.kind, currentRot);

    const neighbors = getNeighbors(
      { row: currentTile.row, col: currentTile.col },
      gridSize
    );
    for (const { next, outDir, inDir } of neighbors) {
      if ((currentMask & outDir) === 0) continue;
      const nextIdx = next.row * gridSize + next.col;
      if (poweredIndices.has(nextIdx)) continue;
      const nextTile = tiles[nextIdx];
      if (!nextTile) continue;
      const nextRot = nextTile.locked
        ? nextTile.solutionRotation
        : toRotation(rotations[nextIdx] ?? nextTile.initialRotation);
      const nextMask = getTileConnectionsMask(nextTile.kind, nextRot);
      if ((nextMask & inDir) !== 0) {
        poweredIndices.add(nextIdx);
        queue.push(nextIdx);
      }
    }
  }

  let poweredVaults = 0;
  let poweredCrystals = 0;
  for (const tile of tiles) {
    if (!poweredIndices.has(tile.index)) continue;
    if (tile.role === 'vault') poweredVaults += 1;
    if (tile.role === 'crystal') poweredCrystals += 1;
  }

  const isSolved = totalVaults > 0 && poweredVaults === totalVaults;
  const isPerfectClear = isSolved && poweredCrystals === totalCrystals;

  return {
    poweredIndices,
    poweredVaults,
    totalVaults,
    poweredCrystals,
    totalCrystals,
    isSolved,
    isPerfectClear,
  };
}

function minClicksToMatchMask(
  kind: TileKind,
  fromRot: Rotation,
  targetRot: Rotation
): number {
  const targetMask = getTileConnectionsMask(kind, targetRot);
  for (let clicks = 0; clicks < 4; clicks += 1) {
    const nextRot = toRotation(fromRot + clicks);
    if (getTileConnectionsMask(kind, nextRot) === targetMask) {
      return clicks;
    }
  }
  return 0;
}

export function generatePuzzleFromSeed(options: {
  seedKey: string;
  gridSize?: 4 | 5;
  title?: string;
  author?: string;
  isCustomPost?: boolean;
}): DailyPuzzleSpec {
  const gridSize = options.gridSize ?? 5;
  const totalCells = gridSize * gridSize;
  const rng = createMulberry32(hashStringToSeed(`karma-conduit:${gridSize}:${options.seedKey}`));

  // 1. Place Source on left/top perimeter for clear visual flow
  const sourceCandidates: Coord[] = [
    { row: 0, col: 0 },
    { row: Math.floor(gridSize / 2), col: 0 },
    { row: 0, col: Math.floor(gridSize / 2) },
  ];
  const sourceCoord =
    sourceCandidates[Math.floor(rng() * sourceCandidates.length)] ?? { row: 0, col: 0 };
  const sourceIdx = sourceCoord.row * gridSize + sourceCoord.col;

  // 2. Choose 3 Vaults (farther from source) and 2 Crystals (mid-field)
  const allCoords: Coord[] = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      if (row === sourceCoord.row && col === sourceCoord.col) continue;
      allCoords.push({ row, col });
    }
  }

  // Deterministic Fisher-Yates shuffle
  for (let i = allCoords.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = allCoords[i];
    const other = allCoords[j];
    if (tmp && other) {
      allCoords[i] = other;
      allCoords[j] = tmp;
    }
  }

  const farCoords = allCoords.filter((c) => manhattan(c, sourceCoord) >= gridSize - 1);
  const vaultCoords: Coord[] = [];
  for (const candidate of farCoords) {
    if (vaultCoords.length >= 3) break;
    if (vaultCoords.every((v) => manhattan(v, candidate) >= 2)) {
      vaultCoords.push(candidate);
    }
  }
  for (const candidate of allCoords) {
    if (vaultCoords.length >= 3) break;
    if (!vaultCoords.some((v) => v.row === candidate.row && v.col === candidate.col)) {
      vaultCoords.push(candidate);
    }
  }

  const crystalCount = gridSize >= 5 ? 2 : 1;
  const crystalCoords: Coord[] = [];
  for (const candidate of allCoords) {
    if (crystalCoords.length >= crystalCount) break;
    const usedInVault = vaultCoords.some(
      (v) => v.row === candidate.row && v.col === candidate.col
    );
    if (!usedInVault && manhattan(candidate, sourceCoord) >= 2) {
      crystalCoords.push(candidate);
    }
  }

  const roleByIndex = new Map<number, NodeRole>();
  roleByIndex.set(sourceIdx, 'source');
  for (const v of vaultCoords) {
    roleByIndex.set(v.row * gridSize + v.col, 'vault');
  }
  for (const c of crystalCoords) {
    roleByIndex.set(c.row * gridSize + c.col, 'crystal');
  }

  // 3. Build a connected tree linking Source -> every Vault and Crystal via guided random walks
  const maskByIndex = new Array<number>(totalCells).fill(0);
  const treeNodes = new Set<number>([sourceIdx]);
  const targets = [...vaultCoords, ...crystalCoords];

  for (const target of targets) {
    const targetIdx = target.row * gridSize + target.col;
    if (treeNodes.has(targetIdx)) continue;

    // Connect target back to the closest/random existing tree node via a winding Manhattan walk
    const treeArray = Array.from(treeNodes);
    const anchorIdx =
      treeArray[Math.floor(rng() * treeArray.length)] ?? sourceIdx;
    let curRow = Math.floor(anchorIdx / gridSize);
    let curCol = anchorIdx % gridSize;

    while (curRow !== target.row || curCol !== target.col) {
      const canMoveRow = curRow !== target.row;
      const canMoveCol = curCol !== target.col;
      const moveRow =
        canMoveRow && (!canMoveCol || rng() < 0.5);

      const prevIdx = curRow * gridSize + curCol;
      if (moveRow) {
        const step = target.row > curRow ? 1 : -1;
        const outDir = step === 1 ? DIR_S : DIR_N;
        const inDir = step === 1 ? DIR_N : DIR_S;
        curRow += step;
        const nextIdx = curRow * gridSize + curCol;
        maskByIndex[prevIdx] = (maskByIndex[prevIdx] ?? 0) | outDir;
        maskByIndex[nextIdx] = (maskByIndex[nextIdx] ?? 0) | inDir;
        treeNodes.add(nextIdx);
      } else {
        const step = target.col > curCol ? 1 : -1;
        const outDir = step === 1 ? DIR_E : DIR_W;
        const inDir = step === 1 ? DIR_W : DIR_E;
        curCol += step;
        const nextIdx = curRow * gridSize + curCol;
        maskByIndex[prevIdx] = (maskByIndex[prevIdx] ?? 0) | outDir;
        maskByIndex[nextIdx] = (maskByIndex[nextIdx] ?? 0) | inDir;
        treeNodes.add(nextIdx);
      }
    }
  }

  // 4. Pick 2 strategic non-cross path tiles as Firewall Anchors (locked clues)
  const lockCandidates = Array.from(treeNodes).filter((idx) => {
    const role = roleByIndex.get(idx) ?? 'none';
    const mask = maskByIndex[idx] ?? 0;
    return role === 'none' && mask !== 15;
  });
  const lockedSet = new Set<number>();
  const targetLocks = Math.min(gridSize >= 5 ? 2 : 1, lockCandidates.length);
  for (let i = 0; i < targetLocks; i += 1) {
    const pick = lockCandidates[Math.floor(rng() * lockCandidates.length)];
    if (pick !== undefined) {
      lockedSet.add(pick);
    }
  }

  // 5. Materialize every cell into a PuzzleTile and scramble unlocked tiles
  const decoyKinds: TileKind[] = ['corner', 'straight', 'tee', 'corner'];
  const tiles: PuzzleTile[] = [];
  let essentialClicks = 0;

  for (let idx = 0; idx < totalCells; idx += 1) {
    const row = Math.floor(idx / gridSize);
    const col = idx % gridSize;
    const role = roleByIndex.get(idx) ?? 'none';
    const locked = lockedSet.has(idx);
    const mask = maskByIndex[idx] ?? 0;

    let kind: TileKind;
    let solutionRotation: Rotation;

    if (mask > 0) {
      const derived = deriveTileFromMask(mask, rng);
      kind = derived.kind;
      solutionRotation = derived.rotation;
    } else {
      kind = decoyKinds[Math.floor(rng() * decoyKinds.length)] ?? 'corner';
      solutionRotation = toRotation(Math.floor(rng() * 4));
    }

    let initialRotation: Rotation = solutionRotation;
    if (!locked && kind !== 'cross') {
      const deltaOptions: Rotation[] =
        kind === 'straight' ? [1, 3] : [1, 2, 3];
      const delta =
        deltaOptions[Math.floor(rng() * deltaOptions.length)] ?? 1;
      // Scramble all path tiles and ~70% of decoy tiles
      if (mask > 0 || rng() < 0.7) {
        initialRotation = toRotation(solutionRotation + delta);
      }
    }

    if (mask > 0 && !locked) {
      essentialClicks += minClicksToMatchMask(kind, initialRotation, solutionRotation);
    }

    tiles.push({
      index: idx,
      row,
      col,
      kind,
      role,
      locked,
      initialRotation,
      solutionRotation,
    });
  }

  const editionNumber = getDailyEditionNumber(options.seedKey);
  const parMoves = Math.max(4, essentialClicks + 2);
  const puzzle: DailyPuzzleSpec = {
    seedKey: options.seedKey,
    editionNumber,
    title: options.title ?? `Daily Conduit #${editionNumber}`,
    gridSize,
    parMoves,
    author: options.author ?? 'AutoMod Relay',
    isCustomPost: options.isCustomPost ?? false,
    tiles,
  };

  // Guarantee initial board is not already solved on spawn
  const initialRotations = puzzle.tiles.map((t) => t.initialRotation);
  if (evaluateBoardState(puzzle, initialRotations).isSolved) {
    const firstRotatable = puzzle.tiles.find(
      (t) => !t.locked && t.kind !== 'cross' && treeNodes.has(t.index)
    );
    if (firstRotatable) {
      firstRotatable.initialRotation = toRotation(firstRotatable.solutionRotation + 1);
    }
  }

  return puzzle;
}

export function calculateScore(params: {
  moves: number;
  parMoves: number;
  poweredCrystals: number;
  elapsedSeconds: number;
  hintsUsed: number;
}): number {
  const base = 1000;
  const parDelta = params.parMoves - params.moves;
  const parBonus = Math.max(0, Math.min(750, 450 + parDelta * 45));
  const crystalBonus = params.poweredCrystals * 250;
  const speedBonus = Math.max(0, 360 - Math.min(360, Math.floor(params.elapsedSeconds) * 2));
  const hintPenalty = params.hintsUsed * 120;
  return Math.max(250, base + parBonus + crystalBonus + speedBonus - hintPenalty);
}

export function buildShareMarkdown(params: {
  puzzle: DailyPuzzleSpec;
  rotations: readonly number[];
  moves: number;
  elapsedSeconds: number;
  score: number;
  streak: number;
  guild: GuildId;
}): string {
  const evalResult = evaluateBoardState(params.puzzle, params.rotations);
  const { gridSize, tiles } = params.puzzle;
  const rows: string[] = [];

  for (let r = 0; r < gridSize; r += 1) {
    let line = '';
    for (let c = 0; c < gridSize; c += 1) {
      const idx = r * gridSize + c;
      const tile = tiles[idx];
      const powered = evalResult.poweredIndices.has(idx);
      if (!tile) {
        line += '⬛';
      } else if (tile.role === 'source') {
        line += '🟠';
      } else if (tile.role === 'vault') {
        line += powered ? '🏆' : '🔒';
      } else if (tile.role === 'crystal') {
        line += powered ? '💎' : '🔹';
      } else {
        line += powered ? '⚡' : '⬛';
      }
    }
    rows.push(line);
  }

  const guildInfo = GUILD_META[params.guild];
  const mins = Math.floor(params.elapsedSeconds / 60);
  const secs = String(Math.floor(params.elapsedSeconds) % 60).padStart(2, '0');
  const parDiff = params.moves - params.puzzle.parMoves;
  const parLabel =
    parDiff <= 0 ? `${parDiff === 0 ? 'Even' : parDiff} vs Par` : `+${parDiff} vs Par`;

  return [
    `**⚡ Karma Conduit — ${params.puzzle.title}**`,
    `${guildInfo.badge} *${guildInfo.name}* • Score: **${params.score}** • 🔥 Streak: **${params.streak}**`,
    `🛠️ Moves: **${params.moves}** (${parLabel}) • ⏱️ **${mins}:${secs}** • 💎 **${evalResult.poweredCrystals}/${evalResult.totalCrystals}**`,
    '',
    ...rows,
  ].join('\n');
}
