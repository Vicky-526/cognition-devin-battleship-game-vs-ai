import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, FLEET } from '../js/engine.js';
import { AIPlayer } from '../js/ai.js';
import { Game } from '../js/game.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function playOut(difficulty, seed) {
  const rng = seeded(seed);
  const board = new Board();
  board.randomize(FLEET, rng);
  const ai = new AIPlayer(difficulty, { rng });
  const seen = new Set();
  let shots = 0;
  while (!board.allSunk()) {
    const [r, c] = ai.nextShot();
    const key = `${r},${c}`;
    assert.ok(!seen.has(key), `${difficulty} AI repeated ${key}`);
    assert.ok(board.inBounds(r, c), `${difficulty} AI fired out of bounds`);
    seen.add(key);
    ai.record(r, c, board.receiveShot(r, c));
    shots++;
    assert.ok(shots <= 100, 'AI must finish within 100 shots');
  }
  return shots;
}

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`${difficulty} AI never repeats and always finishes`, () => {
    for (let seed = 1; seed <= 300; seed++) playOut(difficulty, seed);
  });
}

test('harder AIs need fewer shots on average', () => {
  const avg = (d) => {
    let total = 0;
    for (let seed = 1; seed <= 300; seed++) total += playOut(d, seed);
    return total / 300;
  };
  const easy = avg('easy');
  const normal = avg('normal');
  const hard = avg('hard');
  assert.ok(normal < easy, `normal (${normal}) should beat easy (${easy})`);
  assert.ok(hard < normal, `hard (${hard}) should beat normal (${normal})`);
});

test('AI follows up a hit with an adjacent shot', () => {
  for (const difficulty of ['normal', 'hard']) {
    const ai = new AIPlayer(difficulty, { rng: seeded(7) });
    ai.record(4, 4, { result: 'hit' });
    const [r, c] = ai.nextShot();
    assert.equal(Math.abs(r - 4) + Math.abs(c - 4), 1, `${difficulty} should target a neighbour`);
  }
});

test('Game enforces turn order and placement', () => {
  const game = new Game({ rng: seeded(3) });
  assert.throws(() => game.start(), /Place all ships/);
  assert.equal(game.playerFire(0, 0).result, 'invalid');
  game.player.randomize(FLEET, seeded(4));
  game.start();
  const first = game.playerFire(0, 0);
  assert.notEqual(first.result, 'invalid');
  assert.equal(game.turn, 'ai');
  assert.equal(game.playerFire(0, 1).result, 'invalid', 'player cannot fire twice in a row');
  game.aiFire();
  assert.equal(game.turn, 'player');
  assert.equal(game.playerFire(0, 0).result, 'invalid', 'cannot re-fire on the same cell');
  assert.equal(game.turn, 'player', 'invalid shot keeps the turn');
});

test('Game reaches a winner and stops accepting shots', () => {
  const game = new Game({ difficulty: 'hard', rng: seeded(11) });
  game.player.randomize(FLEET, seeded(12));
  game.start();
  const queue = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) queue.push([r, c]);
  while (game.phase === 'battle') {
    const [r, c] = queue.shift();
    game.playerFire(r, c);
    if (game.phase === 'battle') game.aiFire();
  }
  assert.ok(['player', 'ai'].includes(game.winner));
  assert.equal(game.playerFire(9, 9).result, 'invalid');
  assert.equal(game.aiFire().result, 'invalid');
});

test('plan() exposes a normalised heat map consistent with the chosen shot', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const rng = seeded(21);
    const board = new Board();
    board.randomize(FLEET, rng);
    const ai = new AIPlayer(difficulty, { rng });
    for (let turn = 0; turn < 40 && !board.allSunk(); turn++) {
      const { shot, heat } = ai.plan();
      assert.equal(heat.length, 100);
      assert.ok(heat.every((h) => h >= 0 && h <= 1), `${difficulty} heat must be in 0..1`);
      assert.equal(Math.max(...heat), 1, `${difficulty} heat must be normalised`);
      const [r, c] = shot;
      assert.ok(heat[r * 10 + c] > 0, `${difficulty} shot must be on a highlighted cell`);
      if (difficulty === 'hard') assert.equal(heat[r * 10 + c], 1, 'hard fires at the hottest cell');
      for (let i = 0; i < 100; i++) {
        if (ai.state[i] !== 0) assert.equal(heat[i], 0, 'already-fired cells have no heat');
      }
      ai.record(r, c, board.receiveShot(r, c));
    }
  }
});

test('Game fires at the cell it planned (the one shown in the heat map)', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const game = new Game({ difficulty, rng: seeded(5) });
    assert.equal(game.planAiTurn(), null, 'no plan before the battle starts');
    game.player.randomize(FLEET, seeded(6));
    game.start();
    for (let i = 0; i < 40 && game.phase === 'battle'; i++) {
      const preview = game.planAiTurn();
      assert.ok(preview, 'the next AI move is visible during the player turn');
      game.playerFire(Math.floor(i / 10), i % 10);
      if (game.phase !== 'battle') break;
      const plan = game.planAiTurn();
      assert.strictEqual(plan, preview, 'the player shot does not change the AI plan');
      const outcome = game.aiFire();
      assert.deepEqual([outcome.r, outcome.c], plan.shot);
      assert.strictEqual(outcome.plan, plan);
      if (game.phase === 'battle') assert.notStrictEqual(game.planAiTurn(), plan, 'a fresh plan follows each AI shot');
    }
    game.finish('player');
    assert.equal(game.planAiTurn(), null, 'no plan once the game is over');
  }
});
