import React from 'react';
import { MiniGameConfig, Achievement, UserStats } from './types';

// Using simple SVG icons as components for better visuals
export const Icons = {
  Flag: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M3 2.25a.75.75 0 01.75.75v.54l1.838-.46a9.75 9.75 0 016.725.738l.108.054a8.25 8.25 0 005.58.652l3.109-.732a.75.75 0 01.917.81 47.784 47.784 0 00.005 10.337.75.75 0 01-.574.812l-3.114.733a9.75 9.75 0 01-6.594-.158l-.106-.053a8.25 8.25 0 00-5.69-.717l-2.153.538a.75.75 0 01-.933-.738v-8.29a2.42 2.42 0 00-1.5-.163.75.75 0 11-.348-1.458A3.92 3.92 0 013 2.25zM4.5 4.015v8.726c.745-.13 1.545-.14 2.316.053l2.153.538a9.75 9.75 0 016.724.847l.107.054a8.25 8.25 0 005.58.186 46.26 46.26 0 01-.002-9.256 9.75 9.75 0 01-6.495.69l-3.109.732a8.25 8.25 0 00-5.69-.766l-1.468.367a.75.75 0 01-.116.015z" clipRule="evenodd" />
      <path d="M3 15.75a.75.75 0 01.75.75v5.25a.75.75 0 01-1.5 0v-5.25a.75.75 0 01.75-.75z" />
    </svg>
  ),
  Question: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm11.378-3.917c-.89-.777-2.366-.777-3.255 0a.75.75 0 01-.988-1.129c1.454-1.272 3.776-1.272 5.23 0 1.513 1.324 1.513 3.518 0 4.842a3.75 3.75 0 01-.837.552c-.676.328-1.028.774-1.028 1.152v.75a.75.75 0 01-1.5 0v-.75c0-1.279 1.06-2.107 1.875-2.502.182-.088.351-.199.503-.331.83-.727.83-1.857 0-2.584zM12 18a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
    </svg>
  ),
  Sword: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" />
    </svg>
  ),
  Lock: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
       <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
    </svg>
  ),
  Clock: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
    </svg>
  ),
  Dumbbell: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M15.75 1.5a.75.75 0 00-.75.75v2.49l-6.75 3.374V7.5a.75.75 0 00-1.5 0v.75a.75.75 0 000 1.5v.75a.75.75 0 000 1.5v.75a.75.75 0 001.5 0v-.636l6.75 3.375v2.49a.75.75 0 001.5 0V1.5a.75.75 0 00-.75-.75zM8.25 1.5a.75.75 0 00-.75.75v2.49L.75 8.114V7.5a.75.75 0 00-1.5 0v.75a.75.75 0 000 1.5v.75a.75.75 0 001.5 0v-.636l6.75 3.375v2.49a.75.75 0 001.5 0V1.5a.75.75 0 00-.75-.75z" clipRule="evenodd" />
       <path d="M5.5 12a.75.75 0 01.75-.75h11.5a.75.75 0 010 1.5H6.25a.75.75 0 01-.75-.75z" />
    </svg>
  ),
  Trophy: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 00-.584.859 6.753 6.753 0 006.138 5.6 6.73 6.73 0 002.743 1.346A6.707 6.707 0 019.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 00-2.25 2.25c0 .414.336.75.75.75h15a.75.75 0 00.75-.75 2.25 2.25 0 00-2.25-2.25h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 01-1.112-3.173 6.73 6.73 0 002.743-1.347 6.753 6.753 0 006.139-5.6.75.75 0 00-.585-.858 47.077 47.077 0 00-3.07-.543V2.62a.75.75 0 00-.658-.744 49.22 49.22 0 00-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 00-.657.744zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 013.16 5.337a45.6 45.6 0 012.006-.343v.256zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 01-2.863 3.214 6.383 6.383 0 01.857-3.294z" clipRule="evenodd" />
    </svg>
  ),
  Settings: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
       <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
    </svg>
  ),
  Exit: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
    </svg>
  ),
  // New Practice Icons
  Play: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
    </svg>
  ),
  Pause: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
    </svg>
  ),
  Restart: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z" clipRule="evenodd" />
    </svg>
  )
};

export const MINI_GAMES: MiniGameConfig[] = [
  { id: 'math', name: 'Math Rush', type: 'TIMED', icon: '🧮', description: 'Solve 3 equations!' },
  { id: 'mash', name: 'Power Mash', type: 'TIMED', icon: '💥', description: 'Mash to fill the bar!' },
  { id: 'stroop', name: 'Stroop Test', type: 'ACCURACY', icon: '🎨', description: 'Pick the COLOR, 5 times!' },
  { id: 'reaction', name: 'Reaction', type: 'TIMED', icon: '⚡', description: 'Click on Green (<350ms)!' },
  { id: 'memory', name: 'Matrix', type: 'ACCURACY', icon: '🧠', description: 'Tap tiles in order!' },
  { id: 'lockpick', name: 'Lock Pick', type: 'TIMED', icon: '🔐', description: 'Tap when green! (x3)' },
  { id: 'password', name: 'Scramble', type: 'TIMED', icon: '⌨️', description: 'Type the code!' },
  { id: 'burst', name: 'Aim Lab', type: 'SCORE', icon: '🎯', description: 'Hit 5 moving targets!' },
  { id: 'sequence', name: '1-2-3', type: 'TIMED', icon: '🔢', description: 'Click in order!' },
  { id: 'mousemaze',    name: "Don't Touch Red",  type: 'TIMED', icon: '🖱️', description: 'Navigate without touching red!' },
  { id: 'gravitymaze', name: 'Gravity Maze',  type: 'TIMED',    icon: '🔄', description: 'Flip gravity to reach the star!' },
  { id: 'rhythmcopy',  name: 'Rhythm Copy',   type: 'ACCURACY', icon: '🥁', description: 'Watch and copy the beat!' },
  { id: 'oddchar',     name: 'Odd One Out',   type: 'TIMED',    icon: '🔍', description: 'Find the different character!' },
];

export const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
  [0, 4, 8], [2, 4, 6]             // Diagonals
];

export const MINI_GAME_TRANSLATIONS = {
  en: {
    mash_instr: "MASH FAST!",
    stroop_instr: "Color of text?",
    wait: "WAIT...",
    click: "CLICK!",
    too_early: "TOO EARLY!",
    too_slow: "TOO SLOW!",
    type_code: "Code:",
    lock_instr: "Tap on Green!",
    find: "Find",
    repeat: "Watch...",
    repeat_go: "Repeat!",
    sequence_instr: "Order:",
    burst_instr: "Targets:",
    good_job: "Success!",
    try_again: "Failed!",
    clr: "C",
    score: "Score",
    retry: "Retry",
    matrix_order: "In sequence!",
    oddone_instr: "Find the odd one!",
    maze_start: "Move cursor to the green circle",
    maze_playing: "Don't touch red!",
    maze_hint: "Stay on the white path",
    gravity_start: "Click to start",
    gravity_instr: "Click to flip gravity!",
    gravity_retry: "Click to retry",
    rhythm_start: "Watch & copy the beat",
    rhythm_watch: "Watch...",
    rhythm_play: "Your turn!",
    rhythm_retry: "Wrong beat! Retry",
    oddchar_start: "Find the odd character",
    oddchar_find: "Spot it!",
    oddchar_retry: "Time's up! Retry",
  },
  zh: {
    mash_instr: "疯狂点击！",
    stroop_instr: "字的颜色是？",
    wait: "等待...",
    click: "点击！",
    too_early: "太早了！",
    too_slow: "太慢了！",
    type_code: "输入密码：",
    lock_instr: "绿色时点击！",
    find: "找到",
    repeat: "观察...",
    repeat_go: "复原！",
    sequence_instr: "按顺序点击：",
    burst_instr: "剩余目标：",
    good_job: "成功！",
    try_again: "失败！",
    clr: "清",
    score: "得分",
    retry: "重试",
    matrix_order: "按顺序！",
    oddone_instr: "找不同！",
    maze_start: "将鼠标移到绿色圆圈",
    maze_playing: "别碰红线！",
    maze_hint: "保持在白色通道内",
    gravity_start: "点击开始",
    gravity_instr: "点击反转重力！",
    gravity_retry: "点击重试",
    rhythm_start: "观察并复制节奏",
    rhythm_watch: "观察中...",
    rhythm_play: "轮到你了！",
    rhythm_retry: "打错了！重试",
    oddchar_start: "找出不同的字",
    oddchar_find: "快找！",
    oddchar_retry: "超时！重试",
  }
};

export const TRANSLATIONS = {
  en: {
    menu_online: "ONLINE BATTLE",
    menu_solo: "TIME ATTACK",
    menu_practice: "PRACTICE GYM",
    menu_achievements: "ACHIEVEMENTS",
    menu_subtitle: "COMPETITIVE ARENA",
    
    online_host: "Host Game",
    online_host_desc: "Create a room code.",
    online_join: "Join Game",
    online_join_desc: "Enter code.",
    online_create: "CREATE",
    online_join_btn: "JOIN",
    online_waiting: "Waiting for opponent...",
    online_connecting: "Connecting...",
    online_instruction: "Open this URL in a New Tab to simulate Player 2.",

    game_steal: "STEAL",
    game_enemy: "Enemy",
    game_you: "YOU",
    game_ready: "Steal Ready",
    game_no_steal: "No Steals",
    game_playing: "PLAYING CELL",
    
    msg_win: "YOU WIN!",
    msg_lose: "OPPONENT WINS!",
    msg_draw: "DRAW!",
    msg_challenge_complete: "CHALLENGE COMPLETE!",
    msg_steal_attack: "BASE UNDER ATTACK!",
    msg_steal_doing: "STEALING...",
    msg_defend: "DEFEND",

    rules_title: "How to Play",
    rules_goal: "Control 3 cells in a row or the most cells total.",
    rules_race: "The grid is hidden! Click a '?' to start a Mini-Game.",
    rules_steal: "Challenge a cell your opponent owns. They have 5s to defend!",
    
    settings_title: "SETTINGS",
    settings_lang: "Language / 语言",
    settings_theme: "Theme",
    settings_sound: "Sound Effects",
    settings_music: "Music",
    settings_data: "Clear Data",
    settings_data_desc: "Reset all achievements and stats",
    settings_reset: "RESET",
    settings_close: "Close",

    ach_title: "ACHIEVEMENTS",
    ach_locked: "Locked",
    ach_progress: "Progress",

    exit_game: "Quit",
    level_progress: "Level",

    // Practice Mode
    prac_search: "Search games...",
    prac_filter_all: "ALL",
    prac_filter_timed: "TIMED",
    prac_filter_score: "SCORE",
    prac_filter_accuracy: "ACCURACY",
    prac_pb: "PB:",
    prac_no_pb: "None",
    prac_config_title: "Configuration",
    prac_diff: "Difficulty",
    prac_diff_easy: "EASY",
    prac_diff_normal: "NORMAL",
    prac_diff_hard: "HARD",
    prac_diff_expert: "EXPERT",
    prac_preset_battle: "Battle Preset",
    prac_preset_desc: "Use standard online battle settings",
    prac_tutorial: "Tutorial Hints",
    prac_start: "START PRACTICE",
    prac_paused: "PAUSED",
    prac_resume: "RESUME",
    prac_restart: "RESTART",
    prac_quit: "QUIT",
    prac_res_success: "COMPLETE!",
    prac_res_fail: "FAILED",
    prac_new_record: "NEW RECORD!",
    prac_history: "Recent History",
  },
  zh: {
    menu_online: "在线对战",
    menu_solo: "竞速模式",
    menu_practice: "练习道场",
    menu_achievements: "挑战成就",
    menu_subtitle: "竞技场",

    online_host: "创建房间",
    online_host_desc: "生成一个房间代码。",
    online_join: "加入房间",
    online_join_desc: "输入房间代码。",
    online_create: "创建",
    online_join_btn: "加入",
    online_waiting: "等待对手加入...",
    online_connecting: "连接中...",
    online_instruction: "在浏览器新标签页打开此链接以模拟玩家2。",

    game_steal: "抢夺",
    game_enemy: "对手",
    game_you: "你",
    game_ready: "技能就绪",
    game_no_steal: "技能耗尽",
    game_playing: "正在攻克",

    msg_win: "你赢了！",
    msg_lose: "对手获胜！",
    msg_draw: "平局！",
    msg_challenge_complete: "挑战完成！",
    msg_steal_attack: "基地遇袭！",
    msg_steal_doing: "正在偷家...",
    msg_defend: "防守",

    rules_title: "游戏规则",
    rules_goal: "连成三点一线，或在棋盘占满时拥有更多格子。",
    rules_race: "格子是未知的！点击“?”开始小游戏，率先完成者占领该格。",
    rules_steal: "你可以挑战对手已占领的格子。他们有5秒时间防守，否则归你！",

    settings_title: "游戏设置",
    settings_lang: "语言 / Language",
    settings_theme: "外观 / Theme",
    settings_sound: "音效",
    settings_music: "背景音乐",
    settings_data: "清除数据",
    settings_data_desc: "重置所有成就和统计数据",
    settings_reset: "重置",
    settings_close: "关闭",

    ach_title: "挑战成就",
    ach_locked: "未解锁",
    ach_progress: "进度",

    exit_game: "退出",
    level_progress: "关卡",

    // Practice Mode
    prac_search: "搜索小游戏...",
    prac_filter_all: "全部",
    prac_filter_timed: "计时",
    prac_filter_score: "计分",
    prac_filter_accuracy: "准确率",
    prac_pb: "最佳:",
    prac_no_pb: "暂无",
    prac_config_title: "练习设置",
    prac_diff: "难度",
    prac_diff_easy: "简单",
    prac_diff_normal: "普通",
    prac_diff_hard: "困难",
    prac_diff_expert: "专家",
    prac_preset_battle: "对战预设",
    prac_preset_desc: "使用标准在线对战参数",
    prac_tutorial: "教学提示",
    prac_start: "开始练习",
    prac_paused: "已暂停",
    prac_resume: "继续",
    prac_restart: "重开",
    prac_quit: "退出",
    prac_res_success: "挑战完成！",
    prac_res_fail: "挑战失败",
    prac_new_record: "新纪录！",
    prac_history: "最近记录",
  }
};

export const ACHIEVEMENTS_LIST: Achievement[] = [
  {
    id: 'first_win',
    titleEn: 'First Blood',
    titleZh: '首战告捷',
    descEn: 'Win your first Online Battle.',
    descZh: '在在线对战中赢得第一次胜利。',
    icon: '🏆',
    condition: (s) => s.onlineWins >= 1
  },
  {
    id: 'speed_demon',
    titleEn: 'Speed Demon',
    titleZh: '极速传说',
    descEn: 'Finish Time Attack in under 60 seconds.',
    descZh: '在60秒内完成竞速模式挑战。',
    icon: '⚡',
    condition: (s) => s.fastestSoloRun > 0 && s.fastestSoloRun < 60000
  },
  {
    id: 'thief',
    titleEn: 'Master Thief',
    titleZh: '神偷',
    descEn: 'Successfully steal a cell from an opponent.',
    descZh: '成功从对手手中抢夺一个格子。',
    icon: '🗡️',
    condition: (s) => s.totalSteals >= 1
  },
  {
    id: 'defender',
    titleEn: 'Iron Wall',
    titleZh: '铜墙铁壁',
    descEn: 'Successfully defend your cell from a steal attempt.',
    descZh: '成功防御一次对手的抢夺尝试。',
    icon: '🛡️',
    condition: (s) => s.totalDefends >= 1
  },
  {
    id: 'veteran',
    titleEn: 'Veteran',
    titleZh: '身经百战',
    descEn: 'Play 10 games total.',
    descZh: '总计游玩10局游戏。',
    icon: '🎖️',
    condition: (s) => s.gamesPlayed >= 10
  }
];