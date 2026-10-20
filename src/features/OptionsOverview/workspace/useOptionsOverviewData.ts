import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { isManagedSiteType } from "~/constants/siteType"
import type { OptionsOverviewViewModel } from "~/features/OptionsOverview/types"
import { buildOptionsOverviewViewModel } from "~/features/OptionsOverview/workspace/overviewSelectors"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountStatistics } from "~/services/accounts/accountStorage/accountStatistics"
import { createEmptyAccountTodayStatsCoverage } from "~/services/accounts/metrics/accountTodayStats"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/storage/profiles"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { featureGuidanceState } from "~/services/featureGuidance/featureGuidanceState"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { supportsManagedSiteModelSync } from "~/services/managedSites/utils/managedSite"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  ModelSyncMessageTypes,
  WebdavAutoSyncMessageTypes,
} from "~/services/runtimeMessaging/messageTypes"
import { siteAnnouncementStorage } from "~/services/siteAnnouncements/storage"
import { siteTypeObservations } from "~/services/siteDetection/siteTypeObservations"
import { sendWebdavAutoSyncMessage } from "~/services/webdav/autoSync/webdavAutoSyncMessaging"
import type { AccountStats } from "~/types"
import {
  USAGE_HISTORY_STORE_SCHEMA_VERSION,
  type UsageHistoryStore,
} from "~/types/usageHistory"
import { createLogger } from "~/utils/core/logger"

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
  "featureGuidance",
  "autoCheckinStatus",
  "siteAnnouncementRecords",
  "siteAnnouncementStatuses",
] as const

/** Returns a fulfilled local-store value or its presentation fallback. */
function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback
}

/** Keeps an unavailable background status from blocking the overview. */
async function readStatusWithTimeout<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 3000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
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
  const [hasLoadFailure, setHasLoadFailure] = useState(false)
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
          accountQueries.getAllAccounts(),
          accountStatistics.getAccountStats(),
          usageHistoryStorage.getStore(),
          apiCredentialProfilesStorage.listProfiles(),
          userPreferences.getPreferences(),
          featureGuidanceState.getState(),
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
          featureGuidanceResult,
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
        if (firstFailure) {
          logger.error("Some options overview data failed to load", {
            failures,
          })
        }

        if (!results.some((result) => result.status === "fulfilled")) {
          setHasLoadFailure(Boolean(firstFailure))
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
        const guidanceState = settledValue(featureGuidanceResult, null)
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
          featureGuidanceResult,
        ].every((result) => result.status === "fulfilled")

        const configuredManagedSiteType = preferences?.managedSiteType
        const managedSiteType = isManagedSiteType(configuredManagedSiteType)
          ? configuredManagedSiteType
          : undefined

        // Read existing results only. A failed status read remains unknown in its row.
        const [modelSyncResult, webdavResult] = await Promise.allSettled([
          managedSiteType &&
          supportsManagedSiteModelSync(managedSiteType) &&
          preferences?.managedSiteModelSync?.enabled
            ? readStatusWithTimeout(
                sendModelSyncMessage(ModelSyncMessageTypes.GetLastExecution),
              )
            : Promise.resolve(undefined),
          preferences?.webdav?.autoSync
            ? readStatusWithTimeout(
                sendWebdavAutoSyncMessage(WebdavAutoSyncMessageTypes.GetStatus),
              )
            : Promise.resolve(undefined),
        ])
        if (!isCurrent) return
        const modelSyncResponse = settledValue(modelSyncResult, undefined)
        const webdavResponse = settledValue(webdavResult, undefined)
        const displayData = accountPresentation.convertToDisplayData(accounts)
        // Best-effort advice: a failed read reports none and never counts as a
        // failed source, so it cannot hide a broken environment. The store drops
        // what a later site-type edit retired.
        const siteTypeMismatches =
          await siteTypeObservations.readForAccounts(displayData)
        if (!isCurrent) return

        setViewModel(
          buildOptionsOverviewViewModel({
            accounts,
            displayData,
            accountStats,
            apiCredentialProfiles,
            usageStore,
            preferences,
            guidanceState,
            managedSiteType,
            autoCheckinStatus,
            modelSyncExecution: modelSyncResponse?.success
              ? modelSyncResponse.data
              : undefined,
            webdavStatus: webdavResponse?.success
              ? webdavResponse.data
              : undefined,
            autoCheckinDataAvailable:
              autoCheckinStatusResult.status === "fulfilled",
            announcementDataAvailable:
              siteAnnouncementStatusesResult.status === "fulfilled",
            siteTypeMismatches,
            siteAnnouncementRecords,
            siteAnnouncementStatuses,
            unifiedApiGuidanceDataAvailable,
            accountsDataAvailable: accountsResult.status === "fulfilled",
            profilesDataAvailable:
              apiCredentialProfilesResult.status === "fulfilled",
          }),
        )
        setHasLoadFailure(Boolean(firstFailure))
      } catch {
        if (!isCurrent) return
        logger.error("Failed to load options overview data", {
          status: "rejected",
        })
        setHasLoadFailure(true)
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
    error: hasLoadFailure
      ? t("optionsOverview:states.loadDetailUnavailable")
      : null,
    viewModel,
    reload,
  }
}
