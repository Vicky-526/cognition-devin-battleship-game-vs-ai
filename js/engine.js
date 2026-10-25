export const SIZE = 10;

export const FLEET = Object.freeze([
  { id: 'carrier', name: 'Carrier', length: 5 },
  { id: 'battleship', name: 'Battleship', length: 4 },
  { id: 'cruiser', name: 'Cruiser', length: 3 },
  { id: 'submarine', name: 'Submarine', length: 3 },
  { id: 'destroyer', name: 'Destroyer', length: 2 },
]);

export const COLS = 'ABCDEFGHIJ';

export function coordLabel(r, c) {
  return `${COLS[c]}${r + 1}`;
}

export function randomInt(rng, n) {
  return Math.floor(rng() * n);
}

export class Board {
  constructor(size = SIZE) {
    this.size = size;
    this.reset();
  }

  reset() {
    this.ships = [];
    this.grid = new Array(this.size * this.size).fill(null);
    this.shots = new Array(this.size * this.size).fill(null);
  }

  idx(r, c) {
    return r * this.size + c;
  }

  inBounds(r, c) {
    return Number.isInteger(r) && Number.isInteger(c) &&
      r >= 0 && c >= 0 && r < this.size && c < this.size;
  }

  cellsFor(r, c, length, horizontal) {
    const cells = [];
    for (let i = 0; i < length; i++) {
      cells.push(horizontal ? [r, c + i] : [r + i, c]);
    }
    return cells;
  }

  canPlace(r, c, length, horizontal, ignoreId = null) {
    return this.cellsFor(r, c, length, horizontal).every(([rr, cc]) => {
      if (!this.inBounds(rr, cc)) return false;
      const occupant = this.grid[this.idx(rr, cc)];
      return occupant === null || occupant === ignoreId;
    });
  }

  getShip(id) {
    return this.ships.find((s) => s.id === id) || null;
  }

  place(def, r, c, horizontal) {
    if (this.getShip(def.id)) throw new Error(`${def.name} is already placed`);
    if (!this.canPlace(r, c, def.length, horizontal)) {
      throw new Error(`Cannot place ${def.name} at ${r},${c}`);
    }
    const ship = {
      id: def.id,
      name: def.name,
      length: def.length,
      horizontal,
      cells: this.cellsFor(r, c, def.length, horizontal),
      hits: 0,
    };
    for (const [rr, cc] of ship.cells) this.grid[this.idx(rr, cc)] = ship.id;
    this.ships.push(ship);
    return ship;
  }

  remove(id) {
    const ship = this.getShip(id);
    if (!ship) return null;
    for (const [rr, cc] of ship.cells) this.grid[this.idx(rr, cc)] = null;
    this.ships = this.ships.filter((s) => s.id !== id);
    return ship;
  }

  randomize(fleet = FLEET, rng = Math.random) {
    this.reset();
    for (const def of fleet) {
      for (let attempt = 0; ; attempt++) {
        if (attempt > 10000) throw new Error('Could not place fleet');
        const horizontal = rng() < 0.5;
        const r = randomInt(rng, horizontal ? this.size : this.size - def.length + 1);
        const c = randomInt(rng, horizontal ? this.size - def.length + 1 : this.size);
        if (this.canPlace(r, c, def.length, horizontal)) {
          this.place(def, r, c, horizontal);
          break;
        }
      }
    }
  }

  isComplete(fleet = FLEET) {
    return fleet.every((def) => this.getShip(def.id));
  }

  shotAt(r, c) {
    return this.shots[this.idx(r, c)];
  }

  shipAt(r, c) {
    const id = this.grid[this.idx(r, c)];
    return id === null ? null : this.getShip(id);
  }

  receiveShot(r, c) {
    if (!this.inBounds(r, c)) throw new RangeError(`Shot out of bounds: ${r},${c}`);
    if (this.shotAt(r, c) !== null) return { result: 'repeat' };
    const ship = this.shipAt(r, c);
    if (!ship) {
      this.shots[this.idx(r, c)] = 'miss';
      return { result: 'miss' };
    }
    this.shots[this.idx(r, c)] = 'hit';
    ship.hits += 1;
    if (ship.hits === ship.length) return { result: 'sunk', ship };
    return { result: 'hit', ship };
  }

  isSunk(ship) {
    return ship.hits >= ship.length;
  }

  allSunk() {
    return this.ships.length > 0 && this.ships.every((s) => this.isSunk(s));
  }

  remainingShips() {
    return this.ships.filter((s) => !this.isSunk(s));
  }
}
