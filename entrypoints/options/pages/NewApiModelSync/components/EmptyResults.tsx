import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon
} from "@heroicons/react/24/outline"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { EmptyState } from "~/components/ui"
import { hasValidNewApiConfig } from "~/services/newApiService"
import { userPreferences } from "~/services/userPreferences"

interface EmptyResultsProps {
  hasHistory: boolean
}

export default function EmptyResults({ hasHistory }: EmptyResultsProps) {
  const { t } = useTranslation("newApiModelSync")
  const [hasValidConfig, setHasValidConfig] = useState(true)

  useEffect(() => {
    const checkConfig = async () => {
      const prefs = await userPreferences.getPreferences()
      setHasValidConfig(hasValidNewApiConfig(prefs))
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
              window.location.hash = "#basic"
            },
            label: t("execution.empty.goToSettings")
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
