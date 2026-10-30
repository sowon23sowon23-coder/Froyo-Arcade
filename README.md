# Froyo Arcade

A standalone site that collects the Yogurtland froyo games in one place: pick a game on the home page and play it in the browser. Games need no sign-up. Players who complete one game's reward mission can sign in to save a coupon and show it in store (see [Rewards](#rewards)).

| Route            | Page         | Notes |
| ---------------- | ------------ | ----- |
| `/`              | Arcade home  | Game cards from `src/games/registry.ts`, rewards banner, **My Rewards** button |
| `/catch`         | Froyo Catch  | Free Play mode from `froyo-catcher` |
| `/crush`         | Froyo Crush  | 21-level match-3 from `Froyo-Crush` |
| `/wordle`        | Wordle       | Daily word from `yogurtland-wordle`, scored on the server |
| `/slice`         | Froyo Slice  | 30-second fruit-slicing game built for the arcade (Canvas) |
| `/rewards`       | My Rewards   | Sign-in, the coupon, participating stores, **Use in store** |
| `/rewards/claim` | Claim Reward | Mission complete → sign in → coupon saved |

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

### Environment variables

Copy `.env.example` to `.env.local`. Every variable is optional: with none set, the site runs games-only.

| Name                            | Used for |
| ------------------------------- | -------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Rewards: Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Rewards: sign-in from the browser |
| `SUPABASE_SERVICE_ROLE_KEY`     | Rewards: server-only database access. Never expose it |
| `STORE_QR_VALUE`                | The shared in-store QR payload. Until it's set, **Use in store** stays disabled |
| `WORDLE_SECRET`                 | Long random text that keeps future Wordle answers secret. Set it in production; changing it changes the answers, including today's |
| `GAME_TIMEZONE`                 | When the Wordle day rolls over (default `America/Los_Angeles`) |

## Project layout

```
src/
  app/                    Routes (Next.js App Router)
    page.tsx, home.css    Arcade home
    catch|crush|wordle|slice/  One page per game
    api/wordle/           Wordle guess + today endpoints
    api/play/             Round start/finish (server-side mission check)
    api/rewards/          me, claim, execute (in-store QR)
    api/events/           Funnel events the browser sees (store taps, views)
    auth/callback/        Google sign-in return
    rewards/              My Rewards and Claim Reward pages
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
  rewards/
    config.ts             Promotion settings: missions, reward, expiry, stores (edit here)
    types.ts              Coupon states and API shapes
    server/               Supabase access, mission checks, coupon issue/execute, events
    client/               API calls, hooks, in-app browser detection
    ui/                   Mission boxes, sign-in, coupon card, QR screen, home banner
supabase/migrations/      Database schema (run once per Supabase project)
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
  - A heart (❤️) adds one life.
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

Still not carried over: leaderboards and admin tools. Rewards were rebuilt for the arcade (below), not ported.

## Rewards

Complete **any one** game's mission and an account can save **one coupon per promotion**. The coupon is shown in store as the **shared, fixed QR** that stores already scan; each customer's coupon record only controls whether *their* screen may show it.

### Flow

1. Home → pick a game. Its start screen shows the reward mission.
2. Play without signing in. The server starts a play session when the round begins.
3. The round ends and the server checks the mission. If it was met, it saves a **mission claim** tied to this browser.
4. **Claim your reward** opens `/rewards/claim`. If the player isn't signed in, they sign in there and the claim is kept.
   - Email 6-digit code is the main method. It works inside Instagram's browser and never leaves the page.
   - **Continue with Google** appears only in a regular browser, because Google blocks sign-in in in-app browsers.
5. The server issues the coupon, or returns the existing one: the database allows one per account per promotion.
6. In store: **My Rewards** → **Use in store** → confirm → the QR shows for `qrDisplaySeconds` (10 by default), then disappears for good.

### Coupon states

| State       | Meaning |
| ----------- | ------- |
| `available` | Saved, not opened in store |
| `showing`   | The QR is on screen now (inside the display window) |
| `shown`     | The QR was opened and its window ended. This is a **use attempt**, not a confirmed discount: the POS doesn't report back |
| `expired`   | Passed its expiry date without being opened |

The state is never stored. It is derived from `issued_at`, `expires_at`, and `qr_executed_at` against the server clock.

### How the one-time QR is enforced

- `execute_coupon_qr` (in the migration) sets `qr_executed_at = now()` in one `UPDATE … WHERE qr_executed_at IS NULL`.
  - Concurrent taps or devices serialize on the row lock. Only the first sets the time; the rest get the original time back.
- Refresh, back, reopen, or another device all read the same `qr_executed_at`, so they only show what is left of the same window.
- Nothing is written if the request never reaches the database, if the coupon is expired, or if `STORE_QR_VALUE` is unset. In those cases the coupon stays `available`.
- `STORE_QR_VALUE` is server-only. It is sent to a browser only while that browser's coupon is `showing`.
- The QR screen shows a ticking clock, a pulsing dot, and the coupon code so staff can tell a live screen from a screenshot.
  - **This does not stop copying of the shared QR itself.** That QR never expires, so anyone who photographs it can reuse it. Only staff checking for a live screen, or a POS integration, closes that gap.

### Mission checks

- **Wordle** is scored on the server, so a win can't be faked by sending a result. Progress lives in a cookie, though: after losing, a player who clears cookies or opens a private window sees a fresh board and can enter the word they were just shown. The one-coupon-per-account limit still applies.
- **Catch, Crush, and Slice** run in the browser. `/api/play/finish` rejects results that real play can't produce: too fast for the time played (`src/rewards/server/missions.ts`). Someone scripting the API can still fake a result. Size the reward with that in mind.

### Setup (once per environment)

1. Create a Supabase project and run `supabase/migrations/0001_rewards.sql` in its SQL editor.
2. **Authentication → Providers → Email**: enable it. Then edit **Email Templates → Magic Link** to include `{{ .Token }}`, so the email carries the 6-digit code. Supabase's built-in mailer is heavily rate-limited, so set up custom SMTP (Resend, SendGrid, …) before launch.
3. **Authentication → Providers → Google**: optional. Add the Google OAuth client ID and secret.
4. **Authentication → URL Configuration**: set the Site URL and add `https://<your-domain>/auth/callback` to the Redirect URLs.
5. Set the four environment variables (see `.env.example`) in Vercel and redeploy.

### Promotion settings

Edit `src/rewards/config.ts`:

- **Mission targets, reward text, terms, expiry, and display seconds**: placeholders until the business confirms them.
  - While `draft: true`, every screen that shows them carries a **Sample terms · not final** badge.
  - Set `draft: false` only after sign-off.
- **`stores`**: empty, so the store list says it isn't confirmed yet. Add `{ name, address, mapsUrl?, hours? }` entries.
- **`termsUrl` / `privacyUrl`**: when set, they are linked under the sign-in form.
- **Changing `id`** starts a new promotion, and every account can earn one coupon again.

### Measuring

Events go to the `events` table: `game_start`, `game_complete`, `mission_achieved`, `coupon_issued`, `store_click`, `qr_execute`, plus screen views. `store_click` and `qr_execute` are attributed to the game that earned the coupon.

```sql
select * from reward_funnel_by_game;
```

This shows which games lead to in-store **use attempts**. Discounts actually applied need POS data.

## Known limitations

- Wordle answers come from `src/games/wordle/server/answers.ts`. `schedule.ts` picks each day's word from the date and `WORDLE_SECRET`, with no repeats until the whole list has been used. Editing the list or the secret reshuffles the schedule, including today's word, so a game in progress may change.
- Every player gets the same Wordle word each day, so it can be shared once someone has solved it.
- A mission claim belongs to the browser that played it. Signing in on a different browser, for example after switching out of Instagram, can't use it. The claim page doesn't offer the switch.
- There is no rate limiting on `/api/play/*` or `/api/events` beyond Supabase's own limits.
- Wordle is one word per day. **Play Again** stays disabled until the next word unlocks, and the result card shows a countdown to it.
