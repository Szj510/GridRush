# GridRush: 9-Cell Battle

[中文版](README.zh-CN.md)

**GridRush** is a competitive, real-time multiplayer browser game where players race to conquer a 3×3 grid by completing fast-paced mini-games.

![Status](https://img.shields.io/badge/Status-Alpha-blue) ![License](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey) ![React](https://img.shields.io/badge/React-19-blue)

## 🎮 Features

- **Online Multiplayer** — Real-time 1v1 battles over WebRTC (PeerJS P2P, no server required).
- **Reliable Relay Mode** — When Supabase env is configured, online messages default to Supabase Realtime relay to avoid fragile P2P hole-punching.
- **Guided Bot Tutorial** — First-time online players can launch a scripted tutorial match that teaches capture, freeze, and steal flow against a slowed-down bot.
- **Invite via Link** — Host a room and click **Copy Invite Link** to get a shareable URL. Your friend opens the link and lands directly in your room — no code typing needed.
- **Time Attack Mode** — Solo speed-run through all 13 mini-games in sequence, as fast as possible.
- **Practice Gym** — Train individual mini-games with adjustable difficulty.
- **Pre-Match Ban Phase** — Before drafting skills, each player bans 1 mini-game. Banned games are excluded from that match's 9-cell pool.
- **Skill System** — Before each online battle, secretly pick 2 of 3 skills. Your opponent can't see your choices!
  - ⭐ **Steal** — Challenge an opponent's cell; they have 5 seconds to defend or lose it.
  - ❄️ **Freeze** — Lock the opponent's input for 2 seconds.
  - ⚔️ **Duel** — Force both players into a simultaneous race on an empty cell you choose.
- **Fun Mode Cards** — Capture cells to draw chaos cards (10 total): Blackout, Shuffle, Zap, Nightmare, Flip, Bomb, Reroll, Leech, Ice, Swap.
- **Stats Dashboard** — Visualize both recent and lifetime performance: online W/L/D, action totals, RPS win rates, solo bests, and recent match history.
- **Achievements** — LocalStorage-based achievement tracking across sessions.
- **Dual Language** — Full English and Chinese (Simplified) UI support.
- **Dark Mode** — System-aware light/dark theme with manual override.

## ⚡ First Match in 30 Seconds

1. In online mode, each player first bans 1 mini-game from the match pool.
2. Then both players secretly pick 2 skills out of Steal, Freeze, and Duel.
3. A best-of-3 Rock-Paper-Scissors decides who starts unfrozen. The loser begins the board phase frozen for 2 seconds.
4. Click any `?` cell to enter its mini-game. The first player to clear it captures that cell.
5. Entering an enemy-owned cell spends your Steal and creates a 5-second defend window for the owner.
6. Win instantly by getting 3 in a row, or own more cells when the 9-cell board is full.

If you are brand new to online mode, open the guided bot tutorial from the online lobby first. It walks through the board with step-by-step prompts during a real match.

### Important Penalties

- Failing the same cell 3 times in a row locks you out of that cell for 10 seconds.
- Canceling a steal attempt triggers a 20-second Steal cooldown.
- Going AFK or disconnecting too long kicks you out of the cell you were contesting.

## 🧩 Mini-Games

The game features **14** distinct skill-based mini-games. Each online battle randomly samples 9 from the remaining pool after both players ban 1 game each:

| #   | Name                | Description                                                                         |
| --- | ------------------- | ----------------------------------------------------------------------------------- |
| 1   | **Math Rush**       | Solve arithmetic problems before time runs out.                                     |
| 2   | **Power Mash**      | Mash the button to fill the energy bar.                                             |
| 3   | **Stroop Test**     | Click the _color_ of the text, not the word.                                        |
| 4   | **Reaction**        | Wait for green, then click instantly.                                               |
| 5   | **Matrix**          | Memorize a flash sequence, then reproduce it.                                       |
| 6   | **Lock Pick**       | Tap when the spinner lands in the green zone.                                       |
| 7   | **Scramble**        | Type a code on a constantly shuffling keypad.                                       |
| 8   | **Aim Lab**         | Hit shrinking targets before they disappear.                                        |
| 9   | **1-2-3 Sequence**  | Click numbers in ascending order.                                                   |
| 10  | **Don't Touch Red** | Navigate your cursor through a maze, avoiding red zones.                            |
| 11  | **Gravity Maze**    | Flip gravity to guide a block through spike-filled passages.                        |
| 12  | **Rhythm Copy**     | Watch a 3-instrument beat pattern, then replay it with S / D / F.                   |
| 13  | **Odd One Out**     | Spot the single different character hidden in a grid of identical ones.             |
| 14  | **Heartbeat**       | Feel the time: watch for 1s, then stop at the target moment. Pure timing challenge. |

## 🛠️ Tech Stack

- **React 19** — Frontend UI
- **TailwindCSS** (CDN) — Styling and animations
- **PeerJS** — WebRTC wrapper for P2P networking
- **Vite** — Build tool and dev server
- **Supabase** (optional) — Account system and cloud stats sync (requires `.env.local`)

## 🌐 Online Reliability

- `VITE_NET_USE_SUPABASE_RELAY=1` (default when Supabase env exists) routes match messages through Supabase Realtime.
- `VITE_NET_USE_SUPABASE_RELAY=0` forces legacy PeerJS P2P mode.
- If you still prefer PeerJS and your network blocks `0.peerjs.com`, configure your own signaling host with `VITE_PEERJS_HOST` and related variables in `.env.local`.

## 🔒 Security Design

GridRush runs entirely in the browser with no backend. All game state lives on the **host's** machine; the guest only sends action messages. All peer data and stored values are treated as untrusted:

| Layer                         | Measure                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **P2P messages (host-side)**  | Every `NetworkMessage` is reconstructed by `services/sanitize.ts` — type-checked against an allow-list, numeric values range-clamped.           |
| **P2P messages (guest-side)** | `STATE_UPDATE` from the host is shape-validated (status allow-list, cell-count bound, required objects present) before being applied.           |
| **Ban picks**                 | Guest-sent ban IDs are validated against known mini-game IDs and accepted once per player per round.                                            |
| **Skill picks**               | Guest-sent skill IDs are filtered to a fixed allow-list (`STEAL`, `FREEZE`, `DUEL`).                                                            |
| **Action rate-limiting**      | `RateLimiter` (token-bucket) enforces per-action limits: `HEARTBEAT` ≤ 3/s, `CLICK_CELL` ≤ 10/s, `INTERACTION` ≤ 20/s, `COMPLETE_GAME` ≤ 2/2 s. |
| **Room code injection**       | `joinGame` validates input against `/^\d{4}$/` before passing it to PeerJS.                                                                     |
| **localStorage poisoning**    | `sanitizeSettings` / `sanitizeStats` rebuild objects field-by-field rather than spreading parsed JSON directly.                                 |
| **Content Security Policy**   | A CSP `<meta>` tag restricts script sources, locks WebSocket/XHR to `*.peerjs.com`, and blocks `frame-src` / `object-src`.                      |

> **Inherent limitation**: Without a trusted server, a cheating _host_ can fabricate `STATE_UPDATE` messages. These measures protect against a cheating _guest_ and against local data corruption.

## 🚀 Running Locally

**Prerequisites:** [Node.js](https://nodejs.org/) v20 or higher.

```bash
# Clone the repo
git clone https://github.com/Szj510/grid-rush.git
cd grid-rush

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open `http://localhost:5173` in your browser. To simulate Player 2, open the same URL in another tab.

### Production Build

```bash
npm run build
# Output: dist/
```

## 📄 License

[CC BY-NC 4.0](LICENSE) — Free to use and modify for non-commercial purposes. Commercial use is prohibited.
