import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Inbox,
} from "lucide-react"
import { type ComponentProps, type KeyboardEvent, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Badge, Button, Card } from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { cn } from "~/lib/utils"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { buildAnnouncementDisplayText } from "~/services/siteAnnouncements/text"
import type { SiteAnnouncementRecord } from "~/types/siteAnnouncements"

import { AnnouncementMarkdown } from "../AnnouncementMarkdown"
import {
  formatAnnouncementTimestamp,
  formatSub2ApiRelativeTimestamp,
  getAnnouncementSourceUrl,
  isSub2ApiAnnouncement,
} from "../utils"

interface SiteAnnouncementCardProps {
  record: SiteAnnouncementRecord
  expanded: boolean
  onToggleExpanded: (record: SiteAnnouncementRecord) => void
  onMarkRead: (recordId: string) => void | Promise<void>
}

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const cardSurfaceId = PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementCard

/** Shares source navigation and analytics across the card's responsive presentations. */
function AnnouncementSourceLink({
  sourceUrl,
  label,
  iconOnly = false,
  ...buttonProps
}: {
  sourceUrl: string | null
  label: string
  iconOnly?: boolean
} & Pick<
  ComponentProps<typeof Button>,
  "size" | "variant" | "className" | "leftIcon"
>) {
  if (!sourceUrl) return null

  return (
    <Button
      {...buttonProps}
      asChild
      title={iconOnly ? label : undefined}
      analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.OpenAnnouncementSource}
    >
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={iconOnly ? label : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        {iconOnly ? <WorkflowTransitionIcon className="h-5 w-5" /> : label}
      </a>
    </Button>
  )
}

/**
 * Renders a single cached announcement with expand/collapse and read actions.
 */
export function SiteAnnouncementCard({
  record,
  expanded,
  onToggleExpanded,
  onMarkRead,
}: SiteAnnouncementCardProps) {
  const { t } = useTranslation("siteAnnouncements")
  const isSub2Api = isSub2ApiAnnouncement(record)
  const display = buildAnnouncementDisplayText(record, {
    previewLength: 120,
  })
  const sourceUrl = getAnnouncementSourceUrl(record)
  const detailsRegionId = `site-announcement-content-${record.id}`

  const handleToggle = () => {
    onToggleExpanded(record)
  }

  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      handleToggle()
    }
  }

  const handleMarkRead = (event: MouseEvent) => {
    event.stopPropagation()
    void onMarkRead(record.id)
  }

  return (
    <ProductAnalyticsScope
      entrypoint={optionsEntrypoint}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements}
      surfaceId={cardSurfaceId}
    >
      <Card
        className={cn(
          "group border-border dark:border-foreground/10 overflow-hidden transition-all hover:shadow-md",
          expanded && "ring-theme-500/30 dark:ring-theme-400/30 ring-1",
        )}
      >
        <div className="flex flex-col">
          <div
            className="hover:bg-surface-subtle/50 dark:hover:bg-foreground/5 gap-y-density-4 py-density-4 flex cursor-pointer items-start gap-x-4 px-4 transition-colors"
            onClick={handleToggle}
            onKeyDown={handleHeaderKeyDown}
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            aria-controls={detailsRegionId}
          >
            <div className="min-w-0 flex-1">
              <div className="gap-y-density-4 flex items-start justify-between gap-x-4">
                <div className="min-w-0 flex-1">
                  <div className="gap-y-density-2 flex flex-wrap items-center gap-x-2">
                    <h3
                      className={cn(
                        "text-foreground min-w-0 text-base leading-6 font-semibold break-words",
                        !expanded && "line-clamp-2",
                      )}
                      title={display.title}
                    >
                      {display.title}
                    </h3>
                    <div className="gap-y-density-1-5 flex shrink-0 gap-x-1.5">
                      {!record.read && (
                        <Badge variant="warning" size="sm">
                          {t("badges.unread")}
                        </Badge>
                      )}
                      {record.notifiedAt && (
                        <Badge variant="success" size="sm">
                          {t("badges.notified")}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {display.preview && !expanded && (
                    <p className="text-muted-foreground mt-density-1 line-clamp-2 text-sm leading-6">
                      {display.preview}
                    </p>
                  )}
                </div>

                <div className="lg:gap-y-density-2 hidden shrink-0 lg:flex lg:items-center lg:gap-x-2">
                  <AnnouncementSourceLink
                    sourceUrl={sourceUrl}
                    label={t("actions.viewSource")}
                    iconOnly
                    size="icon-sm"
                    variant="ghost"
                    className="text-faint-foreground hover:bg-theme-50 hover:text-theme-600 dark:hover:bg-theme-400/10 dark:hover:text-theme-400 h-(--density-control-sm) w-(--density-control-sm)"
                  />
                  {!expanded && !record.read && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-faint-foreground hover:bg-theme-50 hover:text-theme-600 dark:hover:bg-theme-400/10 dark:hover:text-theme-400 h-(--density-control-sm) w-(--density-control-sm)"
                      onClick={handleMarkRead}
                      title={t("actions.markRead")}
                    >
                      <CheckCircle2 className="h-5 w-5" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className={cn(
                      "bg-muted text-faint-foreground dark:bg-foreground/10 h-(--density-control-sm) w-(--density-control-sm) rounded-full transition-all",
                      expanded
                        ? "bg-theme-100 text-theme-600 dark:bg-theme-500/20 dark:text-theme-400 pointer-events-none rotate-180"
                        : "group-hover:bg-secondary dark:group-hover:bg-foreground/20",
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleToggle()
                    }}
                    aria-label={expanded ? undefined : t("actions.expand")}
                    aria-expanded={expanded}
                    tabIndex={expanded ? -1 : undefined}
                    title={expanded ? undefined : t("actions.expand")}
                    analyticsAction={
                      expanded
                        ? undefined
                        : PRODUCT_ANALYTICS_ACTION_IDS.ExpandAnnouncement
                    }
                  >
                    <ChevronDown className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <div className="text-muted-foreground mt-density-2-5 gap-y-density-1-5 flex flex-wrap items-center gap-x-4 text-xs">
                <span className="text-secondary-foreground gap-y-density-1-5 flex items-center gap-x-1.5 truncate font-medium">
                  <Inbox className="h-3.5 w-3.5" />
                  {record.siteName || record.baseUrl}
                </span>
                <span className="bg-muted text-muted-foreground dark:bg-foreground/10 dark:text-secondary-foreground inline-flex items-center rounded-md px-1.5 py-0.5 font-medium">
                  {record.siteType}
                </span>
                <span className="gap-y-density-1-5 inline-flex items-center gap-x-1.5">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {isSub2Api
                    ? formatSub2ApiRelativeTimestamp(record)
                    : formatAnnouncementTimestamp(record)}
                </span>
              </div>
            </div>
          </div>

          {expanded && (
            <div
              id={detailsRegionId}
              className="animate-in fade-in slide-in-from-top-2 pb-density-4 px-4 duration-200"
            >
              <div className="bg-muted dark:bg-foreground/5 mb-density-4 h-px" />
              <div className="dark:bg-secondary bg-surface-subtle py-density-4 max-h-96 overflow-auto rounded-md px-4 shadow-inner">
                <AnnouncementMarkdown content={display.body} />
              </div>

              <div className="mt-density-4 gap-y-density-2 flex flex-wrap items-center justify-end gap-x-2">
                <AnnouncementSourceLink
                  sourceUrl={sourceUrl}
                  label={t("actions.viewSource")}
                  size="sm"
                  variant="outline"
                  leftIcon={<WorkflowTransitionIcon className="h-4 w-4" />}
                />
                {!record.read && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleMarkRead}
                    leftIcon={<CheckCircle2 className="h-4 w-4" />}
                  >
                    {t("actions.markRead")}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleToggle()
                  }}
                  leftIcon={<ChevronUp className="h-4 w-4" />}
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.CollapseAnnouncement
                  }
                >
                  {t("actions.collapse")}
                </Button>
              </div>
            </div>
          )}

          {!expanded && !record.read && (
            <div className="gap-y-density-2 pb-density-3 flex justify-end gap-x-2 px-4 lg:hidden">
              <AnnouncementSourceLink
                sourceUrl={sourceUrl}
                label={t("actions.viewSource")}
                size="sm"
                variant="ghost"
                className="text-theme-600 hover:bg-theme-50 dark:text-theme-400 dark:hover:bg-theme-400/10 min-h-(--density-control-sm) text-xs"
                leftIcon={<WorkflowTransitionIcon className="h-3.5 w-3.5" />}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-theme-600 hover:bg-theme-50 dark:text-theme-400 dark:hover:bg-theme-400/10 min-h-(--density-control-tight) text-xs"
                onClick={handleMarkRead}
                leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
              >
                {t("actions.markRead")}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </ProductAnalyticsScope>
  )
}
