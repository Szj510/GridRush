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
  stealsRemaining: number;
  isDefending: boolean;
}

export interface StealNotification {
  challengerId: PlayerId;
  defenderId: PlayerId;
  cellId: number;
  timestamp: number; 
  expiresAt: number; 
}

export interface GameState {
  status: 'IDLE' | 'PLAYING' | 'FINISHED';
  cells: CellData[];
  p1: PlayerState;
  p2: PlayerState;
  winner: PlayerId | 'DRAW' | null;
  stealNotification: StealNotification | null;
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
  | { type: 'STATE_UPDATE'; state: GameState }
  | { type: 'ACTION'; action: GameAction }
  | { type: 'RESTART' };

export type GameAction = 
  | { type: 'CLICK_CELL'; cellIndex: number }
  | { type: 'DEFEND' }
  | { type: 'COMPLETE_GAME'; success: boolean };