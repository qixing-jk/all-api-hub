import type { TFunction } from "i18next"

import { Badge, Spinner } from "~/components/ui"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"

import { hasRepairAttentionOutcomes } from "./repairMissingKeysDialogHelpers"

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
      <Badge
        role="status"
        variant="info"
        size="sm"
        className="shrink-0 border-transparent"
      >
        <Spinner aria-hidden="true" size="sm" className="h-3.5 w-3.5" />
        {t("common:status.processing")}
      </Badge>
    )
  }

  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Failed) {
    return (
      <Badge
        role="status"
        variant="danger"
        size="sm"
        className="shrink-0 border-transparent"
      >
        {t("common:status.failed")}
      </Badge>
    )
  }

  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled) {
    return (
      <Badge
        role="status"
        variant="warning"
        size="sm"
        className="shrink-0 border-transparent"
      >
        {t("common:status.cancelled")}
      </Badge>
    )
  }

  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Completed) {
    const needsAttention = hasRepairAttentionOutcomes(progress.summary)
    const variant = needsAttention
      ? "warning"
      : progress.summary.skipped > 0
        ? "secondary"
        : "success"

    return (
      <Badge
        role="status"
        variant={variant}
        size="sm"
        className="shrink-0 border-transparent"
      >
        {needsAttention
          ? t("keyManagement:repairMissingKeys.status.needsAttention")
          : t("keyManagement:repairMissingKeys.status.completed")}
      </Badge>
    )
  }

  return null
}
