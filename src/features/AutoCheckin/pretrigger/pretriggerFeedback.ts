import type { TFunction } from "i18next"

import toast from "~/lib/notify"
import type { AutoCheckinRunSummary } from "~/types/autoCheckin"

/** Shows non-blocking completion feedback; returns true only for failure details. */
export function presentUiOpenPretriggerCompletion(
  summary: AutoCheckinRunSummary | null | undefined,
  t: TFunction,
): boolean {
  if (!summary) return false
  if (summary.failedCount > 0) return true
  if (summary.executed === 0) return false

  const counts = {
    success: Math.max(
      summary.successCount - (summary.alreadyCheckedCount ?? 0),
      0,
    ),
    alreadyChecked: summary.alreadyCheckedCount ?? 0,
    skipped: summary.skippedCount,
    uncertain: summary.uncertainCount ?? 0,
  }
  if (counts.uncertain > 0) {
    toast.warning(t("autoCheckin:uiOpenPretrigger.uncertainToast", counts))
  } else {
    toast.success(t("autoCheckin:uiOpenPretrigger.completedToast", counts))
  }
  return false
}
