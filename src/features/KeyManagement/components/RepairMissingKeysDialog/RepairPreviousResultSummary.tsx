import type { TFunction } from "i18next"
import { History } from "lucide-react"

import { Button } from "~/components/ui"

interface RepairPreviousResultSummaryProps {
  onViewResult: () => void
  t: TFunction
}

/**
 * Summarizes a saved terminal repair result before the user expands it.
 */
export function RepairPreviousResultSummary({
  onViewResult,
  t,
}: RepairPreviousResultSummaryProps) {
  return (
    <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary/30 rounded-lg border border-dashed border-gray-200 bg-gray-50/60 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 rounded-lg bg-gray-100 p-2 text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            <History className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {t("keyManagement:repairMissingKeys.previousResult.title")}
            </p>
            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
              {t("keyManagement:repairMissingKeys.previousResult.description")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onViewResult}
          className="w-full sm:w-auto"
        >
          {t("keyManagement:repairMissingKeys.previousResult.view")}
        </Button>
      </div>
    </div>
  )
}
