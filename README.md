# GridRush: 9-Cell Battle

[中文版](README.zh-CN.md)

**GridRush** is a competitive, real-time multiplayer browser game where players race to conquer a 3×3 grid by completing fast-paced mini-games.

![Status](https://img.shields.io/badge/Status-Alpha-blue) ![License](https://img.shields.io/badge/License-MIT-green) ![React](https://img.shields.io/badge/React-19-blue)

## 🎮 Features

- **Online Multiplayer** — Real-time 1v1 battles over WebRTC (PeerJS P2P, no server required).
- **Time Attack Mode** — Solo speed-run through all 13 mini-games in sequence, as fast as possible.
- **Practice Gym** — Train individual mini-games with adjustable difficulty.
- **Skill System** — Before each online battle, secretly pick 2 of 3 skills. Your opponent can't see your choices!
  - ⭐ **Steal** — Challenge an opponent's cell; they have 5 seconds to defend or lose it.
  - ❄️ **Freeze** — Lock the opponent's input for 2 seconds.
  - ⚔️ **Duel** — Force both players into a simultaneous race on an empty cell you choose.
- **Achievements** — LocalStorage-based achievement tracking across sessions.
- **Dual Language** — Full English and Chinese (Simplified) UI support.
- **Dark Mode** — System-aware light/dark theme with manual override.

## 🧩 Mini-Games

The game features **13** distinct skill-based mini-games. Each online battle randomly samples 9 of them:

| # | Name | Description |
|---|---|---|
| 1 | **Math Rush** | Solve arithmetic problems before time runs out. |
| 2 | **Power Mash** | Mash the button to fill the energy bar. |
| 3 | **Stroop Test** | Click the *color* of the text, not the word. |
| 4 | **Reaction** | Wait for green, then click instantly. |
| 5 | **Matrix** | Memorize a flash sequence, then reproduce it. |
| 6 | **Lock Pick** | Tap when the spinner lands in the green zone. |
| 7 | **Scramble** | Type a code on a constantly shuffling keypad. |
| 8 | **Aim Lab** | Hit shrinking targets before they disappear. |
| 9 | **1-2-3 Sequence** | Click numbers in ascending order. |
| 10 | **Don't Touch Red** | Navigate your cursor through a maze, avoiding red zones. |
| 11 | **Gravity Maze** | Flip gravity to guide a block through spike-filled passages. |
| 12 | **Rhythm Copy** | Watch a 3-instrument beat pattern, then replay it with S / D / F. |
| 13 | **Odd One Out** | Spot the single different character hidden in a grid of identical ones. |

## 🛠️ Tech Stack

- **React 19** — Frontend UI
- **TailwindCSS** (CDN) — Styling and animations
- **PeerJS** — WebRTC wrapper for P2P networking
- **Vite** — Build tool and dev server

## 🔒 Security Design

GridRush runs entirely in the browser with no backend. All game state lives on the **host's** machine; the guest only sends action messages. All peer data and stored values are treated as untrusted:

| Layer | Measure |
|---|---|
| **P2P messages (host-side)** | Every `NetworkMessage` is reconstructed by `services/sanitize.ts` — type-checked against an allow-list, numeric values range-clamped. |
| **P2P messages (guest-side)** | `STATE_UPDATE` from the host is shape-validated (status allow-list, cell-count bound, required objects present) before being applied. |
| **Skill picks** | Guest-sent skill IDs are filtered to a fixed allow-list (`STEAL`, `FREEZE`, `DUEL`). |
| **Action rate-limiting** | `RateLimiter` (token-bucket) enforces per-action limits: `HEARTBEAT` ≤ 3/s, `CLICK_CELL` ≤ 10/s, `INTERACTION` ≤ 20/s, `COMPLETE_GAME` ≤ 2/2 s. |
| **Room code injection** | `joinGame` validates input against `/^\d{4}$/` before passing it to PeerJS. |
| **BroadcastChannel events** | Cross-tab lobby messages are validated by `sanitizeLobbyMessage` (type allow-list + regex-checked code). |
| **localStorage poisoning** | `sanitizeSettings` / `sanitizeStats` rebuild objects field-by-field rather than spreading parsed JSON directly. |
| **Content Security Policy** | A CSP `<meta>` tag restricts script sources, locks WebSocket/XHR to `*.peerjs.com`, and blocks `frame-src` / `object-src`. |

> **Inherent limitation**: Without a trusted server, a cheating *host* can fabricate `STATE_UPDATE` messages. These measures protect against a cheating *guest* and against local data corruption.

## 🚀 Running Locally

**Prerequisites:** [Node.js](https://nodejs.org/) v16 or higher.

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

MIT — see [LICENSE](LICENSE).

