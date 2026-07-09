import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Badge, Button } from "~/components/ui"
import { cn } from "~/lib/utils"
import type { ProductAnnouncement } from "~/services/productAnnouncements/types"

import {
  getProductAnnouncementSeverityLabel,
  PRODUCT_ANNOUNCEMENT_SEVERITY_STYLES,
} from "./presentation"
import {
  getProductAnnouncementDismissButtonTestId,
  getProductAnnouncementRestoreButtonTestId,
} from "./testIds"

interface ProductAnnouncementListProps {
  notices: ProductAnnouncement[]
  emptyMessage: string
  isLoading?: boolean
  testId: string
  onDismiss: (id: string, revision: number) => void
  onRestore: (id: string) => void | Promise<void>
  onOpenCta?: (notice: ProductAnnouncement) => void
}

type BadgeVariant = ComponentProps<typeof Badge>["variant"]

const SEVERITY_BADGE_VARIANTS: Record<
  ProductAnnouncement["severity"],
  BadgeVariant
> = {
  critical: "danger",
  warning: "warning",
  info: "info",
}

/**
 * Keeps CTA rendering limited to safe HTTPS navigation even if upstream validation changes.
 */
function isHttpsUrl(url: string) {
  try {
    return new URL(url).protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Renders a compact scrollable announcement list for the header popover.
 */
export function ProductAnnouncementList({
  notices,
  emptyMessage,
  isLoading = false,
  testId,
  onDismiss,
  onRestore,
  onOpenCta,
}: ProductAnnouncementListProps) {
  const { t } = useTranslation("productAnnouncements")

  if (isLoading) {
    return (
      <div
        data-testid={testId}
        className="py-6 text-center text-sm text-gray-500 dark:text-gray-400"
      >
        {t("loading")}
      </div>
    )
  }

  if (notices.length === 0) {
    return (
      <div
        data-testid={testId}
        className="py-6 text-center text-sm text-gray-500 dark:text-gray-400"
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div
      data-testid={testId}
      className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
    >
      {notices.map((notice) => {
        const cta = notice.cta && isHttpsUrl(notice.cta.url) ? notice.cta : null
        const dismissLabel = t("actions.dismissFor", { title: notice.title })
        const dismissAriaLabel =
          dismissLabel === "productAnnouncements:actions.dismissFor"
            ? `${t("actions.dismiss")} ${notice.title}`
            : dismissLabel
        const restoreLabel = t("actions.restoreFor", { title: notice.title })
        const restoreAriaLabel =
          restoreLabel === "productAnnouncements:actions.restoreFor"
            ? `${t("actions.restore")} ${notice.title}`
            : restoreLabel

        return (
          <article
            key={`${notice.id}:${notice.revision}`}
            className={cn(
              "dark:bg-dark-bg-secondary/95 relative overflow-hidden rounded-md border bg-white/95 p-3 shadow-sm shadow-slate-200/40 transition-colors dark:shadow-black/20",
              notice.seen
                ? "border-slate-200/80 dark:border-white/10"
                : "border-slate-300/80 dark:border-white/20",
            )}
          >
            <div className="flex min-w-0 items-start justify-between gap-2">
              <h3 className="dark:text-dark-text-primary min-w-0 flex-1 text-sm leading-5 font-medium break-words text-gray-900">
                {!notice.seen ? (
                  <>
                    <span
                      className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle dark:bg-blue-300"
                      aria-hidden="true"
                    />
                    <span className="sr-only">{t("labels.unread")} </span>
                  </>
                ) : null}
                <Badge
                  variant={SEVERITY_BADGE_VARIANTS[notice.severity]}
                  size="sm"
                  className={cn(
                    "mr-1.5 px-1.5 py-0 align-[0.0625rem] text-[0.625rem] leading-4 font-medium",
                    PRODUCT_ANNOUNCEMENT_SEVERITY_STYLES[notice.severity].badge,
                  )}
                >
                  {getProductAnnouncementSeverityLabel(notice.severity, t)}
                </Badge>
                {notice.title}
              </h3>
              {notice.dismissed ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-2 text-xs leading-none"
                  aria-label={restoreAriaLabel}
                  onClick={() => onRestore(notice.id)}
                  data-testid={getProductAnnouncementRestoreButtonTestId(
                    notice.id,
                  )}
                >
                  {t("actions.restore")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-2 text-xs leading-none"
                  aria-label={dismissAriaLabel}
                  onClick={() => onDismiss(notice.id, notice.revision)}
                  data-testid={getProductAnnouncementDismissButtonTestId(
                    notice.id,
                  )}
                >
                  {t("actions.dismiss")}
                </Button>
              )}
            </div>
            <p className="dark:text-dark-text-secondary mt-2 text-xs leading-5 break-words whitespace-pre-wrap text-gray-600">
              {notice.message}
            </p>
            {cta ? (
              <a
                href={cta.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex max-w-full items-center gap-1 text-xs font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-300"
                onClick={() => onOpenCta?.(notice)}
              >
                <span className="min-w-0 break-words">{cta.label}</span>
                <WorkflowTransitionIcon className="h-3 w-3 shrink-0" />
              </a>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
