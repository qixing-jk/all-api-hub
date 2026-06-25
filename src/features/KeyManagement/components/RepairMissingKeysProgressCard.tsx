import type { TFunction } from "i18next"
import type { ReactNode } from "react"

import { Button, Card, CardContent } from "~/components/ui"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"

import {
  getRepairProgressBarColor,
  getRepairProgressTotals,
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

/**
 * Shows repair job progress, totals, outcome counts, and rerun action.
 */
export function RepairMissingKeysProgressCard({
  progress,
  isCancelling,
  isStarting,
  onCancelAudit,
  onStartAudit,
  actions,
  t,
}: RepairMissingKeysProgressCardProps) {
  const { eligibleTotal, processedTotal, progressMax, progressPercent } =
    getRepairProgressTotals(progress)
  const progressBarColor = getRepairProgressBarColor(progress)
  const renamedKeys = progress.summary.renamedKeys ?? 0
  const renameFailed = progress.summary.renameFailed ?? 0
  const shouldShowRenameSummary = renamedKeys > 0 || renameFailed > 0

  return (
    <Card>
      <CardContent padding="md" spacing="none" className="space-y-4">
        <div className="space-y-2">
          <div
            data-testid="repair-missing-keys-progress-header"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <div className="min-w-0 text-xs text-gray-600 dark:text-gray-400">
              <span>{t("keyManagement:repairMissingKeys.progressLabel")}</span>
            </div>
            <div
              data-testid="repair-missing-keys-progress-actions"
              className="flex flex-wrap items-center justify-end gap-3 text-xs text-gray-600 dark:text-gray-400"
            >
              <span>
                {processedTotal}/{eligibleTotal} ({progressPercent}%)
              </span>
              {actions !== undefined ? (
                actions
              ) : progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Running ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCancelAudit}
                  disabled={isCancelling}
                  loading={isCancelling}
                >
                  {t("keyManagement:repairMissingKeys.actions.cancel")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onStartAudit}
                  disabled={isStarting}
                  loading={isStarting}
                >
                  {t("keyManagement:repairMissingKeys.actions.rerun")}
                </Button>
              )}
            </div>
          </div>
          <div
            className="dark:bg-dark-bg-tertiary h-2 w-full rounded-full bg-gray-100"
            role="progressbar"
            aria-label={t("keyManagement:repairMissingKeys.progressLabel")}
            aria-valuemin={0}
            aria-valuemax={progressMax}
            aria-valuenow={Math.min(processedTotal, progressMax)}
            aria-valuetext={`${processedTotal}/${eligibleTotal} (${progressPercent}%)`}
          >
            <div
              className={`h-2 rounded-full transition-all ${progressBarColor}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {shouldShowRenameSummary ? (
          <div className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
            {t("keyManagement:repairMissingKeys.renameSummary.resultNotice", {
              failed: renameFailed,
              renamed: renamedKeys,
            })}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t(
                "keyManagement:repairMissingKeys.totalsLabels.enabledAccounts",
              )}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {progress.totals.enabledAccounts}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t(
                "keyManagement:repairMissingKeys.totalsLabels.eligibleAccounts",
              )}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {progress.totals.eligibleAccounts}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t(
                "keyManagement:repairMissingKeys.totalsLabels.processedAccounts",
              )}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {processedTotal}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("keyManagement:repairMissingKeys.outcomes.created")}
            </p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {progress.summary.created}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("keyManagement:repairMissingKeys.outcomes.alreadyHad")}
            </p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {progress.summary.alreadyHad}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("keyManagement:repairMissingKeys.outcomes.skipped")}
            </p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {progress.summary.skipped}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("keyManagement:repairMissingKeys.outcomes.failed")}
            </p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {progress.summary.failed}
            </p>
          </div>
        </div>

        {shouldShowRenameSummary ? (
          <div className="dark:border-dark-bg-tertiary grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("keyManagement:repairMissingKeys.renameSummary.renamed")}
              </p>
              <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">
                {renamedKeys}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("keyManagement:repairMissingKeys.renameSummary.failed")}
              </p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {renameFailed}
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
