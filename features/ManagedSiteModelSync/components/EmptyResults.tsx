import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { EmptyState } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { hasValidManagedSiteConfig } from "~/services/managedSites/managedSiteService"
import { userPreferences } from "~/services/preferences/userPreferences"
import { navigateWithinOptionsPage } from "~/utils/navigation"

interface EmptyResultsProps {
  hasHistory: boolean
}

/**
 * Displays empty states for execution history with config awareness.
 * @param props Component props containing history awareness.
 * @returns Appropriate empty state prompting config or search actions.
 */
export default function EmptyResults(props: EmptyResultsProps) {
  const { hasHistory } = props
  const { t } = useTranslation("managedSiteModelSync")
  const [hasValidConfig, setHasValidConfig] = useState(true)

  useEffect(() => {
    const checkConfig = async () => {
      const prefs = await userPreferences.getPreferences()
      setHasValidConfig(hasValidManagedSiteConfig(prefs))
    }
    void checkConfig()
  }, [])

  if (!hasHistory) {
    // Show config warning if config is invalid
    if (!hasValidConfig) {
      return (
        <EmptyState
          title={t("execution.empty.configWarningDesc")}
          icon={
            <ExclamationTriangleIcon className="h-12 w-12 text-yellow-500" />
          }
          action={{
            onClick: () => {
              navigateWithinOptionsPage(`#${MENU_ITEM_IDS.BASIC}`)
            },
            label: t("execution.empty.goToSettings"),
          }}
        />
      )
    }

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
