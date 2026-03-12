import { CellData, PlayerId } from '../types';
import { WIN_PATTERNS } from '../constants';

export const checkWinner = (cells: CellData[]): PlayerId | 'DRAW' | null => {
  // Check lines
  for (const pattern of WIN_PATTERNS) {
    const [a, b, c] = pattern;
    if (cells[a].owner && cells[a].owner === cells[b].owner && cells[a].owner === cells[c].owner) {
      return cells[a].owner;
    }
  }

  // Check if board full
  const allCaptured = cells.every(c => c.owner !== null);
  if (allCaptured) {
    const p1Count = cells.filter(c => c.owner === 'P1').length;
    const p2Count = cells.filter(c => c.owner === 'P2').length;
    if (p1Count > p2Count) return 'P1';
    if (p2Count > p1Count) return 'P2';
    return 'DRAW';
  }

  return null;
};

export const shuffleGames = (gameIds: string[]): string[] => {
  const array = [...gameIds];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};
