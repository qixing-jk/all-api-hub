import { useTranslation } from "react-i18next"

import { Card } from "~/components/ui"

interface EmptyResultsProps {
  hasHistory: boolean
}

/**
 * Shown when no auto-checkin runs or history exist yet.
 * @param props hasHistory toggles messaging between past runs and first-time state.
 */
export default function EmptyResults({ hasHistory }: EmptyResultsProps) {
  const { t } = useTranslation("autoCheckin")

  return (
    <Card className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {hasHistory
            ? t("execution.empty.noResults")
            : t("execution.empty.noHistory")}
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {hasHistory
            ? t("execution.empty.noResultsDesc")
            : t("execution.empty.noHistoryDesc")}
        </p>
      </div>
    </Card>
  )
}
