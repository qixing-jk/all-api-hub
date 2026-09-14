import type { TFunction } from "i18next"
import type { ReactNode } from "react"

import { Button, Card, CardContent, Progress } from "~/components/ui"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"

import {
  getRepairProgressBarColor,
  getRepairProgressTotals,
  hasRepairAttentionOutcomes,
} from "./repairMissingKeysDialogHelpers"

interface RepairMissingKeysProgressCardProps {
  progress: AccountKeyRepairProgress
  isCancelling: boolean
  isStarting: boolean
  onCancelAudit: () => void
  onStartAudit: () => void
  actions?: ReactNode
  t: TFunction
}

/** Returns one plain-language conclusion without duplicating the result filters. */
function getRepairCompletionMessage(
  progress: AccountKeyRepairProgress,
  t: TFunction,
) {
  const needsAttention = hasRepairAttentionOutcomes(progress.summary)

  if (needsAttention) {
    return t("keyManagement:repairMissingKeys.summary.completedNeedsAttention")
  }

  if (progress.summary.skipped > 0) {
    return t("keyManagement:repairMissingKeys.summary.completedWithSkipped")
  }

  return t("keyManagement:repairMissingKeys.summary.healthy")
}

/** Shows active progress or one compact conclusion after completion. */
export function RepairMissingKeysProgressCard({
  progress,
  isCancelling,
  isStarting,
  onCancelAudit,
  onStartAudit,
  actions,
  t,
}: RepairMissingKeysProgressCardProps) {
  const action =
    actions !== undefined ? (
      actions
    ) : progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Running ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCancelAudit}
        loading={isCancelling}
      >
        {isCancelling
          ? t("common:status.cancelling")
          : t("keyManagement:repairMissingKeys.actions.cancel")}
      </Button>
    ) : (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onStartAudit}
        loading={isStarting}
      >
        {isStarting
          ? t("common:status.starting")
          : t("keyManagement:repairMissingKeys.actions.rerun")}
      </Button>
    )

  if (progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Completed) {
    return (
      <Card variant="outlined">
        <CardContent
          padding="sm"
          spacing="none"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="dark:text-secondary-foreground text-muted-foreground min-w-0 flex-1 basis-64 text-sm">
            {getRepairCompletionMessage(progress, t)}
          </p>
          {action ? <div className="ml-auto shrink-0">{action}</div> : null}
        </CardContent>
      </Card>
    )
  }

  const { eligibleTotal, processedTotal, progressMax, progressPercent } =
    getRepairProgressTotals(progress)
  const progressBarColor = getRepairProgressBarColor(progress)

  return (
    <Card variant="outlined">
      <CardContent padding="sm" spacing="none" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-secondary-foreground text-sm font-medium">
              {t("keyManagement:repairMissingKeys.progressChecked")}
            </span>
            <span className="text-muted-foreground text-sm tabular-nums">
              {processedTotal} / {eligibleTotal}
            </span>
          </div>
          {action ? <div className="ml-auto shrink-0">{action}</div> : null}
        </div>
        <Progress
          className="dark:bg-secondary bg-muted h-1.5"
          indicatorClassName={progressBarColor}
          value={processedTotal}
          max={progressMax}
          aria-label={t("keyManagement:repairMissingKeys.progressLabel")}
          aria-valuetext={`${processedTotal}/${eligibleTotal} (${progressPercent}%)`}
        />
      </CardContent>
    </Card>
  )
}
