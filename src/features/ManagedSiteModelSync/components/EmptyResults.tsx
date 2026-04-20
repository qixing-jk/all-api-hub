import { ArrowPathIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { EmptyState } from "~/components/ui"

interface EmptyResultsProps {
  hasHistory: boolean
}

/**
 * Displays empty states for execution history.
 * @param props Component props indicating whether history is present.
 * @returns Appropriate empty state for "no data" or "no results".
 */
export default function EmptyResults(props: EmptyResultsProps) {
  const { hasHistory } = props
  const { t } = useTranslation("managedSiteModelSync")

  if (!hasHistory) {
    return (
      <EmptyState
        title={t("execution.empty.noData")}
        description={t("execution.empty.noDataDesc")}
        icon={<ArrowPathIcon className="h-12 w-12" />}
      />
    )
  }

  return (
    <EmptyState
      title={t("execution.empty.noResults")}
      description={t("execution.empty.noResultsDesc")}
      icon={<MagnifyingGlassIcon className="h-12 w-12" />}
    />
  )
}
