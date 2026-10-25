import { Board, FLEET } from './engine.js';
import { AIPlayer } from './ai.js';

export class Game {
  constructor({ difficulty = 'normal', rng = Math.random } = {}) {
    this.rng = rng;
    this.difficulty = difficulty;
    this.player = new Board();
    this.enemy = new Board();
    this.enemy.randomize(FLEET, rng);
    this.ai = new AIPlayer(difficulty, { rng });
    this.phase = 'placement';
    this.turn = 'player';
    this.winner = null;
    this.stats = {
      player: { shots: 0, hits: 0 },
      ai: { shots: 0, hits: 0 },
    };
  }

  start() {
    if (this.phase !== 'placement') throw new Error('Game already started');
    if (!this.player.isComplete(FLEET)) throw new Error('Place all ships first');
    this.phase = 'battle';
    this.turn = 'player';
  }

  canPlayerFire(r, c) {
    return this.phase === 'battle' && this.turn === 'player' &&
      this.enemy.inBounds(r, c) && this.enemy.shotAt(r, c) === null;
  }

  playerFire(r, c) {
    if (!this.canPlayerFire(r, c)) return { result: 'invalid' };
    const outcome = this.enemy.receiveShot(r, c);
    this.tally('player', outcome);
    if (this.enemy.allSunk()) this.finish('player');
    else this.turn = 'ai';
    return outcome;
  }

  aiFire() {
    if (this.phase !== 'battle' || this.turn !== 'ai') return { result: 'invalid' };
    const [r, c] = this.ai.nextShot();
    const outcome = this.player.receiveShot(r, c);
    this.ai.record(r, c, outcome);
    this.tally('ai', outcome);
    if (this.player.allSunk()) this.finish('ai');
    else this.turn = 'player';
    return { ...outcome, r, c };
  }

  tally(who, outcome) {
    this.stats[who].shots += 1;
    if (outcome.result === 'hit' || outcome.result === 'sunk') this.stats[who].hits += 1;
  }

  finish(winner) {
    this.phase = 'over';
    this.winner = winner;
  }
}
