import { Board, FLEET } from './engine.js?v=2';
import { AIPlayer } from './ai.js?v=2';

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
    this.aiPlan = null;
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

  // The AI's knowledge only changes when it fires, so its next move can be
  // planned (and shown) during the player's turn and still be the shot it takes.
  planAiTurn() {
    if (this.phase !== 'battle') return null;
    if (!this.aiPlan) this.aiPlan = this.ai.plan();
    return this.aiPlan;
  }

  aiFire() {
    if (this.phase !== 'battle' || this.turn !== 'ai') return { result: 'invalid' };
    const plan = this.planAiTurn();
    this.aiPlan = null;
    const [r, c] = plan.shot;
    const outcome = this.player.receiveShot(r, c);
    this.ai.record(r, c, outcome);
    this.tally('ai', outcome);
    if (this.player.allSunk()) this.finish('ai');
    else this.turn = 'player';
    return { ...outcome, r, c, plan };
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
