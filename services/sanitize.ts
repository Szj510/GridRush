/**
 * sanitize.ts — Input/output validation & rate limiting.
 *
 * GridRush has no backend; all P2P messages, localStorage data, and
 * cross-tab (BroadcastChannel) events are treated as UNTRUSTED input
 * and must be validated before use.
 */

import type { NetworkMessage, GameAction, AppSettings, UserStats, PracticeRecord } from '../types';

// ─── Allow-lists ─────────────────────────────────────────────────────────────

const VALID_MSG_TYPES    = new Set(['STATE_UPDATE', 'ACTION', 'HEARTBEAT', 'RESTART', 'SKILL_PICK_PHASE', 'SKILL_PICK']);
const VALID_ACTION_TYPES = new Set(['CLICK_CELL', 'ABANDON_CHALLENGE', 'DEFEND', 'INTERACTION', 'COMPLETE_GAME', 'USE_SKILL', 'DUEL_PICK_CELL']);
const VALID_SKILLS       = new Set(['STEAL', 'FREEZE', 'DUEL']);
const VALID_LANGUAGES    = new Set(['en', 'zh']);
const VALID_THEMES       = new Set(['light', 'dark']);
const VALID_STATUSES     = new Set(['IDLE', 'PLAYING', 'FINISHED']);
const MAX_CELLS = 13;

// ─── Primitive helpers ────────────────────────────────────────────────────────

const isStr  = (v: unknown): v is string  => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isNum  = (v: unknown): v is number  => typeof v === 'number' && Number.isFinite(v);

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
      return {
        type: 'STATE_UPDATE',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state: m.state as any,
        serverTime: isNum(m.serverTime) ? (m.serverTime as number) : undefined,
      };
    }

    case 'ACTION': {
      if (m.action === null || typeof m.action !== 'object' || Array.isArray(m.action)) return null;
      const action = sanitizeAction(m.action as Record<string, unknown>);
      if (!action) return null;
      return { type: 'ACTION', action };
    }

    case 'RESTART':          return { type: 'RESTART' };
    case 'SKILL_PICK_PHASE': return { type: 'SKILL_PICK_PHASE' };

    case 'SKILL_PICK': {
      if (!Array.isArray(m.skills)) return null;
      const skills = (m.skills as unknown[])
        .filter((s): s is string => isStr(s) && VALID_SKILLS.has(s))
        .slice(0, 2);
      return { type: 'SKILL_PICK', skills };
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

  return {
    onlineWins:     clampInt(s.onlineWins,    0, 1_000_000, defaults.onlineWins),
    fastestSoloRun: clampInt(s.fastestSoloRun, 0, 86_400_000, defaults.fastestSoloRun),
    totalSteals:    clampInt(s.totalSteals,   0, 1_000_000, defaults.totalSteals),
    totalDefends:   clampInt(s.totalDefends,  0, 1_000_000, defaults.totalDefends),
    gamesPlayed:    clampInt(s.gamesPlayed,   0, 1_000_000, defaults.gamesPlayed),
    totalFreezes:   clampInt(s.totalFreezes,  0, 1_000_000, defaults.totalFreezes),
    totalDuelWins:  clampInt(s.totalDuelWins, 0, 1_000_000, defaults.totalDuelWins),
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
