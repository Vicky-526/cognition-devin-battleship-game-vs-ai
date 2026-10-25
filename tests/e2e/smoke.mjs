import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:8080/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL);
await page.screenshot({ path: (process.env.SHOTS || '.') + '/01-start.png' });

// manual placement: carrier horizontal at A1
const pcell = (r, c) => page.locator(`#player-board .cell[data-r="${r}"][data-c="${c}"]`);
const ecell = (r, c) => page.locator(`#enemy-board .cell[data-r="${r}"][data-c="${c}"]`);
await pcell(0, 0).hover();
await page.screenshot({ path: (process.env.SHOTS || '.') + '/02-preview.png' });
await pcell(0, 0).click();
await page.keyboard.press('r');
console.log('orientation after R:', await page.textContent('#orientation'));
await pcell(2, 0).click(); // battleship vertical A3
await pcell(2, 9).hover();
await pcell(9, 9).hover();
await page.screenshot({ path: (process.env.SHOTS || '.') + '/03-invalid.png' });
await pcell(2, 2).click(); // cruiser vertical
await pcell(2, 4).click(); // sub vertical
await pcell(2, 6).click(); // destroyer vertical
console.log('start enabled:', await page.isEnabled('#start'));
console.log('status:', await page.textContent('#status'));
// pick up and re-place
await pcell(2, 6).click();
console.log('after pickup start enabled:', await page.isEnabled('#start'));
await pcell(8, 8).click();
await page.screenshot({ path: (process.env.SHOTS || '.') + '/04-placed.png' });
await page.click('#start');

// rapid double click on enemy board during AI turn
await ecell(0, 0).click();
await ecell(0, 1).click({ force: true, timeout: 1000 }).catch(() => {});
await page.waitForTimeout(100);
const shotsAfterSpam = await page.evaluate(() => document.querySelectorAll('#enemy-board .cell.hit, #enemy-board .cell.miss').length);
console.log('enemy shots after spam (expect 1):', shotsAfterSpam);
await page.waitForTimeout(900);
await page.screenshot({ path: (process.env.SHOTS || '.') + '/05-battle.png' });

// play until over
let guard = 0;
while (!(await page.evaluate(() => document.getElementById('game-over').open)) && guard++ < 200) {
  const target = page.locator('#enemy-board .cell.target').first();
  if (await target.count() === 0) { await page.waitForTimeout(200); continue; }
  await target.click();
  await page.waitForFunction(() => document.body.dataset.turn === 'player' || document.getElementById('game-over').open, null, { timeout: 5000 });
  if (guard === 30) await page.screenshot({ path: (process.env.SHOTS || '.') + '/06-midgame.png' });
}
console.log('dialog open:', await page.evaluate(() => document.getElementById('game-over').open));
console.log('result:', await page.textContent('#result-title'), await page.textContent('#result-text'));
await page.screenshot({ path: (process.env.SHOTS || '.') + '/07-over.png' });
await page.click('#view-board');
await page.screenshot({ path: (process.env.SHOTS || '.') + '/08-reveal.png' });

// new game mid AI turn
await page.click('#new-game');
await page.click('#random');
await page.click('#start');
await ecell(5, 5).click();
await page.click('#new-game');
await page.waitForTimeout(1000);
const aiShotsOnFresh = await page.evaluate(() => document.querySelectorAll('#player-board .cell.hit, #player-board .cell.miss').length);
console.log('AI shots on fresh board after new game (expect 0):', aiShotsOnFresh, 'phase', await page.evaluate(() => document.body.dataset.phase));

// mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: (process.env.SHOTS || '.') + '/09-mobile.png', fullPage: true });
console.log('horizontal overflow:', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
console.log('ERRORS:', errors);
await browser.close();
