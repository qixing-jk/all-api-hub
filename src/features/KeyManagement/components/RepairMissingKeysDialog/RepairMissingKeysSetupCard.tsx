import type { TFunction } from "i18next"
import { ShieldCheck } from "lucide-react"
import type { ReactNode } from "react"

import { Alert, Button, Card, CardContent, CardFooter } from "~/components/ui"

interface RepairMissingKeysSetupCardProps {
  isStarting: boolean
  previousResultSummary?: ReactNode
  renameOption: ReactNode
  onStartRepair: () => void
  t: TFunction
}

/**
 * Shows the pre-run setup state before starting a repair job.
 */
export function RepairMissingKeysSetupCard({
  isStarting,
  previousResultSummary,
  renameOption,
  onStartRepair,
  t,
}: RepairMissingKeysSetupCardProps) {
  return (
    <Card variant="outlined" className="overflow-hidden">
      <CardContent padding="default" className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="bg-theme-50 text-theme-600 dark:bg-theme-900/30 dark:text-theme-300 shrink-0 rounded-lg p-2">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="text-secondary-foreground pt-1 text-sm leading-6">
            {t("keyManagement:repairMissingKeys.initialNotice")}
          </p>
        </div>
        <Alert
          variant="warning"
          compact
          description={t("keyManagement:repairMissingKeys.remoteWriteNotice")}
        />
        {renameOption}
        {previousResultSummary}
      </CardContent>
      <CardFooter
        padding="sm"
        className="dark:bg-background/40 bg-surface-subtle/80 justify-start"
      >
        <Button
          type="button"
          onClick={onStartRepair}
          loading={isStarting}
          className="w-full sm:w-auto"
        >
          {isStarting
            ? t("common:status.starting")
            : t("keyManagement:repairMissingKeys.actions.start")}
        </Button>
      </CardFooter>
    </Card>
  )
}
