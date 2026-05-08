import { Bell, CheckCheck, Inbox, Megaphone, RefreshCcw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"
import { EmptyState } from "~/components/ui/EmptyState"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import type {
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

  const handleCheckNow = async () => {
    setIsChecking(true)
    try {
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.SiteAnnouncementsCheckNow,
      })
      const success = response?.success === true
      showResultToast({
        success,
        successFallback: t("messages.checkCompleted"),
        errorFallback: response?.error ?? t("messages.checkFailed"),
      })
      await loadData()
    } catch (error) {
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
    const response = await sendRuntimeMessage({
      action: RuntimeActionIds.SiteAnnouncementsMarkRead,
      recordId,
    })
    if (response?.success) {
      await loadData()
    }
  }

  const handleMarkAllRead = async () => {
    const response = await sendRuntimeMessage({
      action: RuntimeActionIds.SiteAnnouncementsMarkAllRead,
      siteKey: siteKey === "all" ? undefined : siteKey,
    })
    if (response?.success) {
      await loadData()
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
          <>
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
              onClick={() => void handleCheckNow()}
              leftIcon={<RefreshCcw className="h-4 w-4" />}
            >
              {t("actions.checkNow")}
            </Button>
          </>
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
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title={records.length === 0 ? t("empty.title") : t("empty.filtered")}
          description={records.length === 0 ? t("empty.description") : null}
          action={{
            label: t("actions.checkNow"),
            onClick: () => void handleCheckNow(),
            loading: isChecking,
            leftIcon: <RefreshCcw className="h-4 w-4" />,
          }}
        />
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
