import type { TFunction } from "i18next"
import { AlertTriangle } from "lucide-react"
import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { Badge, Button } from "~/components/ui"
import { cn } from "~/lib/utils"
import type { ProductAnnouncement } from "~/services/productAnnouncements/types"

import {
  PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS,
  trackProductAnnouncementAction,
} from "./analytics"
import {
  getProductAnnouncementSeverityLabel,
  PRODUCT_ANNOUNCEMENT_SEVERITY_STYLES,
} from "./presentation"

interface ProductAnnouncementBannerProps {
  notice: ProductAnnouncement
  additionalCount: number
  onViewAll: () => void
  onDismiss: (id: string, revision: number) => void
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
 * Resolves the plural summary with static keys so every locale keeps the same key family.
 */
function getAdditionalSummary(
  additionalCount: number,
  t: TFunction<"productAnnouncements">,
) {
  if (additionalCount === 1) {
    return t("summary.additional_one", { riskCount: additionalCount })
  }

  return t("summary.additional_other", { riskCount: additionalCount })
}

/**
 * Renders the highest-priority active risk notice as a compact Overview banner.
 */
export function ProductAnnouncementBanner({
  notice,
  additionalCount,
  onViewAll,
  onDismiss,
}: ProductAnnouncementBannerProps) {
  const { t } = useTranslation("productAnnouncements")
  const activeCount = additionalCount + 1
  const handleViewAll = () => {
    trackProductAnnouncementAction({
      actionKind: PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS.OpenList,
      activeCount,
      notice,
      surface: "options-banner",
    })
    onViewAll()
  }
  const handleDismiss = () => {
    trackProductAnnouncementAction({
      actionKind: PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS.Dismiss,
      activeCount,
      notice,
      surface: "options-banner",
    })
    onDismiss(notice.id, notice.revision)
  }
  const severityStyles = PRODUCT_ANNOUNCEMENT_SEVERITY_STYLES[notice.severity]

  return (
    <section
      className={cn(
        "dark:bg-dark-bg-secondary/95 dark:text-dark-text-primary overflow-hidden rounded-lg border border-slate-200/80 bg-white/95 p-3 text-slate-900 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:shadow-black/20",
      )}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              severityStyles.icon,
            )}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="min-w-0 text-sm leading-5 font-semibold break-words">
                {notice.title}
              </h2>
              <Badge
                variant={SEVERITY_BADGE_VARIANTS[notice.severity]}
                size="sm"
                className={cn("shrink-0", severityStyles.badge)}
              >
                {getProductAnnouncementSeverityLabel(notice.severity, t)}
              </Badge>
            </div>
            <p className="dark:text-dark-text-secondary text-sm leading-5 break-words whitespace-pre-wrap text-slate-600">
              {notice.message}
            </p>
            {additionalCount > 0 ? (
              <p className="dark:text-dark-text-tertiary text-xs leading-5 font-medium text-slate-500">
                {getAdditionalSummary(additionalCount, t)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="dark:text-dark-text-secondary h-8 border-slate-200 bg-white/70 px-3 text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
            onClick={handleViewAll}
          >
            {t("actions.viewAll")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="dark:text-dark-text-secondary h-8 px-3 text-xs text-slate-600 hover:bg-slate-100 dark:hover:bg-white/[0.08]"
            onClick={handleDismiss}
          >
            {t("actions.dismiss")}
          </Button>
        </div>
      </div>
    </section>
  )
}
