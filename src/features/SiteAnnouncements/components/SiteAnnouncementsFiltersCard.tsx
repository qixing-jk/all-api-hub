import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"

import type { UnreadFilter } from "../types"

interface SiteAnnouncementsFiltersCardProps {
  siteKey: string
  siteType: string
  unreadFilter: UnreadFilter
  siteOptions: Array<[string, string]>
  siteTypeOptions: string[]
  filteredCount: number
  totalCount: number
  notifiedCount: number
  onSiteKeyChange: (value: string) => void
  onSiteTypeChange: (value: string) => void
  onUnreadFilterChange: (value: UnreadFilter) => void
}

/**
 * Renders the filter controls and filtered-result summary for announcements.
 */
export function SiteAnnouncementsFiltersCard({
  siteKey,
  siteType,
  unreadFilter,
  siteOptions,
  siteTypeOptions,
  filteredCount,
  totalCount,
  notifiedCount,
  onSiteKeyChange,
  onSiteTypeChange,
  onUnreadFilterChange,
}: SiteAnnouncementsFiltersCardProps) {
  const { t } = useTranslation("siteAnnouncements")

  return (
    <div className="dark:bg-dark-bg-secondary mb-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-white/10">
      <div className="grid gap-3 md:grid-cols-3">
        <Select value={siteKey} onValueChange={onSiteKeyChange}>
          <SelectTrigger>
            <SelectValue placeholder={t("filters.site")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allSites")}</SelectItem>
            {siteOptions.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={siteType} onValueChange={onSiteTypeChange}>
          <SelectTrigger>
            <SelectValue placeholder={t("filters.siteType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allSiteTypes")}</SelectItem>
            {siteTypeOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={unreadFilter}
          onValueChange={(value) => onUnreadFilterChange(value as UnreadFilter)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("filters.readState")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allReadStates")}</SelectItem>
            <SelectItem value="unread">{t("filters.unread")}</SelectItem>
            <SelectItem value="read">{t("filters.read")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 flex flex-col gap-1 border-t border-gray-100 pt-3 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:text-gray-400">
        <span>
          {t("summary.filtered", {
            count: filteredCount,
            total: totalCount,
          })}
        </span>
        {notifiedCount > 0 && (
          <span>
            {t("summary.notified", {
              count: notifiedCount,
            })}
          </span>
        )}
      </div>
    </div>
  )
}
