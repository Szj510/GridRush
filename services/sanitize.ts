/**
 * sanitize.ts — Input/output validation & rate limiting.
 *
 * GridRush has no backend; all P2P messages, localStorage data, and
 * cross-tab (BroadcastChannel) events are treated as UNTRUSTED input
 * and must be validated before use.
 */

import type { NetworkMessage, GameAction, AppSettings, UserStats, PracticeRecord, RpsMove, MatchPhase, GuestResumeSession, HostResumeSession, GameMode, FunCardId } from '../types';

// ─── Allow-lists ─────────────────────────────────────────────────────────────

const VALID_MSG_TYPES    = new Set(['JOIN_REQUEST', 'SESSION_SYNC', 'PING', 'PONG', 'STATE_UPDATE', 'ACTION', 'HEARTBEAT', 'RESTART_REQUEST', 'RESTART_RESPONSE', 'SKILL_PICK_PHASE', 'SKILL_PICK', 'RPS_PHASE', 'RPS_PICK', 'RPS_RESULT']);
const VALID_RPS_MOVES    = new Set(['R', 'P', 'S']);
const VALID_MATCH_PHASES = new Set(['WAITING', 'SKILL_PICK', 'RPS', 'PLAYING', 'RESULT']);
const VALID_SESSION_SYNC_REASONS = new Set(['OK', 'ROOM_BUSY', 'SESSION_EXPIRED']);
const VALID_ACTION_TYPES = new Set(['CLICK_CELL', 'ABANDON_CHALLENGE', 'DEFEND', 'INTERACTION', 'COMPLETE_GAME', 'USE_SKILL', 'DUEL_PICK_CELL', 'USE_FUN_CARD']);
const VALID_SKILLS       = new Set(['STEAL', 'FREEZE', 'DUEL']);
const VALID_FUN_CARD_IDS = new Set(['EGG', 'SHUFFLE', 'ZAP', 'HARD_MODE', 'FLIP', 'BOMB', 'REROLL', 'LEECH', 'ICE', 'SWAP']);
const VALID_LANGUAGES    = new Set(['en', 'zh']);
const VALID_THEMES       = new Set(['light', 'dark']);
const VALID_STATUSES     = new Set(['IDLE', 'PLAYING', 'FINISHED']);
const MAX_CELLS = 13;

// ─── Primitive helpers ────────────────────────────────────────────────────────

const isStr  = (v: unknown): v is string  => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isNum  = (v: unknown): v is number  => typeof v === 'number' && Number.isFinite(v);
const isMatchPhase = (v: unknown): v is MatchPhase => isStr(v) && VALID_MATCH_PHASES.has(v);

/** Coerce v to an integer in [lo, hi], returning fb on failure. */
const clampInt = (v: unknown, lo: number, hi: number, fb: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : fb;
};

// ─── GameAction validator ─────────────────────────────────────────────────────

function sanitizeAction(raw: Record<string, unknown>): GameAction | null {
  if (!isStr(raw.type) || !VALID_ACTION_TYPES.has(raw.type)) return null;

  switch (raw.type) {
    case 'CLICK_CELL':
      return { type: 'CLICK_CELL', cellIndex: clampInt(raw.cellIndex, 0, MAX_CELLS - 1, 0) };

    case 'ABANDON_CHALLENGE': return { type: 'ABANDON_CHALLENGE' };
    case 'DEFEND':            return { type: 'DEFEND' };
    case 'INTERACTION':       return { type: 'INTERACTION' };

    case 'COMPLETE_GAME':
      if (!isBool(raw.success)) return null;
      return { type: 'COMPLETE_GAME', success: raw.success };

    case 'USE_SKILL':
      if (raw.skill !== 'FREEZE' && raw.skill !== 'DUEL') return null;
      return { type: 'USE_SKILL', skill: raw.skill as 'FREEZE' | 'DUEL' };

    case 'DUEL_PICK_CELL':
      return { type: 'DUEL_PICK_CELL', cellIndex: clampInt(raw.cellIndex, 0, MAX_CELLS - 1, 0) };

    case 'USE_FUN_CARD':
      if (!isStr(raw.cardId) || !VALID_FUN_CARD_IDS.has(raw.cardId)) return null;
      return { type: 'USE_FUN_CARD', cardId: raw.cardId as FunCardId };

    default: return null;
  }
}

// ─── NetworkMessage validator ─────────────────────────────────────────────────

/**
 * Validate and reconstruct a NetworkMessage from an untrusted peer payload.
 * Returns null if the message is malformed or carries disallowed values.
 */
export function sanitizeNetworkMessage(raw: unknown): NetworkMessage | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;

  if (!isStr(m.type) || !VALID_MSG_TYPES.has(m.type)) return null;

  switch (m.type) {
    case 'JOIN_REQUEST': {
      const guestSessionId = m.guestSessionId === null
        ? null
        : (isStr(m.guestSessionId) && m.guestSessionId.length <= 128 ? m.guestSessionId : null);
      return { type: 'JOIN_REQUEST', guestSessionId, lastRevision: clampInt(m.lastRevision, 0, Number.MAX_SAFE_INTEGER, 0) };
    }

    case 'SESSION_SYNC': {
      if (!isBool(m.accepted)) return null;
      if (!isMatchPhase(m.phase)) return null;
      if (!isStr(m.reason) || !VALID_SESSION_SYNC_REASONS.has(m.reason)) return null;
      const guestSessionId = m.guestSessionId === null
        ? null
        : (isStr(m.guestSessionId) && m.guestSessionId.length <= 128 ? m.guestSessionId : null);
      const gameMode: GameMode = m.gameMode === 'FUN' ? 'FUN' : 'STANDARD';
      return {
        type: 'SESSION_SYNC',
        accepted: m.accepted,
        guestSessionId,
        phase: m.phase,
        revision: clampInt(m.revision, 0, Number.MAX_SAFE_INTEGER, 0),
        reason: m.reason as 'OK' | 'ROOM_BUSY' | 'SESSION_EXPIRED',
        gameMode,
      };
    }

    case 'PING': {
      if (!isStr(m.pingId) || m.pingId.length > 128) return null;
      return { type: 'PING', pingId: m.pingId, sentAt: clampInt(m.sentAt, 0, Number.MAX_SAFE_INTEGER, 0) };
    }

    case 'PONG': {
      if (!isStr(m.pingId) || m.pingId.length > 128) return null;
      return { type: 'PONG', pingId: m.pingId, sentAt: clampInt(m.sentAt, 0, Number.MAX_SAFE_INTEGER, 0) };
    }

    case 'HEARTBEAT': {
      if (m.id !== 'P1' && m.id !== 'P2') return null;
      const ts = clampInt(m.timestamp, 0, Number.MAX_SAFE_INTEGER, 0);
      return { type: 'HEARTBEAT', id: m.id as 'P1' | 'P2', timestamp: ts };
    }

    case 'STATE_UPDATE': {
      // Light shape-check — HOST state is produced by the same trusted code on the other end.
      // A fully expanded deep validator would need to mirror the entire GameState type.
      if (m.state === null || typeof m.state !== 'object' || Array.isArray(m.state)) return null;
      const s = m.state as Record<string, unknown>;
      if (!isStr(s.status) || !VALID_STATUSES.has(s.status)) return null;
      if (!Array.isArray(s.cells) || s.cells.length > MAX_CELLS) return null;
      if (typeof s.p1 !== 'object' || s.p1 === null) return null;
      if (typeof s.p2 !== 'object' || s.p2 === null) return null;
      if (!isMatchPhase(m.phase)) return null;
      const revision = clampInt(m.revision, 0, Number.MAX_SAFE_INTEGER, 0);
      return {
        type: 'STATE_UPDATE',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state: m.state as any,
        phase: m.phase,
        revision,
        serverTime: isNum(m.serverTime) ? (m.serverTime as number) : undefined,
      };
    }

    case 'ACTION': {
      if (m.action === null || typeof m.action !== 'object' || Array.isArray(m.action)) return null;
      if (!isStr(m.actionId) || m.actionId.length > 128) return null;
      if (m.phase !== 'PLAYING') return null;
      const action = sanitizeAction(m.action as Record<string, unknown>);
      if (!action) return null;
      return {
        type: 'ACTION',
        action,
        actionId: m.actionId,
        seq: clampInt(m.seq, 0, Number.MAX_SAFE_INTEGER, 0),
        phase: 'PLAYING',
      };
    }

    case 'RESTART_REQUEST':  return { type: 'RESTART_REQUEST' };
    case 'RESTART_RESPONSE': return { type: 'RESTART_RESPONSE', accepted: isBool(m.accepted) ? m.accepted : false };
    case 'SKILL_PICK_PHASE': return { type: 'SKILL_PICK_PHASE', revision: clampInt(m.revision, 0, Number.MAX_SAFE_INTEGER, 0) };
    case 'RPS_PHASE':        return { type: 'RPS_PHASE', revision: clampInt(m.revision, 0, Number.MAX_SAFE_INTEGER, 0) };

    case 'SKILL_PICK': {
      if (m.phase !== 'SKILL_PICK') return null;
      if (!Array.isArray(m.skills)) return null;
      const skills = (m.skills as unknown[])
        .filter((s): s is string => isStr(s) && VALID_SKILLS.has(s))
        .slice(0, 2);
      return { type: 'SKILL_PICK', skills, phase: 'SKILL_PICK' };
    }

    case 'RPS_PICK': {
      if (m.phase !== 'RPS') return null;
      if (!isStr(m.move) || !VALID_RPS_MOVES.has(m.move)) return null;
      return { type: 'RPS_PICK', move: m.move as RpsMove, phase: 'RPS' };
    }

    case 'RPS_RESULT': {
      if (!isStr(m.p1Move) || !VALID_RPS_MOVES.has(m.p1Move)) return null;
      if (!isStr(m.p2Move) || !VALID_RPS_MOVES.has(m.p2Move)) return null;
      if (m.roundWinner !== 'P1' && m.roundWinner !== 'P2' && m.roundWinner !== 'DRAW') return null;
      const round = clampInt(m.round, 1, 3, 1);
      if (m.scores === null || typeof m.scores !== 'object' || Array.isArray(m.scores)) return null;
      const sc = m.scores as Record<string, unknown>;
      const scores = { P1: clampInt(sc['P1'], 0, 3, 0), P2: clampInt(sc['P2'], 0, 3, 0) };
      const hw = (m.headstartWinner === 'P1' || m.headstartWinner === 'P2' || m.headstartWinner === 'DRAW')
        ? m.headstartWinner as 'P1' | 'P2' | 'DRAW'
        : null;
      return { type: 'RPS_RESULT', p1Move: m.p1Move as RpsMove, p2Move: m.p2Move as RpsMove, roundWinner: m.roundWinner as 'P1' | 'P2' | 'DRAW', round, scores, headstartWinner: hw, revision: clampInt(m.revision, 0, Number.MAX_SAFE_INTEGER, 0) };
    }

    default: return null;
  }
}

// ─── localStorage safe loaders ────────────────────────────────────────────────

export function sanitizeSettings(raw: unknown, defaults: AppSettings): AppSettings {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const s = raw as Record<string, unknown>;
  return {
    language:     (isStr(s.language) && VALID_LANGUAGES.has(s.language)) ? s.language as 'en' | 'zh'     : defaults.language,
    theme:        (isStr(s.theme)    && VALID_THEMES.has(s.theme))       ? s.theme    as 'light' | 'dark' : defaults.theme,
    soundEnabled: isBool(s.soundEnabled) ? s.soundEnabled : defaults.soundEnabled,
    musicEnabled: isBool(s.musicEnabled) ? s.musicEnabled : defaults.musicEnabled,
  };
}

export function sanitizeStats(raw: unknown, defaults: UserStats): UserStats {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const s = raw as Record<string, unknown>;

  const soloRunsByDiff: Record<string, number> = {};
  if (typeof s.soloRunsByDiff === 'object' && s.soloRunsByDiff !== null && !Array.isArray(s.soloRunsByDiff)) {
    for (const k of ['EASY', 'NORMAL', 'HARD', 'EXPERT'] as const) {
      const v = (s.soloRunsByDiff as Record<string, unknown>)[k];
      if (isNum(v)) soloRunsByDiff[k] = clampInt(v, 0, 86_400_000, 0);
    }
  }

  const recentOnlineResults = Array.isArray(s.recentOnlineResults)
    ? (s.recentOnlineResults as unknown[])
        .filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object' && !Array.isArray(r))
        .map((r) => {
          const result = r.result === 'WIN' || r.result === 'LOSE' || r.result === 'DRAW' ? r.result : null;
          const mode = r.mode === 'FUN' ? 'FUN' : 'STANDARD';
          const at = clampInt(r.at, 0, Number.MAX_SAFE_INTEGER, 0);
          return result ? { at, result, mode } : null;
        })
        .filter((r): r is { at: number; result: 'WIN' | 'LOSE' | 'DRAW'; mode: 'STANDARD' | 'FUN' } => r !== null)
        .slice(-50)
    : defaults.recentOnlineResults;

  return {
    onlineWins:     clampInt(s.onlineWins,    0, 1_000_000, defaults.onlineWins),
    onlineLosses:   clampInt(s.onlineLosses,  0, 1_000_000, defaults.onlineLosses),
    onlineDraws:    clampInt(s.onlineDraws,   0, 1_000_000, defaults.onlineDraws),
    fastestSoloRun: clampInt(s.fastestSoloRun, 0, 86_400_000, defaults.fastestSoloRun),
    totalSteals:    clampInt(s.totalSteals,   0, 1_000_000, defaults.totalSteals),
    totalDefends:   clampInt(s.totalDefends,  0, 1_000_000, defaults.totalDefends),
    gamesPlayed:    clampInt(s.gamesPlayed,   0, 1_000_000, defaults.gamesPlayed),
    totalFreezes:   clampInt(s.totalFreezes,  0, 1_000_000, defaults.totalFreezes),
    totalDuelWins:  clampInt(s.totalDuelWins, 0, 1_000_000, defaults.totalDuelWins),
    totalFunCardsUsed: clampInt(s.totalFunCardsUsed, 0, 1_000_000, defaults.totalFunCardsUsed),
    rpsRoundsPlayed: clampInt(s.rpsRoundsPlayed, 0, 1_000_000, defaults.rpsRoundsPlayed),
    rpsRoundsWon: clampInt(s.rpsRoundsWon, 0, 1_000_000, defaults.rpsRoundsWon),
    rpsRoundsDraw: clampInt(s.rpsRoundsDraw, 0, 1_000_000, defaults.rpsRoundsDraw),
    rpsSeriesPlayed: clampInt(s.rpsSeriesPlayed, 0, 1_000_000, defaults.rpsSeriesPlayed),
    rpsSeriesWon: clampInt(s.rpsSeriesWon, 0, 1_000_000, defaults.rpsSeriesWon),
    rpsSeriesDraw: clampInt(s.rpsSeriesDraw, 0, 1_000_000, defaults.rpsSeriesDraw),
    recentOnlineResults,
    unlockedAchievements: Array.isArray(s.unlockedAchievements)
      ? (s.unlockedAchievements as unknown[])
          .filter((v): v is string => isStr(v) && v.length <= 64)
          .slice(0, 200)
      : defaults.unlockedAchievements,
    practiceRecords: Array.isArray(s.practiceRecords)
      ? (s.practiceRecords as unknown[]).filter(
          (r): r is PracticeRecord =>
            r !== null && typeof r === 'object' && !Array.isArray(r) &&
            isStr((r as Record<string, unknown>).gameId) &&
            isNum((r as Record<string, unknown>).timestamp)
        ).slice(0, 1000)
      : defaults.practiceRecords,
    soloRunsByDiff,
  };
}

export function sanitizeGuestResumeSession(raw: unknown): GuestResumeSession | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  if (!isStr(s.roomId) || !isValidRoomCode(s.roomId)) return null;
  if (!isStr(s.guestSessionId) || s.guestSessionId.length > 128) return null;
  if (!isMatchPhase(s.phase)) return null;

  return {
    roomId: s.roomId,
    guestSessionId: s.guestSessionId,
    lastRevision: clampInt(s.lastRevision, 0, Number.MAX_SAFE_INTEGER, 0),
    phase: s.phase,
    savedAt: clampInt(s.savedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

export function sanitizeHostResumeSession(raw: unknown): HostResumeSession | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  if (!isStr(s.roomId) || !isValidRoomCode(s.roomId)) return null;
  if (!isMatchPhase(s.phase)) return null;

  const stateMsg = sanitizeNetworkMessage({
    type: 'STATE_UPDATE',
    state: s.gameState,
    phase: s.phase,
    revision: s.revision,
  });
  if (!stateMsg || stateMsg.type !== 'STATE_UPDATE') return null;

  const mySkillPicks = Array.isArray(s.mySkillPicks)
    ? (s.mySkillPicks as unknown[]).filter((v): v is string => isStr(v) && VALID_SKILLS.has(v)).slice(0, 2)
    : [];

  const p2SkillPicks = s.p2SkillPicks === null
    ? null
    : (Array.isArray(s.p2SkillPicks)
      ? (s.p2SkillPicks as unknown[]).filter((v): v is string => isStr(v) && VALID_SKILLS.has(v)).slice(0, 2)
      : null);

  if (s.rpsState === null || typeof s.rpsState !== 'object' || Array.isArray(s.rpsState)) return null;
  const rs = s.rpsState as Record<string, unknown>;
  if (rs.scores === null || typeof rs.scores !== 'object' || Array.isArray(rs.scores)) return null;
  const scoresRaw = rs.scores as Record<string, unknown>;

  const myMove = (rs.myMove === null || (isStr(rs.myMove) && VALID_RPS_MOVES.has(rs.myMove)))
    ? rs.myMove as RpsMove | null
    : null;
  const p2Move = (rs.p2Move === null || (isStr(rs.p2Move) && VALID_RPS_MOVES.has(rs.p2Move)))
    ? rs.p2Move as RpsMove | null
    : null;

  const guestSessionId = s.guestSessionId === null
    ? null
    : (isStr(s.guestSessionId) && s.guestSessionId.length <= 128 ? s.guestSessionId : null);

  return {
    roomId: s.roomId,
    phase: s.phase,
    revision: clampInt(s.revision, 0, Number.MAX_SAFE_INTEGER, 0),
    guestSessionId,
    gameState: stateMsg.state,
    mySkillPicks,
    p2SkillPicks,
    rpsState: {
      round: clampInt(rs.round, 1, 3, 1),
      scores: {
        P1: clampInt(scoresRaw['P1'], 0, 3, 0),
        P2: clampInt(scoresRaw['P2'], 0, 3, 0),
      },
      myMove,
      p2Move,
    },
    savedAt: clampInt(s.savedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

// ─── Input helpers ────────────────────────────────────────────────────────────

/** Strip anything that isn't a digit, limit to 4 chars. */
export const sanitizeRoomCode = (raw: string): string =>
  raw.replace(/\D/g, '').slice(0, 4);

/** A valid room code is exactly 4 ASCII digits. */
export const isValidRoomCode = (code: string): boolean =>
  /^\d{4}$/.test(code);

// ─── BroadcastChannel message validator ──────────────────────────────────────

export type LobbyMessage =
  | { type: 'ROOM_OPEN';   code: string }
  | { type: 'ROOM_CLOSED'; code: string }
  | { type: 'ROOM_QUERY' };

export function sanitizeLobbyMessage(raw: unknown): LobbyMessage | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;

  if (m.type === 'ROOM_QUERY') return { type: 'ROOM_QUERY' };

  if (m.type === 'ROOM_OPEN' || m.type === 'ROOM_CLOSED') {
    if (!isStr(m.code) || !isValidRoomCode(m.code)) return null;
    return { type: m.type, code: m.code };
  }

  return null;
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────

/**
 * Token-bucket rate limiter.  Used to prevent a malicious GUEST from
 * flooding the HOST with game actions.
 */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  /** Returns true if the action is permitted, false if rate-limited. */
  allow(key: string, maxPerWindow: number, windowMs: number): boolean {
    const now = Date.now();
    const b   = this.buckets.get(key);
    if (!b || now > b.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (b.count >= maxPerWindow) return false;
    b.count++;
    return true;
  }

  /** Clear all buckets (call on new game start). */
  reset(): void { this.buckets.clear(); }
}
