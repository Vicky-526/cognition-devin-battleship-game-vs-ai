# Debugging report: Battleship vs AI

How I tested:

- **Unit tests** (`npm test`): ship placement, bounds and overlap checks, shot results, turn order, and game-over handling.
- **AI simulations**: 300 seeded full games per difficulty. They check that the AI never fires at the same cell twice, never fires off the board, always finishes within 100 shots, and that each harder level really is stronger.
- **Automated browser play-through** (`tests/e2e/smoke.mjs`, Playwright + Chromium): manual placement, rotation, picking up a ship, Random placement, full games until the end screen, a desktop (1300px) viewport and a mobile (390px) viewport. It also fails on any console or page error.
  - It also checks the AI heat map (exactly one crosshair and a visible overlay during the AI's turn, nothing shown when the toggle is off).
  - For sound, it counts audio nodes: sounds are created during play and none are created while muted.

## Bugs found and fixed

| # | Bug | How it showed up | Fix |
|---|---|---|---|
| 1 | **The test command crashed on Node 24.** `node --test tests/` failed with `Cannot find module …/tests`. | `npm test` reported 1 failure and ran 0 tests. | Changed the script to an explicit glob: `node --test "tests/*.test.js"`. |
| 2 | **The enemy board wrapped below the player board on laptop screens.** Cells sized at `3.4vw` (up to 38px) made the two boards plus the log panel too wide for a ~1300px window. | Screenshots showed *Enemy waters* below the fold, so you had to scroll down for every shot and back up to see the AI's reply. | Reduced the cell size to `clamp(24px, 2.6vw, 38px)` and widened the layout to 1280px, so both boards and the log fit side by side. |
| 3 | **The sticky header covered the boards on phones.** On narrow screens the top bar wraps to 3 lines (~150px) but stayed `position: sticky`. | In the 390px-wide screenshot, the header sat on top of the player board. | The header is no longer sticky below 520px. In battle on narrow screens, the enemy board now comes first, so you can fire without scrolling past your own board. |
| 4 | **Shot results only appeared in the side log.** The status bar only said "Enemy is taking aim…" / "Your turn", so you couldn't see what just happened without reading the log (which sits below the boards on mobile). | Found during the browser play-through. | The status bar now shows the result first, e.g. "Enemy hit you at E3! Your turn — fire on the enemy waters." |
| 5 | **Easy AI was almost impossible to lose to.** Pure random fire needed **95 shots on average** (max 100) to sink a fleet, so it nearly had to clear the whole board. | Found in the simulation stats. | Easy now follows up a hit 50% of the time: ~63 shots on average. That's still clearly weaker than Normal (~50) and Hard (~44), and a test checks that this order holds. |
| 6 | **Possible crash in the Normal AI once every ship is sunk.** Its search pattern used `Math.min(...remainingShips)`, which returns `Infinity` for an empty list and would break the modulo check. | Found in code review. It can't happen in a normal game today because play stops when the last ship sinks. | Falls back to a step of 1 when no ships remain. |

### Found while adding sound and the AI heat map

| # | Bug | How it showed up | Fix |
|---|---|---|---|
| 7 | **The heat map tinted the whole board on Hard.** Once the AI is chasing a hit, cells far from the hit still get a tiny non-zero score. Every highlighted cell had at least 25% opacity, so those near-zero cells turned the entire board grey-purple and hid the cells that mattered. | Screenshot of a Hard game during the AI's turn. | Cells below 2% of the top score aren't drawn, and opacity now scales from 12% to 85% with the score. Only the cells the AI is really considering stand out. |
| 8 | **The heat map could show one cell while the AI fired at another.** If the overlay were computed separately from the shot, the AI's random tie-breaking could pick a different cell from the one marked with the crosshair. | Found while designing the feature, before it shipped. | `AIPlayer.plan()` returns the shot *and* its heat map together. `Game.planAiTurn()` stores that plan and `Game.aiFire()` fires at exactly that cell. A test checks the fired cell always matches the plan. |
| 9 | **A delayed sound could play in the next game.** The hit/miss sound plays 220ms after the firing sound, so clicking *New game* in between would play an old explosion over the new game. | Found in code review. | The delayed sound only plays if the same game is still running. |
| 10 | **Sound off didn't cut a tune that was already playing.** The start, win and lose tunes queue their notes in advance, and muting only blocked new sounds. | Found in PR review. | Muting now sets the master volume to zero straight away and stops every queued note. |
| 11 | **The heat map went stale after the AI fired.** The map from before the shot stayed up during your turn and after the game ended, so the cell the AI had just fired at could still read "AI interest: 100%". | Found in PR review. | The map clears as soon as the AI fires and only shows during the AI's turn. The legend says when it will reappear. |
| 12 | **The crosshair was hard to see on the hottest cells.** The heat colour was drawn on top of the white crosshair and turned it red. | Found in browser testing (screenshot of a Hard game). | The crosshair is now drawn above the heat colour, with a dark outline for contrast. |
| 13 | **The heat map was easy to miss.** After fix #11 it only showed during the AI's 0.65-second aim delay, so in normal play it flashed by and looked like it wasn't working. | Reported by the user on the live site. | The AI's next move is planned as soon as its previous shot lands (its knowledge can't change during your turn), so the heat map stays up for the whole battle and is never out of date. The crosshair still only appears while the AI is aiming, and it's still the exact cell it fires at. |
| 14 | **After a deploy, browsers could run old game code with the new page.** GitHub Pages lets browsers cache files for 10 minutes, so the new toggles could appear while old JavaScript without the features was still running. | Reported by the user (toggles visible, but no heat map or sound). | Every script and stylesheet reference now carries a shared `?v=` version, and a test checks they all match, so each release loads as a set. |
| 15 | **Sound could stay silent on some browsers.** Safari on iPhone mutes Web Audio when the silent switch is on, and browsers keep audio suspended until it's started inside a click or key press. | Found while investigating the user's report. | The first click, tap or key press now unlocks audio by playing a silent sound inside that gesture. The page also asks iOS to treat it as playback (`navigator.audioSession`, Safari 16.4+), and audio is resumed before every sound if the browser has suspended it. |
| 16 | **The win–loss record couldn't be reset.** It's saved in the browser, and the game had no way to clear it, so the only option was clearing site data. | Reported by the user. | Added a **Reset win–loss record** button under the scoreboard. It asks for confirmation, sets the record to 0–0, saves it, and is disabled when the record is already 0–0. |

## Edge cases checked and protected by tests

These are timing and state problems that are common in turn-based browser games. Each one has a check in the code and a test or browser step that confirms it:

- **Double-clicking during the AI's turn:** enemy cells are disabled and `Game.playerFire` rejects shots while it's the AI's turn. The smoke test spams clicks and confirms only 1 shot lands.
- **Clicking "New game" while the AI is about to fire:** the pending AI timer is cancelled, and `aiTurn` also checks the game state. The smoke test confirms the AI doesn't shoot at the fresh board.
- **Firing at a cell twice:** the cell is rejected (`repeat`/`invalid`), the turn doesn't pass, and the ship's hit count doesn't change.
- **Starting with ships missing:** the *Start battle* button stays disabled and `Game.start()` throws.
- **Shooting after the game ends:** both players' shots are ignored once there's a winner.
- **Changing difficulty mid-game:** the change takes effect at the next game, so the current AI's memory isn't reset halfway through.
- **localStorage blocked or corrupted** (private browsing): reading and saving the win/loss record falls back safely.
