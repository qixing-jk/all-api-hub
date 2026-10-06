import { Inbox, Megaphone } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardContent, SearchableSelect } from "~/components/ui"
import { cn } from "~/lib/utils"

import type { UnreadFilter } from "../types"
import type { SiteAnnouncementSiteOption } from "../utils"

interface SiteAnnouncementsOverviewCardProps {
  siteKey: string
  unreadFilter: UnreadFilter
  siteOptions: SiteAnnouncementSiteOption[]
  /**
   * The unscoped total across every site, used for the "All sites" row so its
   * count stays the sum of the per-site counts below it.
   */
  allSitesCount: number
  totalCount: number
  unreadCount: number
  onSiteKeyChange: (value: string) => void
  onUnreadFilterChange: (value: UnreadFilter) => void
}

/**
 * Renders the announcement overview: the site entry point plus the two
 * clickable counters that double as the read-state filter.
 */
export function SiteAnnouncementsOverviewCard({
  siteKey,
  unreadFilter,
  siteOptions,
  allSitesCount,
  totalCount,
  unreadCount,
  onSiteKeyChange,
  onUnreadFilterChange,
}: SiteAnnouncementsOverviewCardProps) {
  const { t } = useTranslation("siteAnnouncements")

  const stats: Array<{
    key: UnreadFilter
    label: string
    value: number
    icon: typeof Megaphone
    tone: "primary" | "info"
  }> = [
    {
      key: "all",
      label: t("summary.total"),
      value: totalCount,
      icon: Megaphone,
      tone: "primary",
    },
    {
      key: "unread",
      label: t("summary.unread"),
      value: unreadCount,
      icon: Inbox,
      tone: "info",
    },
  ]

  return (
    <Card className="mb-density-4" padding="none">
      <CardContent className="py-density-4 px-4 sm:px-5">
        <div className="gap-y-density-3 flex flex-wrap items-start justify-between gap-x-3">
          <div className="min-w-0">
            <h2 className="text-foreground text-base leading-6 font-semibold">
              {t("overview.title")}
            </h2>
            <p className="text-muted-foreground mt-density-1 text-xs leading-5">
              {t("overview.description")}
            </p>
          </div>

          {/* Floating over the card: the trigger is the whole site filter, and
              its popover must not reserve layout width from the stats below. */}
          <SearchableSelect
            value={siteKey}
            onChange={onSiteKeyChange}
            options={[
              {
                value: "all",
                label: t("filters.allSites"),
                suffix: (
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground text-xs tabular-nums"
                  >
                    {allSitesCount}
                  </span>
                ),
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
            className="w-full shrink-0 sm:w-56"
          />
        </div>

        <div className="mt-density-4 gap-y-density-3 grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          {stats.map((stat) => {
            const isActive = unreadFilter === stat.key
            const Icon = stat.icon

            return (
              <button
                key={stat.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => onUnreadFilterChange(stat.key)}
                className={cn(
                  "corners-concentric gap-y-density-3 py-density-3 focus-visible:ring-ring flex items-center gap-x-3 rounded-lg border px-4 text-left transition-colors outline-none focus-visible:ring-2",
                  isActive
                    ? "border-primary-soft-border bg-primary-soft"
                    : "border-border bg-surface-subtle hover:border-border-strong dark:bg-card/50",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1",
                    stat.tone === "primary"
                      ? "bg-primary-soft text-primary-soft-foreground ring-primary-soft-border"
                      : "bg-info-soft text-info-soft-foreground ring-info-border",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="text-muted-foreground block truncate text-xs font-medium">
                    {stat.label}
                  </span>
                  <span
                    className={cn(
                      "mt-density-1 block text-2xl font-semibold tabular-nums",
                      isActive
                        ? "text-primary-soft-foreground"
                        : "text-foreground",
                    )}
                  >
                    {stat.value}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
