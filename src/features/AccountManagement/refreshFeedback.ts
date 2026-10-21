import type { TFunction } from "i18next"

interface RefreshSummary {
  success: number
  failed: number
  refreshedCount: number
  checkInStatusFailedCount?: number
}

/** Preserves account refresh feedback while reporting a separate check-in query failure. */
export function getAccountRefreshFeedback(
  result: RefreshSummary,
  t: TFunction,
): string | null {
  const total = result.success + result.failed
  if (total === 0) return null
  const message =
    result.failed > 0
      ? t("account:refresh.refreshComplete", {
          success: result.success,
          failed: result.failed,
        })
      : result.refreshedCount < total
        ? t("account:refresh.refreshPartialSkipped", {
            success: result.refreshedCount,
            skipped: total - result.refreshedCount,
          })
        : t("account:refresh.refreshSuccess")
  return result.checkInStatusFailedCount
    ? `${message} · ${t("account:refresh.checkInStatusFailed", { count: result.checkInStatusFailedCount })}`
    : message
}
