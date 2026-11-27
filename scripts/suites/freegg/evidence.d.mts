export function planReset(now: number): number
export function currentResultStatus(
  result: { timestamp: number; status: string } | undefined,
  clickedAt: number,
): string | undefined
export function assertPreparationWindow(resetAt: number, now: number): void
export function findAllowance<T>(
  items: T[],
  window: { userId: string; from: number; to: number },
): T | undefined
