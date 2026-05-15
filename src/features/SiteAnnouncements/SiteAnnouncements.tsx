import { Bell, CheckCheck, Inbox, Megaphone, RefreshCcw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"
import { EmptyState } from "~/components/ui/EmptyState"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsSurfaceId,
} from "~/services/productAnalytics/events"
import type {
  SiteAnnouncementCheckResult,
  SiteAnnouncementRecord,
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { showResultToast } from "~/utils/core/toastHelpers"

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

/**
 * Options page for locally cached provider-site announcements.
 */
export default function SiteAnnouncementsPage({
  routeParams,
  refreshKey,
}: SiteAnnouncementsPageProps) {
  const { t } = useTranslation("siteAnnouncements")
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

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [recordsResponse, statusResponse] = await Promise.all([
        sendRuntimeMessage({
          action: RuntimeActionIds.SiteAnnouncementsListRecords,
        }),
        sendRuntimeMessage({
          action: RuntimeActionIds.SiteAnnouncementsGetStatus,
        }),
      ])

      setRecords(recordsResponse?.data ?? [])
      setStatus(statusResponse?.data ?? [])
    } catch (error) {
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
  const unreadCount = records.filter((record) => !record.read).length
  const notifiedCount = records.filter((record) => record.notifiedAt).length
  const affectedSiteCount = siteOptions.length

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
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.SiteAnnouncementsCheckNow,
      })
      const success = response?.success === true
      const checkResult = response?.data as
        | SiteAnnouncementCheckResult
        | null
        | undefined
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
        successFallback: t("messages.checkCompleted"),
        errorFallback: response?.error ?? t("messages.checkFailed"),
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
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.SiteAnnouncementsMarkRead,
        recordId,
      })
      if (response?.success) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        await loadData()
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      }
    } catch {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
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
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.SiteAnnouncementsMarkAllRead,
        siteKey: siteKey === "all" ? undefined : siteKey,
      })
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
      }
    } catch {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
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

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        icon={Megaphone}
        title={t("title")}
        description={t("description")}
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
              onClick={() =>
                void handleCheckNow(
                  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsPage,
                )
              }
              leftIcon={<RefreshCcw className="h-4 w-4" />}
            >
              {t("actions.checkNow")}
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
              records.length === 0 ? t("empty.title") : t("empty.filtered")
            }
            description={records.length === 0 ? t("empty.description") : null}
            action={{
              label: t("actions.checkNow"),
              onClick: () =>
                void handleCheckNow(
                  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsEmptyState,
                ),
              loading: isChecking,
              leftIcon: <RefreshCcw className="h-4 w-4" />,
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
