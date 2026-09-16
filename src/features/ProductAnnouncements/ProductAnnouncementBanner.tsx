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
        "border-border/80 bg-card/95 text-foreground shadow-border/60 dark:border-foreground/10 dark:shadow-shadow/20 py-density-3 overflow-hidden rounded-lg border px-3 shadow-sm",
      )}
    >
      <div className="gap-y-density-3 flex min-w-0 flex-col gap-x-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="gap-y-density-3 flex min-w-0 items-start gap-x-3">
          <span
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              severityStyles.icon,
            )}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="space-y-density-1 min-w-0">
            <div className="gap-y-density-2 flex min-w-0 flex-wrap items-center gap-x-2">
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
            <p className="dark:text-secondary-foreground text-muted-foreground text-sm leading-5 break-words whitespace-pre-wrap">
              {notice.message}
            </p>
            {additionalCount > 0 ? (
              <p className="text-muted-foreground text-xs leading-5 font-medium">
                {getAdditionalSummary(additionalCount, t)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="gap-y-density-2 flex shrink-0 flex-wrap items-center gap-x-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border bg-card/70 text-secondary-foreground hover:bg-surface-subtle dark:border-foreground/10 dark:bg-foreground/[0.04] dark:hover:bg-foreground/[0.08] min-h-(--density-control-sm) px-3 text-xs"
            onClick={handleViewAll}
          >
            {t("actions.viewAll")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="dark:text-secondary-foreground text-muted-foreground hover:bg-muted dark:hover:bg-foreground/[0.08] min-h-(--density-control-sm) px-3 text-xs"
            onClick={handleDismiss}
          >
            {t("actions.dismiss")}
          </Button>
        </div>
      </div>
    </section>
  )
}
