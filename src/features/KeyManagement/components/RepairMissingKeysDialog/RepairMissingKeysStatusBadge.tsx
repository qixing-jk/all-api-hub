import type { TFunction } from "i18next"

import { Badge, Spinner } from "~/components/ui"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"

interface RepairMissingKeysStatusBadgeProps {
  progress: AccountKeyRepairProgress | null
  t: TFunction
}

/**
 * Renders the compact status badge for the current repair job state.
 */
export function RepairMissingKeysStatusBadge({
  progress,
  t,
}: RepairMissingKeysStatusBadgeProps) {
  if (!progress) return null

  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Running) {
    return (
      <Badge variant="info" size="sm" className="shrink-0 border-transparent">
        <Spinner size="sm" className="h-3.5 w-3.5" />
        {t("common:status.processing")}
      </Badge>
    )
  }

  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Failed) {
    return (
      <Badge variant="danger" size="sm" className="shrink-0 border-transparent">
        {t("common:status.failed")}
      </Badge>
    )
  }

  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled) {
    return (
      <Badge
        variant="warning"
        size="sm"
        className="shrink-0 border-transparent"
      >
        {t("common:status.cancelled")}
      </Badge>
    )
  }

  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Completed) {
    return (
      <Badge
        variant={progress.summary.failed > 0 ? "warning" : "success"}
        size="sm"
        className="shrink-0 border-transparent"
      >
        {progress.summary.failed > 0
          ? t("common:status.error")
          : t("common:status.success")}
      </Badge>
    )
  }

  return null
}
