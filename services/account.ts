import type { Difficulty, PracticeRecord, RecentOnlineResult, UserStats } from '../types';
import { sanitizeStats } from './sanitize';

const DIFFICULTIES: Difficulty[] = ['EASY', 'NORMAL', 'HARD', 'EXPERT'];
const MIN_NICKNAME_LENGTH = 2;
const MAX_NICKNAME_LENGTH = 24;

const mergeCounter = (localValue: number | undefined, remoteValue: number | undefined) =>
  Math.max(localValue ?? 0, remoteValue ?? 0);

const mergeBestTime = (localValue: number | undefined, remoteValue: number | undefined) => {
  const candidates = [localValue, remoteValue].filter((value): value is number => typeof value === 'number' && value > 0);
  return candidates.length > 0 ? Math.min(...candidates) : 0;
};

const dedupePracticeRecords = (records: PracticeRecord[]) => {
  const merged = new Map<string, PracticeRecord>();
  for (const record of records) {
    const key = [
      record.gameId,
      record.timestamp,
      record.value,
      record.config.difficulty,
      record.config.isBattlePreset ? '1' : '0',
      record.config.tutorialEnabled ? '1' : '0',
      record.isWin ? '1' : '0',
    ].join(':');
    merged.set(key, record);
  }
  return Array.from(merged.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-500);
};

const dedupeRecentOnlineResults = (results: RecentOnlineResult[]) => {
  const merged = new Map<string, RecentOnlineResult>();
  for (const result of results) {
    merged.set(`${result.at}:${result.result}:${result.mode}`, result);
  }
  return Array.from(merged.values())
    .sort((a, b) => a.at - b.at)
    .slice(-100);
};

export const normalizeNickname = (value?: string | null) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  return trimmed.slice(0, MAX_NICKNAME_LENGTH);
};

export const isValidNickname = (value?: string | null) =>
  normalizeNickname(value).length >= MIN_NICKNAME_LENGTH;

export const getDefaultNickname = (email?: string | null) => {
  const raw = normalizeNickname((email ?? '').split('@')[0]);
  if (raw.length >= MIN_NICKNAME_LENGTH) return raw;
  return 'Grid Player';
};

export const mergeUserStats = (localStats: UserStats, remoteStats: unknown, defaults: UserStats) => {
  const safeLocal = sanitizeStats(localStats, defaults);
  const safeRemote = sanitizeStats(remoteStats, defaults);

  const merged: UserStats = {
    ...defaults,
    onlineWins: mergeCounter(safeLocal.onlineWins, safeRemote.onlineWins),
    onlineLosses: mergeCounter(safeLocal.onlineLosses, safeRemote.onlineLosses),
    onlineDraws: mergeCounter(safeLocal.onlineDraws, safeRemote.onlineDraws),
    modeStandardWins: mergeCounter(safeLocal.modeStandardWins, safeRemote.modeStandardWins),
    modeStandardLosses: mergeCounter(safeLocal.modeStandardLosses, safeRemote.modeStandardLosses),
    modeStandardDraws: mergeCounter(safeLocal.modeStandardDraws, safeRemote.modeStandardDraws),
    modeFunWins: mergeCounter(safeLocal.modeFunWins, safeRemote.modeFunWins),
    modeFunLosses: mergeCounter(safeLocal.modeFunLosses, safeRemote.modeFunLosses),
    modeFunDraws: mergeCounter(safeLocal.modeFunDraws, safeRemote.modeFunDraws),
    fastestSoloRun: mergeBestTime(safeLocal.fastestSoloRun, safeRemote.fastestSoloRun),
    totalSteals: mergeCounter(safeLocal.totalSteals, safeRemote.totalSteals),
    totalDefends: mergeCounter(safeLocal.totalDefends, safeRemote.totalDefends),
    gamesPlayed: mergeCounter(safeLocal.gamesPlayed, safeRemote.gamesPlayed),
    unlockedAchievements: Array.from(new Set([...safeRemote.unlockedAchievements, ...safeLocal.unlockedAchievements])),
    practiceRecords: dedupePracticeRecords([...safeRemote.practiceRecords, ...safeLocal.practiceRecords]),
    totalFreezes: mergeCounter(safeLocal.totalFreezes, safeRemote.totalFreezes),
    totalDuelWins: mergeCounter(safeLocal.totalDuelWins, safeRemote.totalDuelWins),
    totalFunCardsUsed: mergeCounter(safeLocal.totalFunCardsUsed, safeRemote.totalFunCardsUsed),
    rpsRoundsPlayed: mergeCounter(safeLocal.rpsRoundsPlayed, safeRemote.rpsRoundsPlayed),
    rpsRoundsWon: mergeCounter(safeLocal.rpsRoundsWon, safeRemote.rpsRoundsWon),
    rpsRoundsDraw: mergeCounter(safeLocal.rpsRoundsDraw, safeRemote.rpsRoundsDraw),
    rpsSeriesPlayed: mergeCounter(safeLocal.rpsSeriesPlayed, safeRemote.rpsSeriesPlayed),
    rpsSeriesWon: mergeCounter(safeLocal.rpsSeriesWon, safeRemote.rpsSeriesWon),
    rpsSeriesDraw: mergeCounter(safeLocal.rpsSeriesDraw, safeRemote.rpsSeriesDraw),
    rpsPickRock: mergeCounter(safeLocal.rpsPickRock, safeRemote.rpsPickRock),
    rpsPickPaper: mergeCounter(safeLocal.rpsPickPaper, safeRemote.rpsPickPaper),
    rpsPickScissors: mergeCounter(safeLocal.rpsPickScissors, safeRemote.rpsPickScissors),
    recentOnlineResults: dedupeRecentOnlineResults([...safeRemote.recentOnlineResults, ...safeLocal.recentOnlineResults]),
    soloRunsByDiff: {},
  };

  for (const difficulty of DIFFICULTIES) {
    const mergedBest = mergeBestTime(safeLocal.soloRunsByDiff?.[difficulty], safeRemote.soloRunsByDiff?.[difficulty]);
    if (mergedBest > 0) {
      merged.soloRunsByDiff[difficulty] = mergedBest;
    }
  }

  return sanitizeStats(merged, defaults);
};
