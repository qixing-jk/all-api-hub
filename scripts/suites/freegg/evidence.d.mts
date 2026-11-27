export function planReset(now: number): number
export function currentResultStatus(
  result: { timestamp: number; status: string } | undefined,
  clickedAt: number,
): string | undefined
export function assertPreparationWindow(resetAt: number, now: number): void
export function findNewAllowance<T>(
  before: { items: T[]; serverTime: number },
  after: { items: T[]; serverTime: number },
  scope: { userId: string; dayStart: number },
): T | undefined
export function findAllowance<T>(
  items: T[],
  window: { userId: string; from: number; to: number },
): T | undefined
