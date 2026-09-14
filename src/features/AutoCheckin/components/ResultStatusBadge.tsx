import { CircleCheck, CircleX, TriangleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  CHECKIN_RESULT_STATUS,
  type CheckinResultStatus,
} from "~/types/autoCheckin"

/** Shared result badge for execution history and adaptation reports. */
export default function ResultStatusBadge({
  status,
}: {
  status: CheckinResultStatus
}) {
  const { t } = useTranslation("autoCheckin")
  switch (status) {
    case CHECKIN_RESULT_STATUS.SUCCESS:
      return (
        <span className="bg-success-soft text-success-soft-foreground inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium">
          <CircleCheck className="h-3 w-3" />
          {t("execution.status.success")}
        </span>
      )
    case CHECKIN_RESULT_STATUS.ALREADY_CHECKED:
      return (
        <span className="bg-theme-100 text-theme-800 dark:bg-theme-900 dark:text-theme-200 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium">
          <CircleCheck className="h-3 w-3" />
          {t("execution.status.alreadyChecked")}
        </span>
      )
    case CHECKIN_RESULT_STATUS.FAILED:
      return (
        <span className="bg-destructive-soft text-destructive-soft-foreground inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium">
          <CircleX className="h-3 w-3" />
          {t("execution.status.failed")}
        </span>
      )
    case CHECKIN_RESULT_STATUS.SKIPPED:
      return (
        <span className="bg-warning-soft text-warning-soft-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
          <TriangleAlert className="h-3 w-3" />
          {t("execution.status.skipped")}
        </span>
      )
    case CHECKIN_RESULT_STATUS.UNCERTAIN:
      return (
        <span className="bg-warning-soft text-warning-soft-foreground inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium">
          <TriangleAlert className="h-3 w-3" />
          {t("execution.status.uncertain")}
        </span>
      )
    default:
      return (
        <span className="bg-muted text-secondary-foreground dark:bg-secondary inline-flex items-center rounded-full px-2 py-1 text-xs font-medium">
          {status}
        </span>
      )
  }
}
