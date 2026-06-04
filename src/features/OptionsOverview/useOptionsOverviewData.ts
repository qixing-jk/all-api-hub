import { useCallback, useEffect, useState } from "react"

import { isManagedSiteType } from "~/constants/siteType"
import { accountStorage } from "~/services/accounts/accountStorage"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { siteAnnouncementStorage } from "~/services/siteAnnouncements/storage"
import type {
  SiteAnnouncementRecord,
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { buildOptionsOverviewViewModel } from "./overviewSelectors"
import type { OptionsOverviewViewModel } from "./types"

const logger = createLogger("OptionsOverviewData")

interface OptionsOverviewDataState {
  isLoading: boolean
  error: string | null
  viewModel: OptionsOverviewViewModel | null
  reload: () => void
}

/**
 * Loads local-only data needed for the Options overview workbench.
 */
export function useOptionsOverviewData(): OptionsOverviewDataState {
  const [viewModel, setViewModel] = useState<OptionsOverviewViewModel | null>(
    null,
  )
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)

  const reload = useCallback(() => {
    setReloadVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    let isCurrent = true

    const load = async () => {
      setIsLoading(true)
      try {
        const [
          accounts,
          accountStats,
          usageStore,
          apiCredentialProfiles,
          prefs,
          autoCheckinStatus,
          siteAnnouncementRecords,
          siteAnnouncementStatuses,
        ] = await Promise.all([
          accountStorage.getAllAccounts(),
          accountStorage.getAccountStats(),
          usageHistoryStorage.getStore(),
          apiCredentialProfilesStorage.listProfiles(),
          userPreferences.getPreferences(),
          autoCheckinStorage.getStatus(),
          siteAnnouncementStorage.listRecords(),
          siteAnnouncementStorage.getStatus(),
        ])

        if (!isCurrent) return

        const preferences = prefs as UserPreferences
        const managedSiteType = isManagedSiteType(preferences.managedSiteType)
          ? preferences.managedSiteType
          : undefined
        const displayData = accountStorage.convertToDisplayData(accounts)
        setViewModel(
          buildOptionsOverviewViewModel({
            accounts,
            displayData,
            accountStats,
            apiCredentialProfiles,
            usageStore,
            preferences,
            managedSiteType,
            autoCheckinStatus,
            siteAnnouncementRecords:
              siteAnnouncementRecords as SiteAnnouncementRecord[],
            siteAnnouncementStatuses:
              siteAnnouncementStatuses as SiteAnnouncementSiteState[],
          }),
        )
        setError(null)
      } catch (loadError) {
        if (!isCurrent) return
        const message = getErrorMessage(loadError)
        logger.error("Failed to load options overview data", loadError)
        setError(message)
      } finally {
        if (isCurrent) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      isCurrent = false
    }
  }, [reloadVersion])

  return {
    isLoading,
    error,
    viewModel,
    reload,
  }
}
