import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShareMarkdown,
  calculateScore,
  evaluateBoardState,
  generatePuzzleFromSeed,
  getDailyEditionNumber,
  getPreviousUtcDateKey,
  getTileConnectionsMask,
  toRotation,
} from '../src/shared/puzzleEngine.ts';

describe('Karma Conduit — Deterministic Daily Puzzle Engine', () => {
  it('generates identical puzzles for the same UTC date seed and distinct boards across days', () => {
    const dayA1 = generatePuzzleFromSeed({ seedKey: '2026-11-24', gridSize: 5 });
    const dayA2 = generatePuzzleFromSeed({ seedKey: '2026-11-24', gridSize: 5 });
    const dayB = generatePuzzleFromSeed({ seedKey: '2026-11-25', gridSize: 5 });

    assert.deepEqual(dayA1, dayA2);
    assert.notDeepEqual(
      dayA1.tiles.map((t) => t.initialRotation),
      dayB.tiles.map((t) => t.initialRotation)
    );
    assert.equal(getDailyEditionNumber('2026-11-11'), 1);
    assert.equal(getDailyEditionNumber('2026-11-24'), 14);
    assert.equal(getPreviousUtcDateKey('2026-12-01'), '2026-11-30');
  });

  it('guarantees 100% solvability (all 3 Vaults + Crystals powered) across 45 consecutive daily seeds', () => {
    for (let day = 1; day <= 45; day += 1) {
      const seedKey = `2026-11-${String((day % 28) + 1).padStart(2, '0')}-run-${day}`;
      const puzzle = generatePuzzleFromSeed({ seedKey, gridSize: 5 });

      assert.equal(puzzle.tiles.length, 25);
      const initialEval = evaluateBoardState(
        puzzle,
        puzzle.tiles.map((t) => t.initialRotation)
      );
      assert.equal(
        initialEval.isSolved,
        false,
        `Seed ${seedKey} should require player moves before being solved`
      );

      const solvedEval = evaluateBoardState(
        puzzle,
        puzzle.tiles.map((t) => t.solutionRotation)
      );
      assert.equal(solvedEval.totalVaults, 3);
      assert.equal(solvedEval.poweredVaults, 3);
      assert.equal(solvedEval.isSolved, true);
      assert.equal(solvedEval.isPerfectClear, true);
    }
  });

  it('supports 4x4 Warmup / Blitz puzzles with guaranteed solvability', () => {
    const blitz = generatePuzzleFromSeed({ seedKey: 'blitz-alpha', gridSize: 4 });
    assert.equal(blitz.tiles.length, 16);
    const solved = evaluateBoardState(
      blitz,
      blitz.tiles.map((t) => t.solutionRotation)
    );
    assert.equal(solved.isSolved, true);
    assert.equal(solved.poweredCrystals, 1);
  });

  it('rotates tile connection bitmasks clockwise accurately', () => {
    assert.equal(getTileConnectionsMask('straight', toRotation(0)), 5);
    assert.equal(getTileConnectionsMask('straight', toRotation(1)), 10);
    assert.equal(getTileConnectionsMask('straight', toRotation(2)), 5);
    assert.equal(getTileConnectionsMask('corner', toRotation(0)), 3);
    assert.equal(getTileConnectionsMask('corner', toRotation(1)), 6);
    assert.equal(getTileConnectionsMask('corner', toRotation(2)), 12);
    assert.equal(getTileConnectionsMask('corner', toRotation(3)), 9);
  });

  it('rewards under-par moves, crystal relays, and speed while penalizing hints', () => {
    const perfectFast = calculateScore({
      moves: 7,
      parMoves: 10,
      poweredCrystals: 2,
      elapsedSeconds: 25,
      hintsUsed: 0,
    });
    const slowHinted = calculateScore({
      moves: 16,
      parMoves: 10,
      poweredCrystals: 0,
      elapsedSeconds: 180,
      hintsUsed: 2,
    });
    assert.ok(perfectFast > slowHinted);
    assert.ok(perfectFast >= 2200);
    assert.ok(slowHinted >= 250);
  });

  it('formats spoiler-free Reddit Markdown share cards with 5x5 emoji rows', () => {
    const puzzle = generatePuzzleFromSeed({ seedKey: '2026-11-24', gridSize: 5 });
    const markdown = buildShareMarkdown({
      puzzle,
      rotations: puzzle.tiles.map((t) => t.solutionRotation),
      moves: puzzle.parMoves - 1,
      elapsedSeconds: 42,
      score: 2150,
      streak: 5,
      guild: 'architects',
    });
    assert.match(markdown, /Karma Conduit/);
    assert.match(markdown, /Karma Architects/);
    assert.match(markdown, /🏆/);
    assert.match(markdown, /🟠/);
  });
});
