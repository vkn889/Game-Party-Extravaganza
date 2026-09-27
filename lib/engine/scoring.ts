import type { BaseGameState } from '@/lib/types';

/** Ids with the highest score; ties share the win. Empty if nobody scored. */
export function topScorers(scores: Record<string, number>, ids: string[] = Object.keys(scores)): string[] {
  if (ids.length === 0) return [];
  const best = Math.max(...ids.map((id) => scores[id] ?? 0));
  if (best <= 0 && ids.every((id) => (scores[id] ?? 0) === 0)) return [];
  return ids.filter((id) => (scores[id] ?? 0) === best);
}

export function defaultWinners(state: BaseGameState): string[] {
  return topScorers(
    state.scores,
    state.players.map((p) => p.id),
  );
}

/** Counts votes per choice. `votes` maps voter id to choice id. */
export function tally(votes: Record<string, string>, bonus?: string | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const choice of Object.values(votes)) counts[choice] = (counts[choice] ?? 0) + 1;
  if (bonus) counts[bonus] = (counts[bonus] ?? 0) + 1;
  return counts;
}

/** Choices with the most votes (ties included); empty when there were no votes. */
export function plurality(counts: Record<string, number>): string[] {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) return [];
  const max = Math.max(...entries.map(([, n]) => n));
  return entries.filter(([, n]) => n === max).map(([id]) => id);
}

/** The single winning choice, or null on a tie or no votes. */
export function clearWinner(counts: Record<string, number>): string | null {
  const top = plurality(counts);
  return top.length === 1 ? top[0] : null;
}

/** Ranks players by score (desc) with shared ranks for ties. */
export function rank(scores: Record<string, number>, ids: string[]): { id: string; score: number; rank: number }[] {
  const sorted = ids.map((id) => ({ id, score: scores[id] ?? 0 })).sort((a, b) => b.score - a.score);
  let lastScore = Number.NaN;
  let lastRank = 0;
  return sorted.map((entry, i) => {
    if (entry.score !== lastScore) {
      lastRank = i + 1;
      lastScore = entry.score;
    }
    return { ...entry, rank: lastRank };
  });
}
