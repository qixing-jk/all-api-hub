/**
 * Calculates today's bounded share of a recent usage total.
 */
export function getUsagePercentShare(today: number, total: number) {
  if (!Number.isFinite(today) || !Number.isFinite(total) || total <= 0) {
    return 0
  }

  return Math.min(100, Math.max(0, Math.round((today / total) * 100)))
}
