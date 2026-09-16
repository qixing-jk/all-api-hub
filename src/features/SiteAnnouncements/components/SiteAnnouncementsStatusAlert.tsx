import { Info, ShieldAlert } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "~/lib/utils"
import type { SiteAnnouncementSiteState } from "~/types/siteAnnouncements"

import { formatDateTime } from "../utils"

interface SiteAnnouncementsStatusAlertProps {
  status: SiteAnnouncementSiteState
}

/**
 * Shows the selected site's latest announcement polling status when it is not healthy.
 */
export function SiteAnnouncementsStatusAlert({
  status,
}: SiteAnnouncementsStatusAlertProps) {
  const { t } = useTranslation("siteAnnouncements")

  if (status.status === "success") {
    return null
  }

  const unsupported = status.status === "unsupported"
  const Icon = unsupported ? Info : ShieldAlert

  return (
    <div
      role={unsupported ? "status" : "alert"}
      className={cn(
        "mb-density-4 gap-y-density-3 py-density-3 flex gap-x-3 rounded-md border px-4 text-sm",
        unsupported
          ? "border-info-border bg-info-soft text-info-soft-foreground"
          : "border-destructive-border bg-destructive-soft text-destructive-soft-foreground",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">
          {status.status === "unsupported"
            ? t("status.unsupportedTitle")
            : t("status.failedTitle")}
        </p>
        <p className="mt-density-1 break-words">
          {status.status === "unsupported"
            ? t("status.unsupported")
            : t("status.failed", {
                error: status.lastError ?? "-",
              })}
        </p>
        <p className="mt-density-1 text-xs">
          {t("status.lastChecked", {
            time: formatDateTime(status.lastCheckedAt),
          })}
        </p>
      </div>
    </div>
  )
}
