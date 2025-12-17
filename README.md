# GridRush: 9-Cell Battle (九宫格竞速)

**GridRush** is a competitive, real-time multiplayer browser game where players race to conquer a 3x3 grid by completing fast-paced mini-games. / **GridRush** 是一款竞争激烈的实时多人网页游戏，玩家通过完成快节奏的小游戏来争夺九宫格的控制权。

![Banner](https://img.shields.io/badge/Status-Alpha-blue) ![License](https://img.shields.io/badge/License-MIT-green) ![React](https://img.shields.io/badge/React-19-blue)

## 🎮 Features / 游戏特色

*   **Online Multiplayer / 在线对战**: Real-time 1v1 battles using PeerJS (P2P). / 使用 PeerJS 实现的实时 P2P 对战。
*   **Time Attack Mode / 竞速模式**: A linear solo challenge to speed-run all 9 mini-games. / 单人挑战所有 9 个小游戏的最快通关时间。
*   **Practice Gym / 练习道场**: Train specific mini-games individually. / 针对特定小游戏进行单独训练。
*   **Steal Mechanic / 抢夺机制**: In multiplayer, challenge an opponent's captured cell to steal it back! / 在多人模式中，可以发起挑战抢夺对手已经占领的格子！
*   **Achievements / 成就系统**: LocalStorage-based achievement tracking. / 基于本地存储的成就记录系统。
*   **Dual Language / 双语支持**: Full English and Chinese support. / 完整的中文与英文支持。

## 🧩 Mini-Games / 小游戏介绍

The game features 9 distinct skill-based mini-games:
游戏包含 9 款考验技巧的小游戏：

1.  **Math Rush (速算)**: Solve 3 arithmetic problems quickly. / 快速完成 3 道算术题。
2.  **Power Mash (狂暴点击)**: Mash the button to fill the energy bar. / 疯狂点击按钮充满能量条。
3.  **Stroop Test (颜色陷阱)**: Click the *color* of the text, not the word. / 点击文字的**颜色**，而不是文字本身。
4.  **Reaction (极限反应)**: Wait for green, then click instantly (<350ms). / 等待变绿瞬间点击（需在 350ms 内）。
5.  **Matrix (矩阵记忆)**: Memorize and repeat the 3x3 pattern. / 记忆并复刻 3x3 网格图案。
6.  **Lock Pick (开锁专家)**: Time your taps when the spinner hits the green zone. / 指针转到绿色区域时精准点击。
7.  **Scramble (乱序密码)**: Type the 4-digit code on a shuffling keypad. / 在不断打乱的键盘上输入 4 位密码。
8.  **Aim Lab (神射手)**: Hit 5 shrinking targets before they disappear. / 在目标消失前击中 5 个移动靶。
9.  **1-2-3 Sequence (数字连线)**: Click numbers 1 through 5 in order. / 按顺序快速点击数字 1 到 5。

## 🛠️ Tech Stack / 技术栈

*   **React 19**: Frontend UI library / 前端 UI 库。
*   **TailwindCSS**: Styling and animations / 样式与动画。
*   **PeerJS**: WebRTC wrapper for P2P networking / 用于 P2P 联网的 WebRTC 封装库。
*   **Vite**: Build tool / 构建工具。

## 🚀 How to Run Locally / 如何本地运行

Follow these steps to run the game on your own machine.
请按照以下步骤在本地运行游戏。

### Prerequisites / 前置要求

*   [Node.js](https://nodejs.org/) (v16 or higher) installed. / 需安装 Node.js (v16 或更高版本)。

### Installation / 安装步骤

1.  **Clone or Download the code / 克隆或下载代码**:
    ```bash
    git clone https://github.com/yourname/grid-rush.git
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
