import type { TFunction } from "i18next"

import { Button, Card, CardContent } from "~/components/ui"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"

import {
  getRepairProgressBarColor,
  getRepairProgressTotals,
} from "./repairMissingKeysDialogHelpers"

interface RepairMissingKeysProgressCardProps {
  progress: AccountKeyRepairProgress
  isStarting: boolean
  onStartAudit: () => void
  t: TFunction
}

/**
 * Shows repair job progress, totals, outcome counts, and rerun action.
 */
export function RepairMissingKeysProgressCard({
  progress,
  isStarting,
  onStartAudit,
  t,
}: RepairMissingKeysProgressCardProps) {
  const { eligibleTotal, processedTotal, progressMax, progressPercent } =
    getRepairProgressTotals(progress)
  const progressBarColor = getRepairProgressBarColor(progress)

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
              {progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Running ? (
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
              ) : null}
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
      </CardContent>
    </Card>
  )
}
