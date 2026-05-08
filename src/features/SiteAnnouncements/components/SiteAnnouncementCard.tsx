import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Inbox,
} from "lucide-react"
import { type KeyboardEvent, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"

import { Badge, Button, Card } from "~/components/ui"
import { cn } from "~/lib/utils"
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
    <Card
      className={cn(
        "group overflow-hidden border-gray-200 transition-all hover:shadow-md dark:border-white/10",
        expanded && "ring-1 ring-blue-500/30 dark:ring-blue-400/30",
      )}
    >
      <div className="flex flex-col">
        <div
          className="flex cursor-pointer items-start gap-4 p-4 transition-colors hover:bg-gray-50/50 dark:hover:bg-white/5"
          onClick={handleToggle}
          onKeyDown={handleHeaderKeyDown}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-controls={detailsRegionId}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    className={cn(
                      "dark:text-dark-text-primary min-w-0 text-base leading-6 font-semibold break-words text-gray-900",
                      !expanded && "line-clamp-2",
                    )}
                    title={display.title}
                  >
                    {display.title}
                  </h3>
                  <div className="flex shrink-0 gap-1.5">
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
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {display.preview}
                  </p>
                )}
              </div>

              <div className="hidden shrink-0 lg:flex lg:items-center lg:gap-2">
                <Button
                  asChild
                  size="icon-sm"
                  variant="ghost"
                  className="h-8 w-8 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-400/10 dark:hover:text-blue-400"
                  title={t("actions.viewSource")}
                >
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("actions.viewSource")}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ExternalLink className="h-5 w-5" />
                  </a>
                </Button>
                {!expanded && !record.read && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="h-8 w-8 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-400/10 dark:hover:text-blue-400"
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
                    "h-8 w-8 rounded-full bg-gray-100 text-gray-400 transition-all dark:bg-white/10",
                    expanded
                      ? "pointer-events-none rotate-180 bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
                      : "group-hover:bg-gray-200 dark:group-hover:bg-white/20",
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleToggle()
                  }}
                  aria-label={expanded ? undefined : t("actions.expand")}
                  aria-expanded={expanded}
                  tabIndex={expanded ? -1 : undefined}
                  title={expanded ? undefined : t("actions.expand")}
                >
                  <ChevronDown className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="dark:text-dark-text-tertiary mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
              <span className="flex items-center gap-1.5 truncate font-medium text-gray-700 dark:text-gray-200">
                <Inbox className="h-3.5 w-3.5" />
                {record.siteName || record.baseUrl}
              </span>
              <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
                {record.siteType}
              </span>
              <span className="inline-flex items-center gap-1.5">
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
            className="animate-in fade-in slide-in-from-top-2 px-4 pb-4 duration-200"
          >
            <div className="mb-4 h-px bg-gray-100 dark:bg-white/5" />
            <div className="dark:bg-dark-bg-tertiary max-h-96 overflow-auto rounded-md bg-gray-50 p-4 shadow-inner">
              <AnnouncementMarkdown content={display.body} />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button
                asChild
                size="sm"
                variant="outline"
                leftIcon={<ExternalLink className="h-4 w-4" />}
              >
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  {t("actions.viewSource")}
                </a>
              </Button>
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
              >
                {t("actions.collapse")}
              </Button>
            </div>
          </div>
        )}

        {!expanded && !record.read && (
          <div className="flex justify-end gap-2 px-4 pb-3 lg:hidden">
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-400/10"
              leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
            >
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                {t("actions.viewSource")}
              </a>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-400/10"
              onClick={handleMarkRead}
              leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
            >
              {t("actions.markRead")}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
