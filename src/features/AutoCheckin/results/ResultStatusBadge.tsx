import {
  CircleCheck,
  CircleMinus,
  CircleX,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "~/lib/utils"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinResultStatus,
} from "~/types/autoCheckin"

/** Keeps known result labels and icons on the same density-aware badge layout. */
function renderResultBadge(Icon: LucideIcon, label: string, className: string) {
  return (
    <span
      className={cn(
        "gap-y-density-1 py-density-1 inline-flex items-center gap-x-1 rounded-full px-2 text-xs font-medium",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

/** Shared result badge for execution history and adaptation reports. */
export default function ResultStatusBadge({
  status,
}: {
  status: CheckinResultStatus
}) {
  const { t } = useTranslation("autoCheckin")
  switch (status) {
    case CHECKIN_RESULT_STATUS.SUCCESS:
      return renderResultBadge(
        CircleCheck,
        t("execution.status.success"),
        "bg-success-soft text-success-soft-foreground",
      )
    case CHECKIN_RESULT_STATUS.ALREADY_CHECKED:
      return renderResultBadge(
        CircleCheck,
        t("execution.status.alreadyChecked"),
        "bg-success-soft text-success-soft-foreground",
      )
    case CHECKIN_RESULT_STATUS.FAILED:
      return renderResultBadge(
        CircleX,
        t("execution.status.failed"),
        "bg-destructive-soft text-destructive-soft-foreground",
      )
    case CHECKIN_RESULT_STATUS.SKIPPED:
      return renderResultBadge(
        CircleMinus,
        t("execution.status.skipped"),
        "bg-muted text-secondary-foreground",
      )
    case CHECKIN_RESULT_STATUS.UNCERTAIN:
      return renderResultBadge(
        TriangleAlert,
        t("execution.status.uncertain"),
        "bg-warning-soft text-warning-soft-foreground",
      )
    default:
      return (
        <span className="bg-muted text-secondary-foreground dark:bg-secondary py-density-1 inline-flex items-center rounded-full px-2 text-xs font-medium">
          {status}
        </span>
      )
  }
}
