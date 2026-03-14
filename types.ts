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

  // --- Fun Mode ---
  funCardInHand: FunCardId | null; // Card currently held (null in standard mode)
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

export interface FunCardEffects {
  blindP1Until: number;    // Timestamp: P1 grid is blinded until
  blindP2Until: number;    // Timestamp: P2 grid is blinded until
  hardModeP1Until: number; // Timestamp: P1 forced EXPERT difficulty until
  hardModeP2Until: number; // Timestamp: P2 forced EXPERT difficulty until
  flipP1Until: number;     // Timestamp: P1 screen is flipped until
  flipP2Until: number;     // Timestamp: P2 screen is flipped until
}

export interface GameState {
  status: 'IDLE' | 'PLAYING' | 'FINISHED';
  cells: CellData[];
  p1: PlayerState;
  p2: PlayerState;
  winner: PlayerId | 'DRAW' | null;
  stealNotification: StealNotification | null;
  duelState: DuelState | null;
  funCardEffects: FunCardEffects;
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
  practiceRecords: PracticeRecord[];
  totalFreezes: number;
  totalDuelWins: number;
  soloRunsByDiff: Partial<Record<Difficulty, number>>; // per-difficulty fastest run (ms)
}

export type GameMode = 'STANDARD' | 'FUN';

export type FunCardId = 'EGG' | 'SHUFFLE' | 'ZAP' | 'HARD_MODE' | 'FLIP' | 'BOMB' | 'REROLL' | 'LEECH' | 'ICE' | 'SWAP';

export interface FunCard {
  id: FunCardId;
  icon: string;
  nameKey: string;
  descKey: string;
}

export type MatchPhase = 'WAITING' | 'SKILL_PICK' | 'RPS' | 'PLAYING' | 'RESULT';
export type RpsMove = 'R' | 'P' | 'S';

export interface GuestResumeSession {
  roomId: string;
  guestSessionId: string;
  lastRevision: number;
  phase: MatchPhase;
  savedAt: number;
}

export interface HostResumeSession {
  roomId: string;
  phase: MatchPhase;
  revision: number;
  guestSessionId: string | null;
  gameState: GameState;
  mySkillPicks: string[];
  p2SkillPicks: string[] | null;
  rpsState: {
    round: number;
    scores: { P1: number; P2: number };
    myMove: RpsMove | null;
    p2Move: RpsMove | null;
  };
  savedAt: number;
}

export type NetworkMessage = 
  | { type: 'JOIN_REQUEST'; guestSessionId: string | null; lastRevision: number }
  | { type: 'SESSION_SYNC'; accepted: boolean; guestSessionId: string | null; phase: MatchPhase; revision: number; reason: 'OK' | 'ROOM_BUSY' | 'SESSION_EXPIRED'; gameMode: GameMode }
  | { type: 'PING'; pingId: string; sentAt: number }
  | { type: 'PONG'; pingId: string; sentAt: number }
  | { type: 'STATE_UPDATE'; state: GameState; phase: MatchPhase; revision: number; serverTime?: number }
  | { type: 'ACTION'; action: GameAction; actionId: string; seq: number; phase: 'PLAYING' }
  | { type: 'HEARTBEAT'; id: PlayerId; timestamp: number }
  | { type: 'RESTART_REQUEST' }
  | { type: 'RESTART_RESPONSE'; accepted: boolean }
  | { type: 'SKILL_PICK_PHASE'; revision: number }                // HOST → GUEST: enter skill pick screen
  | { type: 'SKILL_PICK'; skills: string[]; phase: 'SKILL_PICK' } // GUEST → HOST: submit chosen skill ids
  | { type: 'RPS_PHASE'; revision: number }                       // HOST → GUEST: enter RPS screen
  | { type: 'RPS_PICK'; move: RpsMove; phase: 'RPS' }             // GUEST → HOST: submit RPS move
  | { type: 'RPS_RESULT'; p1Move: RpsMove; p2Move: RpsMove; roundWinner: 'P1' | 'P2' | 'DRAW'; round: number; scores: { P1: number; P2: number }; headstartWinner: 'P1' | 'P2' | 'DRAW' | null; revision: number }; // HOST → GUEST: round outcome

export type GameAction = 
  | { type: 'CLICK_CELL'; cellIndex: number }
  | { type: 'ABANDON_CHALLENGE' }
  | { type: 'DEFEND' }
  | { type: 'INTERACTION' }
  | { type: 'COMPLETE_GAME'; success: boolean }
  | { type: 'USE_SKILL'; skill: 'FREEZE' | 'DUEL' }
  | { type: 'DUEL_PICK_CELL'; cellIndex: number }
  | { type: 'USE_FUN_CARD'; cardId: FunCardId };