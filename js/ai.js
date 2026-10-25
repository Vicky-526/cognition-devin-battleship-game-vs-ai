import { SIZE, FLEET, randomInt } from './engine.js';

const UNKNOWN = 0;
const MISS = 1;
const HIT = 2;
const SUNK = 3;

export const DIFFICULTIES = Object.freeze({
  easy: 'Easy — mostly random shots',
  normal: 'Normal — hunts, then targets hits',
  hard: 'Hard — probability heat-map',
});

export class AIPlayer {
  constructor(difficulty = 'normal', { rng = Math.random, size = SIZE, fleet = FLEET } = {}) {
    if (!(difficulty in DIFFICULTIES)) throw new Error(`Unknown difficulty: ${difficulty}`);
    this.difficulty = difficulty;
    this.rng = rng;
    this.size = size;
    this.state = new Array(size * size).fill(UNKNOWN);
    this.remaining = fleet.map((s) => s.length);
  }

  idx(r, c) {
    return r * this.size + c;
  }

  inBounds(r, c) {
    return r >= 0 && c >= 0 && r < this.size && c < this.size;
  }

  unknownCells() {
    const out = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.state[this.idx(r, c)] === UNKNOWN) out.push([r, c]);
      }
    }
    return out;
  }

  openHits() {
    const out = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.state[this.idx(r, c)] === HIT) out.push([r, c]);
      }
    }
    return out;
  }

  pick(cells) {
    return cells[randomInt(this.rng, cells.length)];
  }

  nextShot() {
    const unknown = this.unknownCells();
    if (unknown.length === 0) throw new Error('No cells left to fire at');
    if (this.difficulty === 'easy') return this.easy(unknown);
    if (this.difficulty === 'normal') return this.huntTarget(unknown);
    return this.probability(unknown);
  }

  easy(unknown) {
    const hits = this.openHits();
    if (hits.length > 0 && this.rng() < 0.5) {
      const target = this.targetCells(hits);
      if (target.length > 0) return this.pick(target);
    }
    return this.pick(unknown);
  }

  huntTarget(unknown) {
    const hits = this.openHits();
    if (hits.length > 0) {
      const target = this.targetCells(hits);
      if (target.length > 0) return this.pick(target);
    }
    const minLen = this.remaining.length > 0 ? Math.min(...this.remaining) : 1;
    const parity = unknown.filter(([r, c]) => (r + c) % minLen === 0);
    return this.pick(parity.length > 0 ? parity : unknown);
  }

  targetCells(hits) {
    const isHit = (r, c) => this.inBounds(r, c) && this.state[this.idx(r, c)] === HIT;
    const isUnknown = (r, c) => this.inBounds(r, c) && this.state[this.idx(r, c)] === UNKNOWN;

    // Prefer extending a line of two or more adjacent hits.
    const lineTargets = [];
    for (const [r, c] of hits) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        if (!isHit(r + dr, c + dc) || isHit(r - dr, c - dc)) continue;
        let er = r;
        let ec = c;
        while (isHit(er + dr, ec + dc)) {
          er += dr;
          ec += dc;
        }
        if (isUnknown(r - dr, c - dc)) lineTargets.push([r - dr, c - dc]);
        if (isUnknown(er + dr, ec + dc)) lineTargets.push([er + dr, ec + dc]);
      }
    }
    if (lineTargets.length > 0) return lineTargets;

    const neighbours = [];
    for (const [r, c] of hits) {
      for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        if (isUnknown(r + dr, c + dc)) neighbours.push([r + dr, c + dc]);
      }
    }
    return neighbours;
  }

  heatMap() {
    const heat = new Array(this.size * this.size).fill(0);
    const hasOpenHits = this.state.includes(HIT);
    for (const len of this.remaining) {
      for (const horizontal of [true, false]) {
        const maxR = horizontal ? this.size : this.size - len + 1;
        const maxC = horizontal ? this.size - len + 1 : this.size;
        for (let r = 0; r < maxR; r++) {
          for (let c = 0; c < maxC; c++) {
            let blocked = false;
            let hitCount = 0;
            for (let i = 0; i < len; i++) {
              const s = this.state[this.idx(horizontal ? r : r + i, horizontal ? c + i : c)];
              if (s === MISS || s === SUNK) { blocked = true; break; }
              if (s === HIT) hitCount++;
            }
            if (blocked) continue;
            if (hasOpenHits && hitCount === 0) continue;
            const weight = hasOpenHits ? Math.pow(20, hitCount) : 1;
            for (let i = 0; i < len; i++) {
              heat[this.idx(horizontal ? r : r + i, horizontal ? c + i : c)] += weight;
            }
          }
        }
      }
    }
    return heat;
  }

  probability(unknown) {
    const heat = this.heatMap();
    let best = -1;
    let candidates = [];
    for (const [r, c] of unknown) {
      const h = heat[this.idx(r, c)];
      if (h > best) {
        best = h;
        candidates = [[r, c]];
      } else if (h === best) {
        candidates.push([r, c]);
      }
    }
    if (best <= 0) return this.huntTarget(unknown);
    return this.pick(candidates);
  }

  record(r, c, outcome) {
    const { result, ship } = outcome;
    if (result === 'repeat') return;
    if (result === 'miss') {
      this.state[this.idx(r, c)] = MISS;
      return;
    }
    this.state[this.idx(r, c)] = HIT;
    if (result === 'sunk' && ship) {
      for (const [rr, cc] of ship.cells) this.state[this.idx(rr, cc)] = SUNK;
      const i = this.remaining.indexOf(ship.length);
      if (i !== -1) this.remaining.splice(i, 1);
    }
  }
}
