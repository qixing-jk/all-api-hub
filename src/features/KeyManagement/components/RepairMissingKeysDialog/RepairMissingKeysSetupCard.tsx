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
          <div className="shrink-0 rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="pt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">
            {t("keyManagement:repairMissingKeys.initialNotice")}
          </p>
        </div>
        <Alert
          variant="info"
          compact
          description={t("keyManagement:repairMissingKeys.remoteWriteNotice")}
        />
        {renameOption}
        {previousResultSummary}
      </CardContent>
      <CardFooter
        padding="sm"
        className="dark:bg-dark-bg-primary/40 justify-start bg-gray-50/80"
      >
        <Button
          type="button"
          onClick={onStartRepair}
          disabled={isStarting}
          loading={isStarting}
          className="w-full sm:w-auto"
        >
          {t("keyManagement:repairMissingKeys.actions.start")}
        </Button>
      </CardFooter>
    </Card>
  )
}
