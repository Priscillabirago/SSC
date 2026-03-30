/** Pure selection logic for which badges to show in the dashboard card. */

export interface BadgeForVisibility {
  id: string;
  earned: boolean;
  progress: number;
  threshold: number;
}

export function selectVisibleBadges<T extends BadgeForVisibility>(
  badges: T[],
): T[] {
  const earned = badges.filter((b) => b.earned);
  const unearned = badges.filter((b) => !b.earned);

  if (unearned.length === 0) return earned;

  const nextUp = unearned.reduce((closest, b) => {
    const closestPct = closest.progress / closest.threshold;
    const bPct = b.progress / b.threshold;
    return bPct > closestPct ? b : closest;
  }, unearned[0]);

  return [...earned, nextUp];
}
