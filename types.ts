import React from 'react';

export type PlayerId = 'P1' | 'P2';

// --- New Practice Types ---
export type GameType = 'TIMED' | 'SCORE' | 'ACCURACY';
export type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT';

export interface MiniGameConfig {
  id: string;
  name: string;
  type: GameType; // New: Primary scoring category
  icon: string;
  description: string;
}

export interface PracticeConfig {
  difficulty: Difficulty;
  isBattlePreset: boolean; // If true, forces settings to match online battle defaults
  tutorialEnabled: boolean;
}

export interface PracticeRecord {
  gameId: string;
  timestamp: number;
  value: number; // The score or time (ms)
  config: PracticeConfig;
  isWin: boolean; // Did they actually clear it?
}

// --------------------------

export interface CellData {
  id: number;
  gameId: string;
  owner: PlayerId | null;
  activePlayers: PlayerId[]; 
  lastInteraction: number; 
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  activeCell: number | null; 
  challengeStartTime: number; // New: Tracks when the current challenge started
  stealsRemaining: number;
  isDefending: boolean;
  
  // --- New Logic State ---
  lastHeartbeat: number; // To detect disconnect/background
  lastInputTime: number; // To detect AFK inside a minigame
  
  // Map key is cellId (0-8)
  cellFailures: Record<number, number>; // Count consecutive failures per cell
  cellCooldowns: Record<number, number>; // Timestamp when cooldown expires for a cell
  stealCooldown: number; // Timestamp when steal ability unlocks again (if cancelled)

  // --- Skills ---
  freezesRemaining: number; // Uses of the Freeze skill remaining this game
  frozenUntil: number;      // Timestamp: player cannot interact until this time
  duelsRemaining: number;   // Uses of the Duel skill remaining this game
}

export interface StealNotification {
  challengerId: PlayerId;
  defenderId: PlayerId;
  cellId: number;
  timestamp: number; 
  expiresAt: number; 
}

export interface DuelState {
  initiatorId: PlayerId;
  cellId: number | null;       // null until initiator picks a cell
  phase: 'PICKING' | 'RACING';
  pickDeadline: number;        // Timestamp by which initiator must pick a cell
}

export interface GameState {
  status: 'IDLE' | 'PLAYING' | 'FINISHED';
  cells: CellData[];
  p1: PlayerState;
  p2: PlayerState;
  winner: PlayerId | 'DRAW' | null;
  stealNotification: StealNotification | null;
  duelState: DuelState | null;
}

export type Language = 'en' | 'zh';
export type Theme = 'light' | 'dark';

export interface AppSettings {
  language: Language;
  theme: Theme;
  soundEnabled: boolean;
  musicEnabled: boolean;
}

export interface Achievement {
  id: string;
  titleEn: string;
  titleZh: string;
  descEn: string;
  descZh: string;
  icon: React.ReactNode;
  condition: (stats: UserStats) => boolean;
}

export interface UserStats {
  onlineWins: number;
  fastestSoloRun: number; 
  totalSteals: number;
  totalDefends: number;
  gamesPlayed: number;
  unlockedAchievements: string[];
  practiceRecords: PracticeRecord[]; // New: Store practice history
}

export type NetworkMessage = 
  | { type: 'STATE_UPDATE'; state: GameState; serverTime?: number }
  | { type: 'ACTION'; action: GameAction }
  | { type: 'HEARTBEAT'; id: PlayerId; timestamp: number }
  | { type: 'RESTART' }
  | { type: 'SKILL_PICK_PHASE' }                // HOST → GUEST: enter skill pick screen
  | { type: 'SKILL_PICK'; skills: string[] };    // GUEST → HOST: submit chosen skill ids

export type GameAction = 
  | { type: 'CLICK_CELL'; cellIndex: number }
  | { type: 'ABANDON_CHALLENGE' }
  | { type: 'DEFEND' }
  | { type: 'INTERACTION' }
  | { type: 'COMPLETE_GAME'; success: boolean }
  | { type: 'USE_SKILL'; skill: 'FREEZE' | 'DUEL' }
  | { type: 'DUEL_PICK_CELL'; cellIndex: number };