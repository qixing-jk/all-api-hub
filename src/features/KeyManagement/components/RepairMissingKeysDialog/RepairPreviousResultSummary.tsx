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
    <div className="dark:bg-background/30 border-border bg-surface-subtle/60 rounded-lg border border-dashed p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="bg-muted text-muted-foreground dark:bg-card/60 shrink-0 rounded-lg p-2">
            <History className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-secondary-foreground text-sm font-medium">
              {t("keyManagement:repairMissingKeys.previousResult.title")}
            </p>
            <p className="text-muted-foreground text-xs leading-5">
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
