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
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
          <CircleCheck className="h-3 w-3" />
          {t("execution.status.success")}
        </span>
      )
    case CHECKIN_RESULT_STATUS.ALREADY_CHECKED:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          <CircleCheck className="h-3 w-3" />
          {t("execution.status.alreadyChecked")}
        </span>
      )
    case CHECKIN_RESULT_STATUS.FAILED:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
          <CircleX className="h-3 w-3" />
          {t("execution.status.failed")}
        </span>
      )
    case CHECKIN_RESULT_STATUS.SKIPPED:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
          <TriangleAlert className="h-3 w-3" />
          {t("execution.status.skipped")}
        </span>
      )
    case CHECKIN_RESULT_STATUS.UNCERTAIN:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-100">
          <TriangleAlert className="h-3 w-3" />
          {t("execution.status.uncertain")}
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200">
          {status}
        </span>
      )
  }
}
