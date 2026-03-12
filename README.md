# GridRush: 9-Cell Battle (九宫格竞速)

**GridRush** is a competitive, real-time multiplayer browser game where players race to conquer a 3x3 grid by completing fast-paced mini-games. / **GridRush** 是一款竞争激烈的实时多人网页游戏，玩家通过完成快节奏的小游戏来争夺九宫格的控制权。

![Banner](https://img.shields.io/badge/Status-Alpha-blue) ![License](https://img.shields.io/badge/License-MIT-green) ![React](https://img.shields.io/badge/React-19-blue)

## 🎮 Features / 游戏特色

- **Online Multiplayer / 在线对战**: Real-time 1v1 battles using PeerJS (P2P). / 使用 PeerJS 实现的实时 P2P 对战。
- **Time Attack Mode / 竞速模式**: A solo speed-run through all mini-games in sequence. / 单人连续尝试所有小游戏的最快通关。
- **Practice Gym / 练习道场**: Train specific mini-games individually. / 针对特定小游戏进行单独训练。
- **Skill System / 技能系统**: Before each online battle, secretly pick 2 of 3 skills. Opponent can't see your picks! / 每局在线对战开始前，秘密选择 3 种技能中的 2 种，对方看不到你的选择！
  - ⭐ **Steal (夺旗)**: Challenge an opponent's cell — they have 5s to defend! / 挑战对手格子，对方有 5 秒时间防守！
  - ❄️ **Freeze (冻结)**: Freeze the opponent's input for 2 seconds. / 冻结对手操作 2 秒。
  - ⚔️ **Duel (决斗)**: Force both players into a simultaneous race on an empty cell you pick. / 强制双方同时在你选定的空格竞速。
- **Achievements / 成就系统**: LocalStorage-based achievement tracking. / 基于本地存储的成就记录系统。
- **Dual Language / 双语支持**: Full English and Chinese support. / 完整的中文与英文支持。

## 🧩 Mini-Games / 小游戏介绍

The game currently features **13** distinct skill-based mini-games, randomly sampled each online battle:
游戏目前共有 **13** 款考验技巧的小游戏，每局在线对战将随机抽取 9 款：

1.  **Math Rush (速算)**: Solve arithmetic problems quickly. / 快速完成算术题。
2.  **Power Mash (狂暴点击)**: Mash the button to fill the energy bar. / 疯狂点击按鈕充满能量条。
3.  **Stroop Test (颜色陷阱)**: Click the _color_ of the text, not the word. / 点击文字的《颜色》，而不是文字本身。
4.  **Reaction (极限反应)**: Wait for green, then click instantly. / 等待变绻然后立即点击。
5.  **Matrix (矩阵记忆)**: Memorize the flash sequence, then tap tiles in the same order. / 记住闪烁顺序，按相同顺序点击格子。
6.  **Lock Pick (开锁专家)**: Time your taps when the spinner hits the green zone. / 指针转到绿色区域时精准点击。
7.  **Scramble (乱序密码)**: Type the code on a shuffling keypad. / 在不断打乱的键盘上输入密码。
8.  **Aim Lab (神射手)**: Hit shrinking targets before they disappear. / 在目标消失前击中。
9.  **1-2-3 Sequence (数字连线)**: Click numbers in ascending order. / 按顺序快速点击数字。
10. **Don't Touch Red (别碰红线)**: Navigate your cursor through the maze without touching the red zones. / 将鼠标在迷宫中移动，不要碰到红色区域。
11. **Gravity Maze (重力迷宫)**: Click to flip gravity and guide the block through spike-filled passages to the goal. / 点击反转重力，引导方块穿过尖刺通道到达终点。
12. **Rhythm Copy (节奏复制)**: Watch the 3-instrument beat pattern, then replay it with S / D / F keys. / 观察三乐器节奏序列，用 S / D / F 键依样复制。
13. **Odd One Out (找不同)**: Spot the single different character hidden among a grid of identical ones. / 在一屏相同文字中找出唯一混入的不同字。

## 🛠️ Tech Stack / 技术栈

- **React 19**: Frontend UI library / 前端 UI 库。
- **TailwindCSS**: Styling and animations / 样式与动画。
- **PeerJS**: WebRTC wrapper for P2P networking / 用于 P2P 联网的 WebRTC 封装库。
- **Vite**: Build tool / 构建工具。

## 🔒 Security Design / 安全设计

GridRush runs entirely in the browser with no backend server. All gameplay state lives on the **HOST's** machine; the guest sends action messages that the host processes authoritatively. Because every message from a peer or stored value is untrusted input, the following measures are applied:

GridRush 完全运行在浏览器中，无后端服务器。所有游戏状态存储在**房主**端，客机只发送动作消息，由房主权威处理。因为所有来自对端或存储的数据均为不可信输入，故采取了以下措施：

| Layer / 层                          | Measure / 措施                                                                                                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P2P messages (host-side)**        | Every incoming `NetworkMessage` is reconstructed from untrusted data by `services/sanitize.ts` — type-checked against an allow-list, and numeric values are range-clamped before any game logic runs.                            |
| **P2P messages (guest-side)**       | `STATE_UPDATE` from the host is shape-validated (status allow-list, cell-count bound, required player objects present) before being applied to the local state.                                                                  |
| **Skill picks**                     | Guest-sent skill IDs are filtered to a fixed allow-list (`STEAL`, `FREEZE`, `DUEL`). Arbitrary strings cannot be injected as skill names.                                                                                        |
| **Action flooding / rate-limiting** | `RateLimiter` (token-bucket) limits per-action rates on the host side: `HEARTBEAT` ≤ 3/s, `CLICK_CELL` ≤ 10/s, `INTERACTION` ≤ 20/s, `COMPLETE_GAME` ≤ 2/2 s, `SKILL_PICK` ≤ 2/5 s.                                              |
| **Room code injection**             | `joinGame` validates the user-entered code against `/^\d{4}$/` before passing it to PeerJS — prevents arbitrary peer IDs being constructed from user input.                                                                      |
| **BroadcastChannel events**         | Cross-tab lobby messages are validated by `sanitizeLobbyMessage` (type allow-list + regex-checked room code) before being acted upon.                                                                                            |
| **localStorage poisoning**          | `sanitizeSettings` and `sanitizeStats` rebuild stored objects from scratch — each field is individually type-checked against allow-lists or numerically clamped — rather than using the parsed JSON object directly.             |
| **Content Security Policy**         | A CSP `<meta>` tag restricts script sources to `self`, the Tailwind CDN, PeerJS CDN, and the esm.sh importmap; WebSocket/XHR is locked to `*.peerjs.com`; `frame-src` and `object-src` are blocked to prevent embedding attacks. |

> **Inherent limitations**: Without a trusted server, the host's state is authoritative but unverifiable by the guest. A cheating host can always send a fabricated `STATE_UPDATE`. These measures protect against a cheating _guest_ and against accidental or malicious corruption of local browser data.  
> **固有局限**：缺乏可信服务器时，房主状态具有权威性但无法被客机验证。作弊的房主仍可发送伪造的 `STATE_UPDATE`。上述措施用于防范**客机作弊**以及防止本地浏览器数据被意外或恶意篡改。

## 🚀 How to Run Locally / 如何本地运行

Follow these steps to run the game on your own machine.
请按照以下步骤在本地运行游戏。

### Prerequisites / 前置要求

- [Node.js](https://nodejs.org/) (v16 or higher) installed. / 需安装 Node.js (v16 或更高版本)。

### Installation / 安装步骤

1.  **Clone or Download the code / 克隆或下载代码**:

    ```bash
    git clone https://github.com/Szj510/grid-rush.git
    cd grid-rush
    ```

2.  **Install Dependencies / 安装依赖**:

    ```bash
    npm install
    # or / 或
    yarn install
    ```

3.  **Start Development Server / 启动开发服务器**:

    ```bash
    npm run dev
    # or / 或
    yarn dev
    ```

4.  **Play / 开始游戏**:
    Open your browser and navigate to `http://localhost:5173` (or the port shown in your terminal).
    打开浏览器访问 `http://localhost:5173`（或终端中显示的端口）。

### Building for Production / 构建发布

To build the app for deployment (e.g., GitHub Pages, Vercel):
打包项目以便部署（例如部署到 GitHub Pages 或 Vercel）：

```bash
npm run build
```

The output will be in the `dist` folder. / 构建产物将位于 `dist` 文件夹中。

## 📄 License / 许可证

This project is open-source and available under the [MIT License](LICENSE).
本项目开源并遵循 MIT 许可证。
