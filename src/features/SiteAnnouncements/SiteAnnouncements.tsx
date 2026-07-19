import { Bell, CheckCheck, Inbox, Megaphone, RefreshCcw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"
import { EmptyState } from "~/components/ui/EmptyState"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { accountStorage } from "~/services/accounts/accountStorage"
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
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/core/toastHelpers"
import { openSettingsTab, pushWithinOptionsPage } from "~/utils/navigation"

import { SiteAnnouncementsFiltersCard } from "./components/SiteAnnouncementsFiltersCard"
import { SiteAnnouncementsList } from "./components/SiteAnnouncementsList"
import { SiteAnnouncementsStatusAlert } from "./components/SiteAnnouncementsStatusAlert"
import { SiteAnnouncementsSummaryMetrics } from "./components/SiteAnnouncementsSummaryMetrics"
import type { AnnouncementMetric, UnreadFilter } from "./types"
import {
  buildSiteOptions,
  buildSiteTypeOptions,
  filterSiteAnnouncements,
  isSub2ApiAnnouncement,
} from "./utils"

interface SiteAnnouncementsPageProps {
  routeParams?: Record<string, string>
  refreshKey?: number
}

const textLinkClassName =
  "font-medium text-blue-600 underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-400"

const logger = createLogger("SiteAnnouncementsPage")

/**
 * Counts enabled accounts for announcement empty-state routing.
 */
async function resolveEnabledAccountCount(): Promise<number | null> {
  try {
    const accounts = await accountStorage.getAllAccounts()
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
  const { t } = useTranslation(["siteAnnouncements", "common"])
  const { siteAnnouncementNotifications } = useUserPreferencesContext()
  const [records, setRecords] = useState<SiteAnnouncementRecord[]>([])
  const [status, setStatus] = useState<SiteAnnouncementSiteState[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const [siteKey, setSiteKey] = useState("all")
  const [siteType, setSiteType] = useState("all")
  const [unreadFilter, setUnreadFilter] = useState<UnreadFilter>("all")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(routeParams?.recordId ? [routeParams.recordId] : []),
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [enabledAccountCount, setEnabledAccountCount] = useState<number | null>(
    null,
  )

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
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
            t("messages.loadFailed"),
          ),
          errorFallback: t("messages.loadFailed"),
        })
        setLoadError(t("messages.loadFailed"))
        return
      }

      if (!statusResponse.success) {
        showResultToast({
          success: false,
          message: getRuntimeMessageFailureMessage(
            statusResponse,
            t("messages.loadFailed"),
          ),
          errorFallback: t("messages.loadFailed"),
        })
        setLoadError(t("messages.loadFailed"))
        return
      }

      setRecords(recordsResponse.data)
      setStatus(statusResponse.data)
    } catch (error) {
      setLoadError(t("messages.loadFailed"))
      showResultToast({
        success: false,
        message: getErrorMessage(error),
        errorFallback: t("messages.loadFailed"),
      })
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadData()
  }, [loadData, refreshKey])

  useEffect(() => {
    if (routeParams?.recordId) {
      setExpandedIds((prev) => new Set(prev).add(routeParams.recordId!))
    }
  }, [routeParams?.recordId])

  const siteOptions = useMemo(
    () => buildSiteOptions(records, status),
    [records, status],
  )

  const siteTypeOptions = useMemo(
    () => buildSiteTypeOptions(records),
    [records],
  )

  const filteredRecords = useMemo(
    () => filterSiteAnnouncements(records, { siteKey, siteType, unreadFilter }),
    [records, siteKey, siteType, unreadFilter],
  )

  const selectedStatus = status.find((item) => item.siteKey === siteKey)
  const manualCheckAccountIds = useMemo(
    () => [...new Set(filteredRecords.map((record) => record.accountId))],
    [filteredRecords],
  )
  const shouldScopeManualCheck = records.length > 0
  const canRunManualCheck =
    !isLoading && (!shouldScopeManualCheck || manualCheckAccountIds.length > 0)
  const unreadCount = records.filter((record) => !record.read).length
  const notifiedCount = records.filter((record) => record.notifiedAt).length
  const affectedSiteCount = siteOptions.filter(
    (option) => option.announcementCount > 0,
  ).length
  const isPollingDisabled = !siteAnnouncementNotifications.enabled
  const hasCachedRecords = records.length > 0
  const showNoAccountsSetup = enabledAccountCount === 0 && !hasCachedRecords

  const metrics = useMemo<AnnouncementMetric[]>(
    () => [
      {
        key: "total",
        label: t("summary.total"),
        value: records.length,
        icon: Megaphone,
        tone: "blue",
      },
      {
        key: "unread",
        label: t("summary.unread"),
        value: unreadCount,
        icon: Inbox,
        tone: "amber",
      },
      {
        key: "sites",
        label: t("summary.sites"),
        value: affectedSiteCount,
        icon: Bell,
        tone: "emerald",
      },
    ],
    [affectedSiteCount, records.length, t, unreadCount],
  )

  const handleCheckNow = async (surfaceId: ProductAnalyticsSurfaceId) => {
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
      if (success) {
        if (checkInsights) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
            insights: checkInsights,
          })
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
      showResultToast({
        success,
        message: getRuntimeMessageToastMessage(response),
        successFallback: t("messages.checkCompleted"),
        errorFallback: t("messages.checkFailed"),
      })
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
      const response = await sendSiteAnnouncementsMessage(
        SiteAnnouncementsMessageTypes.MarkAllRead,
        {
          siteKey: siteKey === "all" ? undefined : siteKey,
        },
      )
      if (response?.success) {
        if (typeof response.data === "number") {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
            insights: { itemCount: response.data },
          })
        } else {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        }
        await loadData()
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
        showResultToast({
          success: false,
          message: getRuntimeMessageToastMessage(response),
          errorFallback: t("messages.markAllReadFailed"),
        })
      }
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

    if (isExpanding && isSub2ApiAnnouncement(record) && !record.read) {
      void handleMarkRead(record.id)
    }
  }

  const handleOpenPollingSettings = useCallback(() => {
    void openSettingsTab("general", {
      anchor: SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
      preserveHistory: true,
    })
  }, [])

  const handleOpenAccountManagement = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.ACCOUNT}`)
  }, [])

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        icon={Megaphone}
        title={t("title")}
        titleActions={
          <OptionsPageSettingsTitleAction
            tabId="general"
            anchor={SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED}
            label={t("actions.pollingSettings")}
          />
        }
        description={
          <>
            <span>
              {t(
                siteAnnouncementNotifications.enabled
                  ? "description.enabledSummary"
                  : "description.disabledSummary",
              )}
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
        className="mb-5"
        actions={
          <ProductAnalyticsScope
            entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
            featureId={PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements}
            surfaceId={
              PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsPage
            }
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleMarkAllRead()}
              disabled={unreadCount === 0}
              leftIcon={<CheckCheck className="h-4 w-4" />}
            >
              {t("actions.markAllRead")}
            </Button>
            <Button
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

      <SiteAnnouncementsSummaryMetrics metrics={metrics} />

      <SiteAnnouncementsFiltersCard
        siteKey={siteKey}
        siteType={siteType}
        unreadFilter={unreadFilter}
        siteOptions={siteOptions}
        siteTypeOptions={siteTypeOptions}
        filteredCount={filteredRecords.length}
        totalCount={records.length}
        notifiedCount={notifiedCount}
        onSiteKeyChange={setSiteKey}
        onSiteTypeChange={setSiteType}
        onUnreadFilterChange={setUnreadFilter}
      />

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
                : !hasCachedRecords
                  ? t("empty.title")
                  : t("empty.filtered")
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
          onToggleExpanded={toggleExpanded}
          onMarkRead={handleMarkRead}
        />
      )}
    </div>
  )
}
