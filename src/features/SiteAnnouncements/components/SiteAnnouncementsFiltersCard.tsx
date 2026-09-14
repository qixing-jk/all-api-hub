import { useTranslation } from "react-i18next"

import {
  SearchableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"

import type { UnreadFilter } from "../types"
import type { SiteAnnouncementSiteOption } from "../utils"

interface SiteAnnouncementsFiltersCardProps {
  siteKey: string
  siteType: string
  unreadFilter: UnreadFilter
  siteOptions: SiteAnnouncementSiteOption[]
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
    <div className="border-border bg-card dark:border-foreground/10 mb-4 rounded-lg border p-3 shadow-sm">
      <div className="grid gap-3 md:grid-cols-3">
        <SearchableSelect
          value={siteKey}
          onChange={onSiteKeyChange}
          options={[
            {
              value: "all",
              label: t("filters.allSites"),
            },
            ...siteOptions.map((option) => ({
              value: option.value,
              label: option.label,
              suffix: (
                <span
                  aria-hidden="true"
                  className="text-muted-foreground text-xs tabular-nums"
                >
                  {option.announcementCount}
                </span>
              ),
            })),
          ]}
          placeholder={t("filters.site")}
          searchPlaceholder={t("filters.searchSite")}
          aria-label={t("filters.site")}
        />

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

      <div className="border-border-subtle text-muted-foreground dark:border-foreground/10 mt-3 flex flex-col gap-1 border-t pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
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
