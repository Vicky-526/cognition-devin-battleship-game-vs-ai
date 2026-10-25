import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, FLEET, coordLabel } from '../js/engine.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test('coordLabel uses column letter and 1-based row', () => {
  assert.equal(coordLabel(0, 0), 'A1');
  assert.equal(coordLabel(9, 9), 'J10');
});

test('ships cannot go out of bounds or overlap', () => {
  const b = new Board();
  assert.equal(b.canPlace(0, 6, 5, true), false);
  assert.equal(b.canPlace(0, 5, 5, true), true);
  assert.equal(b.canPlace(6, 0, 5, false), false);
  b.place(FLEET[0], 0, 0, true);
  assert.equal(b.canPlace(0, 4, 2, false), false);
  assert.throws(() => b.place(FLEET[1], 0, 2, false));
  assert.throws(() => b.place(FLEET[0], 5, 5, true), /already placed/);
});

test('remove frees cells for re-placement', () => {
  const b = new Board();
  b.place(FLEET[0], 0, 0, true);
  b.remove('carrier');
  assert.equal(b.shipAt(0, 0), null);
  assert.doesNotThrow(() => b.place(FLEET[0], 0, 0, false));
});

test('randomize places a full, non-overlapping fleet', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const b = new Board();
    b.randomize(FLEET, seeded(seed));
    assert.ok(b.isComplete());
    const occupied = b.grid.filter((x) => x !== null).length;
    assert.equal(occupied, FLEET.reduce((n, s) => n + s.length, 0));
    for (const ship of b.ships) {
      for (const [r, c] of ship.cells) assert.ok(b.inBounds(r, c));
    }
  }
});

test('receiveShot reports miss, hit, sunk and rejects repeats', () => {
  const b = new Board();
  b.place(FLEET[4], 0, 0, true); // destroyer A1-B1
  assert.equal(b.receiveShot(5, 5).result, 'miss');
  assert.equal(b.receiveShot(5, 5).result, 'repeat');
  assert.equal(b.receiveShot(0, 0).result, 'hit');
  assert.equal(b.receiveShot(0, 0).result, 'repeat');
  assert.equal(b.ships[0].hits, 1, 'repeat shot must not add a hit');
  const sunk = b.receiveShot(0, 1);
  assert.equal(sunk.result, 'sunk');
  assert.equal(sunk.ship.id, 'destroyer');
  assert.ok(b.allSunk());
});

test('out-of-bounds shots throw', () => {
  const b = new Board();
  assert.throws(() => b.receiveShot(10, 0), RangeError);
  assert.throws(() => b.receiveShot(-1, 0), RangeError);
});

test('empty board is not considered all sunk', () => {
  assert.equal(new Board().allSunk(), false);
});
