export function rerankCandidates(candidates: any[]): any[] {
  // Sort candidates by combined score & category priority
  return [...candidates].sort((a, b) => {
    if (Math.abs(a.score - b.score) < 0.05) {
      return b.priority - a.priority;
    }
    return b.score - a.score;
  });
}
