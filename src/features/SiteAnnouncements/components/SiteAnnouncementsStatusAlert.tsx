import { ShieldAlert } from "lucide-react"
import { useTranslation } from "react-i18next"

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

  return (
    <div className="border-warning-border bg-warning-soft text-warning-soft-foreground mb-4 flex gap-3 rounded-md border px-4 py-3 text-sm">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">
          {status.status === "unsupported"
            ? t("status.unsupportedTitle")
            : t("status.failedTitle")}
        </p>
        <p className="mt-1 break-words">
          {status.status === "unsupported"
            ? t("status.unsupported")
            : t("status.failed", {
                error: status.lastError ?? "-",
              })}
        </p>
        <p className="text-warning-text mt-1 text-xs">
          {t("status.lastChecked", {
            time: formatDateTime(status.lastCheckedAt),
          })}
        </p>
      </div>
    </div>
  )
}
