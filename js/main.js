import { FLEET, COLS, coordLabel } from './engine.js?v=2';
import { AIPlayer, DIFFICULTIES } from './ai.js?v=2';
import { Game } from './game.js?v=2';
import { SoundFX } from './sound.js?v=2';

const AI_DELAY_MS = 650;
const RECORD_KEY = 'battleship-record-v1';
const HEAT_KEY = 'battleship-heatmap-v1';
const RESULT_SOUND_DELAY_MS = 220;
const MIN_VISIBLE_HEAT = 0.02;
const HEAT_DESCRIPTIONS = {
  easy: 'Easy AI: highlighted cells are the ones it is picking from at random.',
  normal: 'Normal AI: highlighted cells are its current candidates (checkerboard search, or cells around a hit).',
  hard: 'Hard AI: colour shows how many possible ship placements cover each cell. Redder means more likely.',
};

const sound = new SoundFX();

const $ = (id) => document.getElementById(id);
const els = {
  difficulty: $('difficulty'),
  newGame: $('new-game'),
  soundToggle: $('sound-toggle'),
  heatToggle: $('heat-toggle'),
  heatLegend: $('heat-legend'),
  heatMode: $('heat-mode'),
  status: $('status'),
  placement: $('placement'),
  dock: $('dock'),
  rotate: $('rotate'),
  orientation: $('orientation'),
  random: $('random'),
  clear: $('clear'),
  start: $('start'),
  playerBoard: $('player-board'),
  enemyBoard: $('enemy-board'),
  playerFleet: $('player-fleet'),
  enemyFleet: $('enemy-fleet'),
  scoreboard: $('scoreboard'),
  resetRecord: $('reset-record'),
  log: $('log'),
  dialog: $('game-over'),
  resultTitle: $('result-title'),
  resultText: $('result-text'),
  viewBoard: $('view-board'),
  playAgain: $('play-again'),
};

const ui = {
  game: null,
  selected: null,
  horizontal: true,
  hover: null,
  aiTimer: null,
  lastPlayerShot: null,
  lastAiShot: null,
  showHeat: loadHeatPref(),
  record: loadRecord(),
};

function loadRecord() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORD_KEY));
    if (raw && Number.isFinite(raw.wins) && Number.isFinite(raw.losses)) return raw;
  } catch { /* ignore corrupt storage */ }
  return { wins: 0, losses: 0 };
}

function loadHeatPref() {
  try {
    return localStorage.getItem(HEAT_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveHeatPref() {
  try {
    localStorage.setItem(HEAT_KEY, ui.showHeat ? 'on' : 'off');
  } catch { /* storage unavailable */ }
}

function saveRecord() {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(ui.record));
  } catch { /* storage may be unavailable (private mode) */ }
}

function buildBoard(container, onCell, withHeat = false) {
  container.innerHTML = '';
  container.appendChild(document.createElement('div')).className = 'label corner';
  for (let c = 0; c < 10; c++) {
    const l = container.appendChild(document.createElement('div'));
    l.className = 'label';
    l.textContent = COLS[c];
  }
  const cells = [];
  for (let r = 0; r < 10; r++) {
    const l = container.appendChild(document.createElement('div'));
    l.className = 'label';
    l.textContent = String(r + 1);
    for (let c = 0; c < 10; c++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      if (withHeat) cell.appendChild(document.createElement('span')).className = 'heat';
      container.appendChild(cell);
      cells.push(cell);
    }
  }
  container.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (cell) onCell(Number(cell.dataset.r), Number(cell.dataset.c), e);
  });
  return cells;
}

let playerCells = [];
let enemyCells = [];

function init() {
  for (const [key, label] of Object.entries(DIFFICULTIES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    els.difficulty.appendChild(opt);
  }
  els.difficulty.value = 'normal';

  playerCells = buildBoard(els.playerBoard, onPlayerCell, true);
  enemyCells = buildBoard(els.enemyBoard, onEnemyCell);

  els.playerBoard.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    ui.hover = [Number(cell.dataset.r), Number(cell.dataset.c)];
    renderPlayer();
  });
  els.playerBoard.addEventListener('mouseleave', () => {
    ui.hover = null;
    renderPlayer();
  });
  els.playerBoard.addEventListener('focusin', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    ui.hover = [Number(cell.dataset.r), Number(cell.dataset.c)];
    renderPlayer();
  });

  els.rotate.addEventListener('click', rotate);
  els.random.addEventListener('click', randomPlacement);
  els.clear.addEventListener('click', clearPlacement);
  els.start.addEventListener('click', startBattle);
  els.newGame.addEventListener('click', newGame);
  els.playAgain.addEventListener('click', () => {
    els.dialog.close();
    newGame();
  });
  els.viewBoard.addEventListener('click', () => els.dialog.close());
  els.resetRecord.addEventListener('click', () => {
    const { wins, losses } = ui.record;
    if (!window.confirm(`Reset your win–loss record (${wins}–${losses}) to 0–0?`)) return;
    ui.record = { wins: 0, losses: 0 };
    saveRecord();
    sound.play('click');
    renderScoreboard();
    setStatus('Win–loss record reset to 0–0.');
  });
  els.difficulty.addEventListener('change', onDifficultyChange);
  els.soundToggle.addEventListener('click', () => {
    sound.setEnabled(!sound.enabled);
    sound.play('click');
    renderSoundToggle();
  });
  els.heatToggle.checked = ui.showHeat;
  els.heatToggle.addEventListener('change', () => {
    ui.showHeat = els.heatToggle.checked;
    saveHeatPref();
    render();
  });
  renderSoundToggle();
  for (const type of ['pointerdown', 'touchend', 'keydown']) {
    document.addEventListener(type, () => sound.unlock(), { capture: true, passive: true });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'r' && e.key !== 'R') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
    if (ui.game.phase === 'placement') rotate();
  });

  newGame();
}

function newGame() {
  clearTimeout(ui.aiTimer);
  ui.aiTimer = null;
  if (els.dialog.open) els.dialog.close();
  ui.game = new Game({ difficulty: els.difficulty.value });
  ui.selected = FLEET[0].id;
  ui.horizontal = true;
  ui.lastPlayerShot = null;
  ui.lastAiShot = null;
  els.log.innerHTML = '';
  setStatus('Place your fleet to begin. Select a ship, then click your waters.');
  render();
}

function onDifficultyChange() {
  const game = ui.game;
  if (game.phase === 'placement') {
    game.difficulty = els.difficulty.value;
    game.ai = new AIPlayer(game.difficulty);
    setStatus(`AI difficulty set to ${els.difficulty.value}.`);
  } else {
    setStatus(`AI difficulty will change to ${els.difficulty.value} in your next game.`);
  }
}

function rotate() {
  ui.horizontal = !ui.horizontal;
  sound.play('click');
  render();
}

function randomPlacement() {
  ui.game.player.randomize(FLEET);
  ui.selected = null;
  sound.play('place');
  setStatus('Fleet deployed at random. Hit "Start battle" when ready.');
  render();
}

function clearPlacement() {
  ui.game.player.reset();
  ui.selected = FLEET[0].id;
  sound.play('pickup');
  setStatus('Board cleared. Place your fleet.');
  render();
}

function nextUnplaced() {
  const def = FLEET.find((d) => !ui.game.player.getShip(d.id));
  return def ? def.id : null;
}

function onPlayerCell(r, c) {
  const { game } = ui;
  if (game.phase !== 'placement') return;
  const board = game.player;
  const existing = board.shipAt(r, c);
  if (existing) {
    board.remove(existing.id);
    ui.selected = existing.id;
    ui.horizontal = existing.horizontal;
    sound.play('pickup');
    setStatus(`Picked up your ${existing.name}. Click to place it again.`);
    render();
    return;
  }
  if (!ui.selected) {
    sound.play('error');
    setStatus('Select a ship from the dock first.');
    return;
  }
  const def = FLEET.find((d) => d.id === ui.selected);
  if (!board.canPlace(r, c, def.length, ui.horizontal)) {
    sound.play('error');
    setStatus(`Your ${def.name} doesn't fit there.`);
    return;
  }
  board.place(def, r, c, ui.horizontal);
  sound.play('place');
  ui.selected = nextUnplaced();
  setStatus(ui.selected ? `${def.name} placed.` : 'Fleet ready! Hit "Start battle".');
  render();
}

function startBattle() {
  const { game } = ui;
  if (game.phase !== 'placement' || !game.player.isComplete()) return;
  game.start();
  sound.play('start');
  ui.selected = null;
  ui.hover = null;
  setStatus('Battle stations! Fire on the enemy waters.');
  addLog('system', 'The battle begins. You fire first.');
  render();
}

function onEnemyCell(r, c) {
  const { game } = ui;
  if (game.phase === 'placement') {
    setStatus('Place your fleet and start the battle first.');
    return;
  }
  if (!game.canPlayerFire(r, c)) return;
  const outcome = game.playerFire(r, c);
  ui.lastPlayerShot = [r, c];
  playShotSounds(outcome);
  describeShot('player', r, c, outcome);
  render();
  if (game.phase === 'over') {
    endGame();
    return;
  }
  render();
  setStatus(`${resultPhrase('player', outcome)} Enemy is taking aim…`);
  ui.aiTimer = setTimeout(aiTurn, AI_DELAY_MS);
}

function aiTurn() {
  ui.aiTimer = null;
  const { game } = ui;
  if (game.phase !== 'battle' || game.turn !== 'ai') return;
  const outcome = game.aiFire();
  ui.lastAiShot = [outcome.r, outcome.c];
  playShotSounds(outcome);
  describeShot('ai', outcome.r, outcome.c, outcome);
  render();
  if (game.phase === 'over') endGame();
  else setStatus(`${resultPhrase('ai', outcome)} Your turn — fire on the enemy waters.`);
}

function describeShot(who, r, c, outcome) {
  const label = coordLabel(r, c);
  const actor = who === 'player' ? 'You' : 'Enemy';
  const text = {
    miss: `${actor} fired at ${label} — miss.`,
    hit: `${actor} fired at ${label} — HIT!`,
    sunk: who === 'player'
      ? `You fired at ${label} — sunk the enemy ${outcome.ship?.name}!`
      : `Enemy fired at ${label} — sunk your ${outcome.ship?.name}!`,
  }[outcome.result];
  if (text) addLog(`${who} ${outcome.result}`, text);
}

function playShotSounds(outcome) {
  sound.play('fire');
  const { game } = ui;
  setTimeout(() => {
    if (ui.game === game) sound.play(outcome.result);
  }, RESULT_SOUND_DELAY_MS);
}

function resultPhrase(who, outcome) {
  const label = coordLabel(...(who === 'player' ? ui.lastPlayerShot : ui.lastAiShot));
  if (who === 'player') {
    if (outcome.result === 'sunk') return `${label}: you sunk their ${outcome.ship.name}!`;
    return outcome.result === 'hit' ? `${label}: HIT!` : `${label}: miss.`;
  }
  if (outcome.result === 'sunk') return `Enemy sunk your ${outcome.ship.name} at ${label}!`;
  return outcome.result === 'hit' ? `Enemy hit you at ${label}!` : `Enemy missed at ${label}.`;
}

function endGame() {
  const { game } = ui;
  const won = game.winner === 'player';
  if (won) ui.record.wins += 1;
  else ui.record.losses += 1;
  saveRecord();
  sound.play(won ? 'win' : 'lose');
  const s = game.stats.player;
  els.resultTitle.textContent = won ? 'Victory! 🎉' : 'Defeat ⚓';
  els.resultText.textContent = won
    ? `You sank the entire enemy fleet in ${s.shots} shots (${accuracy(s)} accuracy).`
    : `The AI sank your fleet in ${game.stats.ai.shots} shots. Better luck next time!`;
  setStatus(won ? 'Victory! You sank the enemy fleet.' : 'Defeat. Your fleet was sunk.');
  addLog('system', won ? 'You won the battle!' : 'The AI won the battle.');
  render();
  if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
}

function accuracy({ shots, hits }) {
  return shots === 0 ? '0%' : `${Math.round((hits / shots) * 100)}%`;
}

function setStatus(text) {
  els.status.textContent = text;
}

function addLog(kind, text) {
  const li = document.createElement('li');
  li.className = kind;
  li.textContent = text;
  els.log.prepend(li);
}

function render() {
  const { game } = ui;
  els.placement.hidden = game.phase !== 'placement';
  document.body.dataset.phase = game.phase;
  document.body.dataset.turn = game.turn;
  els.orientation.textContent = ui.horizontal ? 'Horizontal' : 'Vertical';
  els.start.disabled = !game.player.isComplete();
  renderDock();
  renderPlayer();
  renderEnemy();
  renderFleetStatus(els.playerFleet, game.player, true);
  renderFleetStatus(els.enemyFleet, game.enemy, game.phase === 'over');
  renderScoreboard();
  renderHeatLegend();
}

function renderSoundToggle() {
  els.soundToggle.textContent = sound.enabled ? '🔊 Sound on' : '🔇 Sound off';
  els.soundToggle.setAttribute('aria-pressed', String(sound.enabled));
}

function heatVisible() {
  return ui.showHeat && ui.game.phase === 'battle';
}

function renderHeatLegend() {
  els.heatLegend.hidden = !heatVisible();
  els.heatMode.textContent = `${HEAT_DESCRIPTIONS[ui.game.ai.difficulty]} It updates after every AI shot.`;
}

function renderDock() {
  const { game } = ui;
  els.dock.innerHTML = '';
  for (const def of FLEET) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dock-ship';
    const placed = Boolean(game.player.getShip(def.id));
    btn.classList.toggle('placed', placed);
    btn.classList.toggle('selected', ui.selected === def.id);
    btn.setAttribute('aria-pressed', String(ui.selected === def.id));
    btn.innerHTML = `<span class="name">${def.name}</span><span class="pips">${'<i></i>'.repeat(def.length)}</span>`;
    btn.addEventListener('click', () => {
      sound.play(placed ? 'pickup' : 'click');
      if (placed) game.player.remove(def.id);
      ui.selected = def.id;
      setStatus(`Placing ${def.name} (${def.length}). Click your waters.`);
      render();
    });
    els.dock.appendChild(btn);
  }
}

function previewCells() {
  const { game } = ui;
  if (game.phase !== 'placement' || !ui.selected || !ui.hover) return null;
  const def = FLEET.find((d) => d.id === ui.selected);
  const [r, c] = ui.hover;
  if (game.player.shipAt(r, c)) return null;
  const cells = game.player.cellsFor(r, c, def.length, ui.horizontal)
    .filter(([rr, cc]) => game.player.inBounds(rr, cc));
  return { cells, valid: game.player.canPlace(r, c, def.length, ui.horizontal) };
}

function shipSegmentClasses(ship, r, c) {
  const i = ship.cells.findIndex(([rr, cc]) => rr === r && cc === c);
  const cls = ['ship', ship.horizontal ? 'h' : 'v'];
  if (i === 0) cls.push('start');
  if (i === ship.length - 1) cls.push('end');
  return cls;
}

function renderPlayer() {
  const { game } = ui;
  const board = game.player;
  const preview = previewCells();
  const previewSet = new Set(preview ? preview.cells.map(([r, c]) => `${r},${c}`) : []);
  for (const cell of playerCells) {
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const ship = board.shipAt(r, c);
    const shot = board.shotAt(r, c);
    const cls = ['cell'];
    if (ship) cls.push(...shipSegmentClasses(ship, r, c));
    if (ship && board.isSunk(ship)) cls.push('sunk');
    if (shot) cls.push(shot);
    if (previewSet.has(`${r},${c}`)) cls.push(preview.valid ? 'preview' : 'preview-bad');
    if (ui.lastAiShot && ui.lastAiShot[0] === r && ui.lastAiShot[1] === c) cls.push('last');
    const plan = heatVisible() ? game.planAiTurn() : null;
    const h = plan ? plan.heat[r * 10 + c] : 0;
    const aiming = plan && game.phase === 'battle' && game.turn === 'ai' &&
      plan.shot[0] === r && plan.shot[1] === c;
    if (aiming) cls.push('aim');
    const heatEl = cell.firstElementChild;
    heatEl.classList.toggle('on', h >= MIN_VISIBLE_HEAT);
    heatEl.style.setProperty('--h', h.toFixed(3));
    cell.title = h >= MIN_VISIBLE_HEAT ? `AI interest: ${Math.round(h * 100)}%` : '';
    cell.className = cls.join(' ');
    cell.disabled = game.phase !== 'placement';
    cell.setAttribute('aria-label', `${coordLabel(r, c)}${ship ? `, your ${ship.name}` : ''}${shot ? `, ${shot}` : ''}`);
  }
}

function renderEnemy() {
  const { game } = ui;
  const board = game.enemy;
  const reveal = game.phase === 'over';
  for (const cell of enemyCells) {
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const ship = board.shipAt(r, c);
    const shot = board.shotAt(r, c);
    const cls = ['cell'];
    const sunk = ship && board.isSunk(ship);
    if (ship && (sunk || reveal)) cls.push(...shipSegmentClasses(ship, r, c));
    if (sunk) cls.push('sunk');
    if (reveal && ship && !shot) cls.push('revealed');
    if (shot) cls.push(shot);
    if (ui.lastPlayerShot && ui.lastPlayerShot[0] === r && ui.lastPlayerShot[1] === c) cls.push('last');
    const canFire = game.canPlayerFire(r, c);
    if (canFire) cls.push('target');
    cell.className = cls.join(' ');
    cell.disabled = !canFire;
    cell.setAttribute('aria-label', `Enemy ${coordLabel(r, c)}${shot ? `, ${shot}` : ''}${sunk ? `, sunk ${ship.name}` : ''}`);
  }
}

function renderFleetStatus(list, board, revealAll) {
  list.innerHTML = '';
  for (const def of FLEET) {
    const ship = board.getShip(def.id);
    const li = document.createElement('li');
    const sunk = ship && board.isSunk(ship);
    li.className = sunk ? 'sunk' : '';
    const hits = ship && (revealAll || sunk) ? ship.hits : 0;
    let pips = '';
    for (let i = 0; i < def.length; i++) pips += `<i class="${i < hits ? 'hit' : ''}"></i>`;
    li.innerHTML = `<span class="name">${def.name}</span><span class="pips">${pips}</span>`;
    list.appendChild(li);
  }
}

function renderScoreboard() {
  const { game, record } = ui;
  const p = game.stats.player;
  const a = game.stats.ai;
  els.scoreboard.innerHTML = `
    <div><span>You</span><strong>${p.hits}/${p.shots}</strong><small>hits · ${accuracy(p)}</small></div>
    <div><span>AI</span><strong>${a.hits}/${a.shots}</strong><small>hits · ${accuracy(a)}</small></div>
    <div><span>Record</span><strong>${record.wins}–${record.losses}</strong><small>wins–losses</small></div>`;
  els.resetRecord.disabled = record.wins === 0 && record.losses === 0;
}

init();
