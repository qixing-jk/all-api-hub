import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { isManagedSiteType } from "~/constants/siteType"
import { accountStorage } from "~/services/accounts/accountStorage"
import { createEmptyAccountTodayStatsCoverage } from "~/services/accounts/accountTodayStats"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { userPreferences } from "~/services/preferences/userPreferences"
import { siteAnnouncementStorage } from "~/services/siteAnnouncements/storage"
import type { AccountStats } from "~/types"
import type {
  SiteAnnouncementRecord,
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import {
  USAGE_HISTORY_STORE_SCHEMA_VERSION,
  type UsageHistoryStore,
} from "~/types/usageHistory"
import { createLogger } from "~/utils/core/logger"

import { buildOptionsOverviewViewModel } from "./overviewSelectors"
import type { OptionsOverviewViewModel } from "./types"

const logger = createLogger("OptionsOverviewData")

const EMPTY_ACCOUNT_STATS: AccountStats = {
  total_quota: 0,
  today_total_consumption: 0,
  today_total_requests: 0,
  today_total_prompt_tokens: 0,
  today_total_completion_tokens: 0,
  today_total_income: 0,
  todayStatsCoverage: createEmptyAccountTodayStatsCoverage(),
}

const EMPTY_USAGE_STORE: UsageHistoryStore = {
  schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
  accounts: {},
}

const OPTIONS_OVERVIEW_DATA_SOURCES = [
  "accounts",
  "accountStats",
  "usageHistory",
  "apiCredentialProfiles",
  "preferences",
  "autoCheckinStatus",
  "siteAnnouncementRecords",
  "siteAnnouncementStatuses",
] as const

/** Returns a fulfilled local-store value or its presentation fallback. */
function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback
}

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
  const { t } = useTranslation(["optionsOverview"])
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
        const results = await Promise.allSettled([
          accountStorage.getAllAccounts(),
          accountStorage.getAccountStats(),
          usageHistoryStorage.getStore(),
          apiCredentialProfilesStorage.listProfiles(),
          userPreferences.getPreferences(),
          autoCheckinStorage.getStatus(),
          siteAnnouncementStorage.listRecords(),
          siteAnnouncementStorage.getStatus(),
        ])

        const [
          accountsResult,
          accountStatsResult,
          usageStoreResult,
          apiCredentialProfilesResult,
          preferencesResult,
          autoCheckinStatusResult,
          siteAnnouncementRecordsResult,
          siteAnnouncementStatusesResult,
        ] = results

        if (!isCurrent) return

        const failures = results.flatMap((result, index) =>
          result.status === "rejected"
            ? [
                {
                  source: OPTIONS_OVERVIEW_DATA_SOURCES[index],
                  status: "rejected" as const,
                },
              ]
            : [],
        )
        const firstFailure = failures[0]
        const loadErrorMessage = firstFailure
          ? t("optionsOverview:states.loadDetailUnavailable")
          : null
        if (firstFailure) {
          logger.error("Some options overview data failed to load", {
            failures,
          })
        }

        if (!results.some((result) => result.status === "fulfilled")) {
          setError(loadErrorMessage)
          return
        }

        const accounts = settledValue(accountsResult, [])
        const accountStats = settledValue(
          accountStatsResult,
          EMPTY_ACCOUNT_STATS,
        )
        const usageStore = settledValue(usageStoreResult, EMPTY_USAGE_STORE)
        const apiCredentialProfiles = settledValue(
          apiCredentialProfilesResult,
          [],
        )
        const preferences = settledValue(preferencesResult, null)
        const autoCheckinStatus = settledValue(autoCheckinStatusResult, null)
        const siteAnnouncementRecords = settledValue(
          siteAnnouncementRecordsResult,
          [],
        )
        const siteAnnouncementStatuses = settledValue(
          siteAnnouncementStatusesResult,
          [],
        )
        const unifiedApiGuidanceDataAvailable = [
          accountsResult,
          apiCredentialProfilesResult,
          preferencesResult,
        ].every((result) => result.status === "fulfilled")

        const configuredManagedSiteType = preferences?.managedSiteType
        const managedSiteType = isManagedSiteType(configuredManagedSiteType)
          ? configuredManagedSiteType
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
            unifiedApiGuidanceDataAvailable,
            accountsDataAvailable: accountsResult.status === "fulfilled",
            profilesDataAvailable:
              apiCredentialProfilesResult.status === "fulfilled",
          }),
        )
        setError(loadErrorMessage)
      } catch {
        if (!isCurrent) return
        logger.error("Failed to load options overview data", {
          status: "rejected",
        })
        setError(t("optionsOverview:states.loadDetailUnavailable"))
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
  }, [reloadVersion, t])

  return {
    isLoading,
    error,
    viewModel,
    reload,
  }
}
