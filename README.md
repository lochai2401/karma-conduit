# ⚡ Karma Conduit — Daily Subreddit Grid Relay

**Karma Conduit** is a bite-sized, tactile daily circuit-routing puzzle built natively for **Reddit Interactive Posts** on **Devvit Web** (`@devvit/web`). Every UTC midnight, every player on Reddit faces the exact same guaranteed-solvable 5×5 conduit grid: rotate unlocked conduits to channel high-voltage **Snoo Current** from the **⚡ Source Core** into all **3 🎯 Subreddit Vaults** simultaneously—while deciding whether to detour through optional **💎 Karma Crystals** (`+250 pts` each) or beat **Par** in minimal moves!

---

## 🎮 How to Play (60-Second Daily Loop)

1. **Tap / Click any unlocked tile** on the 5×5 grid to rotate its conduit **90° clockwise**.
2. **Power all 3 🎯 Subreddit Vaults simultaneously** from the **⚡ Source Core** to clear today's edition.
3. **Optimize your route:**
   - **🔒 Firewall Conduits** are pre-locked anchor clues aligned to the true circuit.
   - **💎 Karma Crystals** grant **+250 bonus points** each when energized at the moment of completion.
   - Finishing **at or under Par** and solving quickly awards massive efficiency bonuses on the subreddit's daily leaderboard!
4. **Share & Compete:**
   - Pledge your score to one of three Reddit Guilds (**🔥 Upvote Vanguard**, **⚡ Karma Architects**, or **🌙 Nightmode Mystics**) to push the subreddit's **Daily Overcharge Bar** and win the daily faction tug-of-war.
   - Tap **💬 Post Spoiler-Free Grid to Reddit Comments** to publish your 5×5 emoji circuit summary directly to the post thread!
   - Want more after finishing today's official puzzle? Jump into the **♾️ Blitz Practice Lab** (`4×4 Warmup` or `5×5 Master`) or use the **🛠️ Community Vault Forge** to mint your own custom-seeded Interactive Post in the subreddit!

---

## 🏆 Built for Reddit's Game of the Day Criteria

- **Recurring Daily Loop:** Deterministic `Mulberry32` + `FNV-1a` seeding keyed by UTC date (`YYYY-MM-DD`) generates a fresh, mathematically verified solvable board every day (`Daily Conduit #14`, `#15`, ...) with zero manual maintenance.
- **Deep Reddit Ecosystem & Community Integration:**
  - **Inline Feed Splash (`splash.html`):** Displays live subreddit solver count, Community Overcharge progress bar, today's `#1` `u/username` leader, faction standings, and personal streak right inside the Reddit feed.
  - **1-Click Native Comment Sharing (`/api/share-comment`):** Uses `reddit.submitComment` to post a spoiler-free 5×5 emoji grid (`🟠`, `⚡`, `💎`, `🏆`, `⬛`), move delta vs Par, and streak into the post's comment section.
  - **Community Vault Forge (`/api/create-challenge`):** Empowers players and moderators to publish custom-seeded Interactive Posts (`reddit.submitCustomPost`) with `u/username` architect credit.
  - **Persistent Redis Leaderboards, Streaks & Co-Op Goals:** Uses Redis Sorted Sets (`zAdd`, `zRange`) and Hashes (`hSet`, `hIncrBy`) for instant daily rankings, multi-day streaks, and 3-guild competition.
- **Server-Authoritative Anti-Cheat:** `POST /api/submit-score` reconstructs the exact seeded puzzle on the Devvit serverless backend, runs BFS circuit verification (`evaluateBoardState`), and computes the score server-side before recording to Redis.
- **Delightful UX & Zero-Asset WebAudio:** Smooth SVG plasma conduits, dark Reddit-native theme (`#FF4500` Orangered + Gold + Cyan), Undo/Reset/Hint tools, and synthesized WebAudio harmonic chimes with mute toggle.

---

## 🛠️ Tech Stack & Project Structure

- **Frontend (`src/client/`):** React 19, TypeScript 6, Tailwind CSS 4, Vite 8, `@devvit/web/client`, WebAudio API
  - `src/client/splash.tsx` — Lightweight inline feed card with live Redis telemetry
  - `src/client/game.tsx` — Fullscreen interactive puzzle, leaderboard/guilds view, and Blitz/UGC Vault Forge
  - `src/client/components/ConduitTile.tsx` — Animated SVG conduit renderer
- **Shared Engine (`src/shared/`):**
  - `src/shared/puzzleEngine.ts` — Deterministic daily PRNG, constructive spanning-tree puzzle generator, BFS electric flow evaluator, scoring formula, and Markdown share formatter
  - `src/shared/api.ts` — End-to-end strict TypeScript API contracts
- **Backend (`src/server/`):** Node.js serverless Hono router on `@devvit/web/server` (`redis`, `reddit`, `context`)
  - `src/server/routes/api.ts` — `/api/init`, `/api/submit-score`, `/api/share-comment`, `/api/create-challenge`
  - `src/server/routes/menu.ts` & `forms.ts` & `triggers.ts` — Subreddit moderator menu actions, custom challenge form, and auto-post on app install

---

## 🚀 Development, Testing & Deployment

```bash
# Install dependencies
npm install

# Run strict TypeScript project-reference typecheck
npm run test:types

# Run ESLint across client, shared, and server
npm run lint

# Run automated unit tests (45-day solvability proof, bitmask rotation, scoring, share cards)
npm run test:unit

# Build production client & server bundles into dist/
npm run build

# Authenticate with Reddit & playtest live in your test subreddit
npx devvit login
npm run dev

# Upload to Reddit Developer Portal
npm run deploy
```
