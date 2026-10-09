# Froyo Arcade

A standalone site that collects the Yogurtland froyo games in one place: pick a game on the home page and play it in the browser. No sign-up, rewards, or leaderboards.

| Route     | Game        | Notes |
| --------- | ----------- | ----- |
| `/`       | Arcade home | Game cards from `src/games/registry.ts` |
| `/catch`  | Froyo Catch | Free Play mode from `froyo-catcher` |
| `/crush`  | Froyo Crush | 21-level match-3 from `Froyo-Crush` |
| `/wordle` | Wordle      | Daily word from `yogurtland-wordle`, scored on the server |
| `/slice`  | Froyo Slice | 30-second fruit-slicing game built for the arcade (Canvas) |

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

`npm run typecheck` runs the TypeScript compiler without emitting files.

### Optional environment variables

| Name            | Default               | Used for |
| --------------- | --------------------- | -------- |
| `GAME_TIMEZONE` | `America/Los_Angeles` | When the Wordle day rolls over |

## Project layout

```
src/
  app/                    Routes (Next.js App Router)
    page.tsx, home.css    Arcade home
    catch|crush|wordle|slice/  One page per game
    api/wordle/           Wordle guess + today endpoints
    globals.css           Design tokens and shared UI styles
  components/arcade/      Shared UI used by every game
    GameShell.tsx         Sticky header with "Arcade" back button
    StartScreen.tsx       Intro: art, pitch, rules, start button
    StatBar.tsx           Score / lives / moves style status tiles
    ResultSheet.tsx       End-of-round card (Play Again, Back to Arcade)
    SoundToggle.tsx       Header sound on/off button
    Thumbnails.tsx        Card and start-screen art for each game
  games/
    registry.ts           The list of games shown on the home page
    catch/                Froyo Catch
    crush/                Froyo Crush (engine.ts + levels.ts + React wrapper)
    wordle/               Wordle (client UI + server/ scoring)
    slice/                Froyo Slice (engine.ts loop, art.ts drawings, sound.ts, React screen)
public/
  catch/                  Resized Froyo Catch art
  brand/                  Yogurtland logo
```

## Adding a game

1. Add an entry to `src/games/registry.ts` (`status: 'live'` makes the card clickable; `'coming-soon'` shows a disabled card).
2. Create `src/app/<slug>/page.tsx` and a `src/games/<slug>/` folder for the game.
3. Build the screens from the shared components:
   - `GameShell` for the page frame and the way back to the arcade.
   - `StartScreen` for the intro and rules.
   - `StatBar` for the in-game status.
   - `ResultSheet` for the end of a round. It always includes **Back to Arcade**.
4. Add card art for the game in `Thumbnails.tsx`.
5. When the component unmounts, clear every timer, interval, animation frame, listener, and `AudioContext`.

## Froyo Slice

- **Rules**:
  - Rounds last 30 seconds, with a 3-2-1 countdown first.
  - Each fruit cut is +10.
  - Cutting 3 or more fruits in one swipe adds +20, paid once per swipe.
  - A bomb is −30, and the score never goes below 0.
  - Missed fruit costs nothing.
  - Fruit launches a little more often as the round goes on.
- **Input**: Pointer Events, so touch and mouse work the same way.
  - Hits are tested on the segment between the previous and current pointer position (coalesced events included), so fast swipes don't skip fruit.
  - The canvas uses `touch-action: none`, and the page can't scroll during a round.
- **Cup**: one half of each sliced fruit flies onto the froyo cup at the bottom of the play area. The cup shows at most 22 toppings.
- **Pause**: the round pauses automatically when the tab is hidden, and a **Resume** button appears when you come back.
- **Saved locally**: best score in `froyo-arcade:slice:best` and mute in `froyo-arcade:slice:muted`. Sound starts only after the first tap.
- **Test hook**: `/slice?test=1` exposes `window.__slice` (`debugPlace`, `debugSpawning`, `debugState`) for automated checks. It does nothing without the query flag.

## What was carried over from the original games

- **Froyo Catch** keeps the Free Play rules, speeds, and scoring:
  - 3 lives; a missed topping costs one.
  - A soccer ball adds one life.
  - The level rises every 10 points, and toppings fall faster with more drops at once.
  - Mouse and touch-drag controls work as before.
  - Best score and the chosen cup are saved in `localStorage`.
- **Froyo Crush** keeps the same levels, matching, specials, ice, cookies, boosters (shuffle, bomb, spoon), "+5 moves", scoring, and star rating. Progress is saved in `localStorage`.
  - One bug from the original was fixed: a swap made in the brief pause before the "Level complete" card could trigger a second clear, which marked the next level as cleared without playing it.
- **Wordle** keeps the original rules:
  - Six tries, standard duplicate-letter scoring, and the same allowed-word list.
  - Physical and on-screen keyboards.
  - One word per day. The answer never reaches the browser until the game ends.
  - Progress and stats are kept in an httpOnly cookie.

Removed for this release: sign-in, coupons and rewards, leaderboards, store redemption, admin tools, and the Supabase backend.

## Known limitations

- Wordle still uses the original's single fixed answer, because the source game had no word schedule yet. To rotate answers, set `ANSWER` in `src/games/wordle/server/game.ts` from a schedule.
- Wordle is one word per day. **Play Again** stays disabled until the next word unlocks, and the result card shows a countdown to it.
