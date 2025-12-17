export type PlayerId = 'P1' | 'P2';

export interface MiniGameConfig {
  id: string;
  name: string;
  icon: string; // Emoji or simple text representation
  description: string;
}

export interface CellData {
  id: number;
  gameId: string;
  owner: PlayerId | null;
  activePlayers: PlayerId[]; // Who is currently playing this cell
  lastInteraction: number; // Timestamp
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  activeCell: number | null; // Currently playing cell index
  stealsRemaining: number;
  isDefending: boolean;
}

export interface StealNotification {
  challengerId: PlayerId;
  defenderId: PlayerId;
  cellId: number;
  timestamp: number; // When the steal started
  expiresAt: number; // When the notification disappears
}

export interface GameState {
  status: 'IDLE' | 'PLAYING' | 'FINISHED';
  cells: CellData[];
  p1: PlayerState;
  p2: PlayerState;
  winner: PlayerId | 'DRAW' | null;
  stealNotification: StealNotification | null;
}

// --- New Types for System ---

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
  fastestSoloRun: number; // in milliseconds, Infinity if none
  totalSteals: number;
  totalDefends: number;
  gamesPlayed: number;
  unlockedAchievements: string[]; // List of Achievement IDs
}

// Network Types
export type NetworkMessage = 
  | { type: 'STATE_UPDATE'; state: GameState }
  | { type: 'ACTION'; action: GameAction }
  | { type: 'RESTART' };

export type GameAction = 
  | { type: 'CLICK_CELL'; cellIndex: number }
  | { type: 'DEFEND' }
  | { type: 'COMPLETE_GAME'; success: boolean };