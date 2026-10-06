import { CheckCheck, Megaphone, RefreshCcw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import { Button, Notice } from "~/components/ui"
import { EmptyState } from "~/components/ui/EmptyState"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useRegisterDevPanelSection } from "~/features/DevPanel"
import notify from "~/lib/notify"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsSurfaceId,
} from "~/services/productAnalytics/contracts"
import { SiteAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import {
  getRuntimeMessageFailureMessage,
  getRuntimeMessageToastMessage,
} from "~/services/runtimeMessaging/result"
import { sendSiteAnnouncementsMessage } from "~/services/siteAnnouncements/messaging"
import type {
  SiteAnnouncementCheckResult,
  SiteAnnouncementRecord,
  SiteAnnouncementRecordView,
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import { SITE_ANNOUNCEMENT_STATUS } from "~/types/siteAnnouncements"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/feedback/operationFeedback"
import { openSettingsTab, pushWithinOptionsPage } from "~/utils/navigation"

import { SiteAnnouncementsList } from "./components/SiteAnnouncementsList"
import { SiteAnnouncementsOverviewCard } from "./components/SiteAnnouncementsOverviewCard"
import { SiteAnnouncementsSearchBar } from "./components/SiteAnnouncementsSearchBar"
import { SiteAnnouncementsStatusAlert } from "./components/SiteAnnouncementsStatusAlert"
import type { UnreadFilter } from "./types"
import { useSiteAnnouncementsDevSection } from "./useSiteAnnouncementsDevSection"
import {
  buildSiteOptions,
  filterSiteAnnouncements,
  matchesUnreadFilter,
  matchSiteAnnouncementQuery,
} from "./utils"

interface SiteAnnouncementsPageProps {
  routeParams?: Record<string, string>
  refreshKey?: number
}

const textLinkClassName =
  "font-medium text-theme-600 underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-theme-400"

const logger = createLogger("SiteAnnouncementsPage")

/**
 * Counts enabled accounts for announcement empty-state routing.
 */
async function resolveEnabledAccountCount(): Promise<number | null> {
  try {
    const accounts = await accountQueries.getAllAccounts()
    return accounts.filter((account) => account.disabled !== true).length
  } catch (error) {
    logger.warn(
      "Failed to load accounts for site announcements empty state",
      error,
    )
    return null
  }
}

/**
 * Options page for locally cached provider-site announcements.
 */
export default function SiteAnnouncementsPage({
  routeParams,
  refreshKey,
}: SiteAnnouncementsPageProps) {
  const { t, i18n } = useTranslation(["siteAnnouncements", "common"])
  const { siteAnnouncementNotifications } = useUserPreferencesContext()
  const [records, setRecords] = useState<SiteAnnouncementRecordView[]>([])
  const [status, setStatus] = useState<SiteAnnouncementSiteState[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const [siteKey, setSiteKey] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [unreadFilter, setUnreadFilter] = useState<UnreadFilter>("all")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(routeParams?.recordId ? [routeParams.recordId] : []),
  )
  const [hasLoadError, setHasLoadError] = useState(false)
  const loadError = hasLoadError
    ? t("siteAnnouncements:messages.loadFailed")
    : null
  const [enabledAccountCount, setEnabledAccountCount] = useState<number | null>(
    null,
  )

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setHasLoadError(false)
    try {
      const [recordsResponse, statusResponse, nextEnabledAccountCount] =
        await Promise.all([
          sendSiteAnnouncementsMessage(
            SiteAnnouncementsMessageTypes.ListRecords,
          ),
          sendSiteAnnouncementsMessage(SiteAnnouncementsMessageTypes.GetStatus),
          resolveEnabledAccountCount(),
        ])
      setEnabledAccountCount(nextEnabledAccountCount)

      if (!recordsResponse.success) {
        showResultToast({
          success: false,
          message: getRuntimeMessageFailureMessage(
            recordsResponse,
            i18n.t("siteAnnouncements:messages.loadFailed"),
          ),
          errorFallback: i18n.t("siteAnnouncements:messages.loadFailed"),
        })
        setHasLoadError(true)
        return
      }

      if (!statusResponse.success) {
        showResultToast({
          success: false,
          message: getRuntimeMessageFailureMessage(
            statusResponse,
            i18n.t("siteAnnouncements:messages.loadFailed"),
          ),
          errorFallback: i18n.t("siteAnnouncements:messages.loadFailed"),
        })
        setHasLoadError(true)
        return
      }

      setRecords(recordsResponse.data)
      setStatus(statusResponse.data)
    } catch (error) {
      setHasLoadError(true)
      showResultToast({
        success: false,
        message: getErrorMessage(error),
        errorFallback: i18n.t("siteAnnouncements:messages.loadFailed"),
      })
    } finally {
      setIsLoading(false)
    }
  }, [i18n])

  useEffect(() => {
    void loadData()
  }, [loadData, refreshKey])

  // Dev-only fixture controls: a full cache and sites needing attention are
  // otherwise only reachable by polling real sites.
  useRegisterDevPanelSection(
    useSiteAnnouncementsDevSection({ records, status, refreshData: loadData }),
  )

  useEffect(() => {
    if (routeParams?.recordId) {
      setExpandedIds((prev) => new Set(prev).add(routeParams.recordId!))
    }
  }, [routeParams?.recordId])

  const siteOptions = useMemo(
    () => buildSiteOptions(records, status),
    [records, status],
  )

  const selectedSourceKeys = useMemo(
    () =>
      siteOptions.find((option) => option.value === siteKey)?.sourceKeys ?? [
        siteKey,
      ],
    [siteOptions, siteKey],
  )

  // The overview counters describe the selected site, so they are computed
  // before the read-state and search filters narrow the list.
  const siteScopedRecords = useMemo(
    () =>
      filterSiteAnnouncements(records, {
        siteKey,
        siteKeys: selectedSourceKeys,
        unreadFilter: "all",
      }),
    [records, siteKey, selectedSourceKeys],
  )
  // Search narrows the visible list only. Manual checks and the overview
  // counters keep following site + read-state, so a query never silently
  // rescopes which accounts a check touches.
  const visibleRecords = useMemo(
    () =>
      siteScopedRecords.filter((record) =>
        matchesUnreadFilter(record, unreadFilter),
      ),
    [siteScopedRecords, unreadFilter],
  )
  const filteredRecords = useMemo(
    () =>
      visibleRecords.filter((record) =>
        matchSiteAnnouncementQuery(record, searchQuery),
      ),
    [visibleRecords, searchQuery],
  )

  const selectedStatus =
    status.find(
      (item) =>
        selectedSourceKeys.includes(item.siteKey) &&
        item.status === SITE_ANNOUNCEMENT_STATUS.Error,
    ) ?? status.find((item) => selectedSourceKeys.includes(item.siteKey))
  const aggregateFailedSiteCount = status.filter(
    (item) => item.status === SITE_ANNOUNCEMENT_STATUS.Error,
  ).length
  const aggregateUnsupportedSiteCount = status.filter(
    (item) => item.status === SITE_ANNOUNCEMENT_STATUS.Unsupported,
  ).length
  const hasAggregateIssues =
    aggregateFailedSiteCount + aggregateUnsupportedSiteCount > 0
  const manualCheckAccountIds = useMemo(() => {
    const accountIds = visibleRecords.map((record) => record.accountId)
    // A site may have no cached announcements yet. Its polling status still
    // identifies the selected source; never turn that selection into "all".
    if (unreadFilter === "all") {
      for (const site of status) {
        if (siteKey !== "all" && !selectedSourceKeys.includes(site.siteKey))
          continue
        accountIds.push(site.accountId)
      }
    }
    return [...new Set(accountIds)]
  }, [visibleRecords, status, siteKey, selectedSourceKeys, unreadFilter])
  const shouldScopeManualCheck =
    records.length > 0 || siteKey !== "all" || unreadFilter !== "all"
  const canRunManualCheck =
    !isLoading && (!shouldScopeManualCheck || manualCheckAccountIds.length > 0)
  const totalCount = siteScopedRecords.length
  const unreadCount = siteScopedRecords.filter((record) => !record.read).length
  const isPollingDisabled = !siteAnnouncementNotifications.enabled
  const hasCachedRecords = records.length > 0
  const showNoAccountsSetup = enabledAccountCount === 0 && !hasCachedRecords
  // The empty state splits on what hid the list: an empty cache is a different
  // problem from a site, read-state or search scope with no match.
  const hasSearchQuery = searchQuery.trim().length > 0
  const hasActiveFilters = siteKey !== "all" || unreadFilter !== "all"
  const showFilteredEmptyState =
    hasCachedRecords &&
    filteredRecords.length === 0 &&
    (hasSearchQuery || hasActiveFilters)

  const handleCheckNow = async (surfaceId: ProductAnalyticsSurfaceId) => {
    if (!canRunManualCheck || isChecking) return
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CheckSiteAnnouncementsNow,
      surfaceId,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    setIsChecking(true)
    try {
      const response = await sendSiteAnnouncementsMessage(
        SiteAnnouncementsMessageTypes.CheckNow,
        shouldScopeManualCheck
          ? { accountIds: manualCheckAccountIds }
          : undefined,
      )
      const success = response?.success === true
      const checkResult: SiteAnnouncementCheckResult | null | undefined =
        response.success ? response.data : undefined
      const checkInsights =
        checkResult && typeof checkResult.checked === "number"
          ? {
              itemCount: checkResult.checked,
              successCount: Math.max(
                checkResult.checked -
                  (typeof checkResult.failed === "number"
                    ? checkResult.failed
                    : 0) -
                  (typeof checkResult.unsupported === "number"
                    ? checkResult.unsupported
                    : 0),
                0,
              ),
              failureCount:
                typeof checkResult.failed === "number" ? checkResult.failed : 0,
            }
          : undefined
      const failedCount = checkResult?.failed ?? 0
      const unsupportedCount = checkResult?.unsupported ?? 0
      const hasPartialIssues = success && failedCount + unsupportedCount > 0
      if (success) {
        if (checkInsights) {
          tracker.complete(
            hasPartialIssues
              ? PRODUCT_ANALYTICS_RESULTS.Failure
              : PRODUCT_ANALYTICS_RESULTS.Success,
            {
              ...(hasPartialIssues
                ? {
                    errorCategory:
                      failedCount > 0
                        ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
                        : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
                  }
                : {}),
              insights: checkInsights,
            },
          )
        } else {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        }
      } else {
        tracker.complete(
          PRODUCT_ANALYTICS_RESULTS.Failure,
          checkInsights
            ? {
                errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
                insights: checkInsights,
              }
            : { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
        )
      }
      if (hasPartialIssues) {
        notify.warning(
          t("messages.checkCompletedWithIssues", {
            failed: failedCount,
            unsupported: unsupportedCount,
          }),
        )
      } else {
        showResultToast({
          success,
          message: getRuntimeMessageToastMessage(response),
          successFallback: t("messages.checkCompleted"),
          errorFallback: t("messages.checkFailed"),
        })
      }
      await loadData()
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: getErrorMessage(error),
        errorFallback: t("messages.checkFailed"),
      })
    } finally {
      setIsChecking(false)
    }
  }

  const handleMarkRead = async (recordId: string) => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.MarkAnnouncementRead,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementCard,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    try {
      const response = await sendSiteAnnouncementsMessage(
        SiteAnnouncementsMessageTypes.MarkRead,
        {
          recordId,
        },
      )
      if (response?.success) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        await loadData()
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
        showResultToast({
          success: false,
          message: getRuntimeMessageToastMessage(response),
          errorFallback: t("messages.markReadFailed"),
        })
      }
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: getErrorMessage(error),
        errorFallback: t("messages.markReadFailed"),
      })
    }
  }

  const handleMarkAllRead = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.MarkAllAnnouncementsRead,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    try {
      const keys = siteKey === "all" ? [undefined] : selectedSourceKeys
      const results = await Promise.allSettled(
        keys.map((key) =>
          sendSiteAnnouncementsMessage(
            SiteAnnouncementsMessageTypes.MarkAllRead,
            { siteKey: key },
          ),
        ),
      )
      const failure = results.find(
        (result) => result.status === "rejected" || !result.value?.success,
      )
      if (!failure) {
        const counts = results.flatMap((result) =>
          result.status === "fulfilled" &&
          result.value?.success &&
          typeof result.value.data === "number"
            ? [result.value.data]
            : [],
        )
        if (counts.length === results.length) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
            insights: {
              itemCount: counts.reduce((total, count) => total + count, 0),
            },
          })
        } else {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        }
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
        showResultToast({
          success: false,
          message:
            failure.status === "rejected"
              ? getErrorMessage(failure.reason)
              : getRuntimeMessageToastMessage(failure.value),
          errorFallback: t("messages.markAllReadFailed"),
        })
      }
      await loadData()
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: getErrorMessage(error),
        errorFallback: t("messages.markAllReadFailed"),
      })
    }
  }

  const toggleExpanded = (record: SiteAnnouncementRecord) => {
    let isExpanding = false
    setExpandedIds((prev) => {
      const next = new Set(prev)
      isExpanding = !next.has(record.id)
      if (isExpanding) {
        next.add(record.id)
      } else {
        next.delete(record.id)
      }
      return next
    })

    if (
      isExpanding &&
      records.find((item) => item.id === record.id)?.canSyncRead &&
      !record.read
    ) {
      void handleMarkRead(record.id)
    }
  }

  const handleOpenPollingSettings = useCallback(() => {
    void openSettingsTab("siteAnnouncements", {
      anchor: SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
      preserveHistory: true,
    })
  }, [])

  const handleOpenAccountManagement = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.ACCOUNT}`)
  }, [])

  return (
    <div
      className="py-density-4 sm:py-density-6 px-4 sm:px-6"
      data-options-page-pending={isLoading ? "" : undefined}
    >
      <PageHeader
        icon={Megaphone}
        title={t("title")}
        titleActions={
          <OptionsPageSettingsTitleAction
            tabId="siteAnnouncements"
            anchor={SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED}
            label={t("actions.pollingSettings")}
          />
        }
        description={
          <>
            <span>
              {siteAnnouncementNotifications.enabled
                ? t("description.enabledSummary")
                : t("description.disabledSummary")}
            </span>{" "}
            {siteAnnouncementNotifications.enabled && (
              <>
                <span>
                  {t("description.enabledInterval", {
                    intervalMinutes:
                      siteAnnouncementNotifications.intervalMinutes,
                  })}
                </span>{" "}
              </>
            )}
            <button
              type="button"
              className={textLinkClassName}
              onClick={handleOpenPollingSettings}
            >
              {t("description.pollingSettingsLink")}
            </button>
          </>
        }
        className="mb-density-5"
        actions={
          <ProductAnalyticsScope
            entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
            featureId={PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements}
            surfaceId={
              PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsPage
            }
          >
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void handleMarkAllRead()}
              disabled={unreadCount === 0}
              leftIcon={<CheckCheck className="h-4 w-4" />}
            >
              {t("actions.markAllRead")}
            </Button>
            <Button
              size="sm"
              type="button"
              loading={isChecking}
              disabled={!canRunManualCheck}
              onClick={() =>
                void handleCheckNow(
                  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsPage,
                )
              }
              leftIcon={<RefreshCcw className="h-4 w-4" />}
            >
              {isChecking ? t("common:status.checking") : t("actions.checkNow")}
            </Button>
          </ProductAnalyticsScope>
        }
      />

      <SiteAnnouncementsOverviewCard
        siteKey={siteKey}
        unreadFilter={unreadFilter}
        siteOptions={siteOptions}
        totalCount={totalCount}
        unreadCount={unreadCount}
        onSiteKeyChange={setSiteKey}
        onUnreadFilterChange={setUnreadFilter}
      />

      <SiteAnnouncementsSearchBar
        value={searchQuery}
        resultCount={filteredRecords.length}
        onChange={setSearchQuery}
      />

      {siteKey === "all" && hasAggregateIssues ? (
        <Notice
          tone="warning"
          className="mb-density-4"
          title={t("status.aggregateIssuesTitle")}
          description={t("status.aggregateIssues", {
            failed: aggregateFailedSiteCount,
            unsupported: aggregateUnsupportedSiteCount,
          })}
        />
      ) : null}

      {selectedStatus && (
        <SiteAnnouncementsStatusAlert status={selectedStatus} />
      )}

      {isLoading ? (
        <EmptyState
          icon={<RefreshCcw className="h-10 w-10 animate-spin" />}
          title={t("loading")}
        />
      ) : loadError ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title={loadError}
          action={{
            label: t("actions.checkNow"),
            loadingLabel: t("common:status.checking"),
            onClick: () =>
              void handleCheckNow(
                PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsEmptyState,
              ),
            disabled: !canRunManualCheck,
            loading: isChecking,
            leftIcon: <RefreshCcw className="h-4 w-4" />,
          }}
        />
      ) : filteredRecords.length === 0 ? (
        <ProductAnalyticsScope
          entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
          featureId={PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements}
          surfaceId={
            PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsEmptyState
          }
        >
          <EmptyState
            icon={<Megaphone className="h-10 w-10" />}
            title={
              showNoAccountsSetup
                ? t("empty.noAccounts")
                : showFilteredEmptyState
                  ? t("empty.filtered")
                  : t("empty.title")
            }
            description={
              showNoAccountsSetup ? (
                t("empty.noAccountsDesc")
              ) : !hasCachedRecords ? (
                isPollingDisabled ? (
                  <>
                    <span>{t("empty.descriptionWhenPollingDisabled")}</span>{" "}
                    <button
                      type="button"
                      className={textLinkClassName}
                      onClick={handleOpenPollingSettings}
                    >
                      {t("empty.pollingSettingsLink")}
                    </button>
                  </>
                ) : (
                  t("empty.description")
                )
              ) : null
            }
            action={{
              label: showNoAccountsSetup
                ? t("empty.addAccount")
                : t("actions.checkNow"),
              loadingLabel: showNoAccountsSetup
                ? undefined
                : t("common:status.checking"),
              onClick: showNoAccountsSetup
                ? handleOpenAccountManagement
                : () =>
                    void handleCheckNow(
                      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsEmptyState,
                    ),
              disabled: showNoAccountsSetup ? false : !canRunManualCheck,
              loading: showNoAccountsSetup ? false : isChecking,
              leftIcon: showNoAccountsSetup ? undefined : (
                <RefreshCcw className="h-4 w-4" />
              ),
            }}
          />
        </ProductAnalyticsScope>
      ) : (
        <SiteAnnouncementsList
          records={filteredRecords}
          expandedIds={expandedIds}
          navigationTargetId={routeParams?.recordId}
          onToggleExpanded={toggleExpanded}
          onMarkRead={handleMarkRead}
        />
      )}
    </div>
  )
}
