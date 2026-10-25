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
